// ============================================================================
//  Sovera tenant module — one isolated silo per customer.
//
//  Provisions, for a single tenant slug:
//    • Dedicated Postgres database on the shared Flex Server (schema isolation)
//    • Dedicated, immutable Blob container (per-tenant lifecycle)
//    • Dedicated Web PubSub hub with anonymous-deny policy
//    • Per-tenant APIM product + subscription (rate limit + quota)
//    • Tenant secrets in Key Vault (DB password, APIM subscription key)
//
//  This is the silo-per-tenant pattern enterprise/HDS customers ask for.
//  Run it after the shared platform (main.bicep) is deployed.
//
//  Scope: resourceGroup (the shared 'sovera' RG).
// ============================================================================
targetScope = 'resourceGroup'

// --------------------------------------------------------------------------
// Tenant identity
// --------------------------------------------------------------------------
@description('Lowercase tenant slug, 3-20 chars, [a-z0-9-]. Used in resource names.')
@minLength(3)
@maxLength(20)
param tenantSlug string

@description('Human-readable tenant display name (used in APIM product).')
param tenantDisplayName string

@description('Tenant tier — controls quotas and rate limits.')
@allowed([ 'starter', 'pro', 'enterprise' ])
param tier string = 'pro'

@description('Optional UUID for the tenant (sets the @claims.tid expected by RLS). Defaults to a deterministic GUID from the slug.')
param tenantId string = guid(resourceGroup().id, tenantSlug)

// --------------------------------------------------------------------------
// Shared platform references
// --------------------------------------------------------------------------
param postgresServerName string
param storageAccountName string
param webPubSubName string
param apimName string = ''
param keyVaultName string

@description('Object ID of the Entra group that owns this tenant (gets DB Entra-admin + KV access).')
param tenantAdminGroupObjectId string = ''

// --------------------------------------------------------------------------
// Variables
// --------------------------------------------------------------------------
var dbName = 'tnt_${replace(tenantSlug, '-', '_')}'
var containerName = 'tnt-${tenantSlug}'
var hubName = 'tnt_${replace(tenantSlug, '-', '_')}'
var productName = 'tenant-${tenantSlug}'
var subscriptionName = 'sub-${tenantSlug}'

// Tier-driven quotas
var tierLimits = {
  starter:    { rateLimitCalls: 60,   rateLimitPeriod: 60,   quotaCalls: 100000,    quotaPeriod: 86400, storageQuotaGB: 5,   maxClients: 50 }
  pro:        { rateLimitCalls: 600,  rateLimitPeriod: 60,   quotaCalls: 5000000,   quotaPeriod: 86400, storageQuotaGB: 250, maxClients: 1000 }
  enterprise: { rateLimitCalls: 6000, rateLimitPeriod: 60,   quotaCalls: 100000000, quotaPeriod: 86400, storageQuotaGB: 2000, maxClients: 10000 }
}
var t = tierLimits[tier]

var tenantTags = {
  workload: 'sovera'
  tenantSlug: tenantSlug
  tenantTier: tier
  dataResidency: 'FR'
}

// --------------------------------------------------------------------------
// 1. Per-tenant Postgres database
// --------------------------------------------------------------------------
resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' existing = {
  name: postgresServerName
}

resource tenantDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: pg
  name: dbName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Optional: per-tenant Entra DB administrator (when each customer has their own AAD group)
resource tenantEntraAdmin 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2024-08-01' = if (!empty(tenantAdminGroupObjectId)) {
  parent: pg
  name: tenantAdminGroupObjectId
  properties: {
    principalType: 'Group'
    principalName: 'sovera-tenant-${tenantSlug}-admins'
    tenantId: subscription().tenantId
  }
}

// --------------------------------------------------------------------------
// 2. Per-tenant Blob container (immutable, versioned)
// --------------------------------------------------------------------------
resource sa 'Microsoft.Storage/storageAccounts@2024-01-01' existing = {
  name: storageAccountName
}

resource blobSvc 'Microsoft.Storage/storageAccounts/blobServices@2024-01-01' existing = {
  parent: sa
  name: 'default'
}

resource tenantContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2024-01-01' = {
  parent: blobSvc
  name: containerName
  properties: {
    publicAccess: 'None'
    metadata: {
      tenantSlug: tenantSlug
      tenantTier: tier
      storageQuotaGB: string(t.storageQuotaGB)
    }
    immutableStorageWithVersioning: { enabled: true }
  }
}

// --------------------------------------------------------------------------
// 3. Per-tenant Web PubSub hub
// --------------------------------------------------------------------------
resource wps 'Microsoft.SignalRService/webPubSub@2024-10-01-preview' existing = {
  name: webPubSubName
}

resource tenantHub 'Microsoft.SignalRService/webPubSub/hubs@2024-10-01-preview' = {
  parent: wps
  name: hubName
  properties: {
    anonymousConnectPolicy: 'deny'
  }
}

// --------------------------------------------------------------------------
// 4. Per-tenant APIM product, policy, subscription
// --------------------------------------------------------------------------
resource apim 'Microsoft.ApiManagement/service@2024-06-01-preview' existing = if (!empty(apimName)) {
  name: apimName
}

resource tenantProduct 'Microsoft.ApiManagement/service/products@2024-06-01-preview' = if (!empty(apimName)) {
  parent: apim
  name: productName
  properties: {
    displayName: tenantDisplayName
    description: 'Sovera tenant product for ${tenantDisplayName} (${tier} tier)'
    subscriptionRequired: true
    approvalRequired: false
    state: 'published'
  }
}

// Attach all 3 platform APIs to this tenant product
var apiNames = [ 'data', 'functions', 'realtime' ]
resource tenantProductApis 'Microsoft.ApiManagement/service/products/apis@2024-06-01-preview' = [for n in apiNames: if (!empty(apimName)) {
  parent: tenantProduct
  name: n
}]

// Tenant-scoped APIM product policy: stamps tenant claim headers and applies
// tier-driven rate-limit + quota. Values are interpolated at compile time.
var tenantProductPolicyXml = '''
<policies>
  <inbound>
    <base />
    <set-header name="X-Sovera-Tenant-Slug" exists-action="override">
      <value>__SLUG__</value>
    </set-header>
    <set-header name="X-Sovera-Tenant-Id" exists-action="override">
      <value>__TID__</value>
    </set-header>
    <set-header name="X-Sovera-Tenant-Tier" exists-action="override">
      <value>__TIER__</value>
    </set-header>
    <rate-limit-by-key calls="__RL_CALLS__"
                      renewal-period="__RL_PERIOD__"
                      counter-key="@(context.Subscription?.Id ?? "anon")" />
    <quota-by-key calls="__QT_CALLS__"
                  renewal-period="__QT_PERIOD__"
                  counter-key="@(context.Subscription?.Id ?? "anon")" />
  </inbound>
  <backend><base /></backend>
  <outbound><base /></outbound>
  <on-error><base /></on-error>
</policies>
'''

resource tenantProductPolicy 'Microsoft.ApiManagement/service/products/policies@2024-06-01-preview' = if (!empty(apimName)) {
  parent: tenantProduct
  name: 'policy'
  properties: {
    format: 'rawxml'
    value: replace(replace(replace(replace(replace(replace(replace(tenantProductPolicyXml,
      '__SLUG__',     tenantSlug),
      '__TID__',      tenantId),
      '__TIER__',     tier),
      '__RL_CALLS__', string(t.rateLimitCalls)),
      '__RL_PERIOD__',string(t.rateLimitPeriod)),
      '__QT_CALLS__', string(t.quotaCalls)),
      '__QT_PERIOD__',string(t.quotaPeriod))
  }
}

resource tenantSubscription 'Microsoft.ApiManagement/service/subscriptions@2024-06-01-preview' = if (!empty(apimName)) {
  parent: apim
  name: subscriptionName
  properties: {
    displayName: '${tenantDisplayName} subscription'
    scope: tenantProduct.id
    state: 'active'
    allowTracing: false
  }
}

// --------------------------------------------------------------------------
// 5. Per-tenant secrets in Key Vault
// --------------------------------------------------------------------------
resource kv 'Microsoft.KeyVault/vaults@2024-11-01' existing = {
  name: keyVaultName
}

// Connection string template for DAB / Functions to bind to this tenant's DB.
resource secretPgConn 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: kv
  name: 'tenant-${tenantSlug}-pg-database'
  properties: {
    value: dbName
    contentType: 'text/plain'
    attributes: { enabled: true }
  }
}

resource secretContainer 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: kv
  name: 'tenant-${tenantSlug}-blob-container'
  properties: {
    value: containerName
    contentType: 'text/plain'
    attributes: { enabled: true }
  }
}

resource secretHub 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: kv
  name: 'tenant-${tenantSlug}-wps-hub'
  properties: {
    value: hubName
    contentType: 'text/plain'
    attributes: { enabled: true }
  }
}

resource secretTenantId 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: kv
  name: 'tenant-${tenantSlug}-tid'
  properties: {
    value: tenantId
    contentType: 'text/plain'
    attributes: { enabled: true }
  }
}

// --------------------------------------------------------------------------
// Outputs — consumed by onboarding script + control-plane registry
// --------------------------------------------------------------------------
output tenantSlug string = tenantSlug
output tenantId string = tenantId
output dbName string = dbName
output containerName string = containerName
output hubName string = hubName
output productName string = !empty(apimName) ? productName : ''
output subscriptionName string = !empty(apimName) ? subscriptionName : ''
output tier string = tier
output rateLimit object = {
  calls: t.rateLimitCalls
  periodSeconds: t.rateLimitPeriod
}
output quota object = {
  calls: t.quotaCalls
  periodSeconds: t.quotaPeriod
}
output storageQuotaGB int = t.storageQuotaGB
output maxClients int = t.maxClients
