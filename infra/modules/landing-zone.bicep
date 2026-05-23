// ============================================================================
//  Landing zone:  network + Key Vault HSM + observability + identity
// ============================================================================
targetScope = 'resourceGroup'

param location string
param tags object
@description('Object ID of the admin Entra group (Key Vault Admin role).')
param adminGroupObjectId string

@allowed([ 'Group', 'User', 'ServicePrincipal' ])
param adminPrincipalType string = 'Group'

var prefix = 'sovera'
var uniq = uniqueString(resourceGroup().id)

// ---------------------------------------------------------------------------
// Log Analytics + App Insights
// ---------------------------------------------------------------------------
resource law 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-law-${uniq}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 90
    features: { enableLogAccessUsingOnlyResourcePermissions: true }
  }
}

resource appi 'Microsoft.Insights/components@2020-02-02' = {
  name: '${prefix}-appi-${uniq}'
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: law.id
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// ---------------------------------------------------------------------------
// User-assigned managed identity used for CMK access (Postgres + Storage)
// ---------------------------------------------------------------------------
resource cmkIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: '${prefix}-cmk-id'
  location: location
  tags: tags
}

// ---------------------------------------------------------------------------
// Network — VNet, subnets, NSGs, private DNS zones
// ---------------------------------------------------------------------------
module network 'network.bicep' = {
  name: 'network'
  params: {
    location: location
    tags: tags
    namePrefix: prefix
  }
}

// ---------------------------------------------------------------------------
// Key Vault Premium (HSM-backed) + CMK keys
// ---------------------------------------------------------------------------
resource kv 'Microsoft.KeyVault/vaults@2024-11-01' = {
  name: '${prefix}-kv-${uniq}'
  location: location
  tags: tags
  properties: {
    sku: { family: 'A', name: 'premium' }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enablePurgeProtection: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    publicNetworkAccess: 'Disabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Deny'
    }
  }
}

// Built-in role IDs
var roleIds = {
  kvAdministrator: '00482a5a-887f-4fb3-b363-3b7fe8e74483'
  kvCryptoUser: '12338af0-0e69-4776-bea7-57ae8d297424'
  kvCryptoServiceEncryptionUser: 'e147488a-f6f5-4113-8e2d-b22465e65bf6'
}

resource kvAdminRa 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: kv
  name: guid(kv.id, adminGroupObjectId, roleIds.kvAdministrator)
  properties: {
    principalId: adminGroupObjectId
    principalType: adminPrincipalType
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.kvAdministrator)
  }
}

resource kvCmkIdRa 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: kv
  name: guid(kv.id, cmkIdentity.id, roleIds.kvCryptoServiceEncryptionUser)
  properties: {
    principalId: cmkIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.kvCryptoServiceEncryptionUser)
  }
}

// Private endpoint for Key Vault
resource kvPe 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: '${prefix}-kv-pe'
  location: location
  tags: tags
  properties: {
    subnet: { id: network.outputs.peSubnetId }
    privateLinkServiceConnections: [
      {
        name: 'kv'
        properties: {
          privateLinkServiceId: kv.id
          groupIds: [ 'vault' ]
        }
      }
    ]
  }
}

resource kvPeDns 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = {
  parent: kvPe
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'kv'
        properties: { privateDnsZoneId: network.outputs.kvPrivateDnsZoneId }
      }
    ]
  }
}

// CMK keys (created after RBAC propagates; admins create them via deployment script
// or post-deploy. We declare them as resources for IaC purity.)
resource pgCmkKey 'Microsoft.KeyVault/vaults/keys@2024-11-01' = {
  parent: kv
  name: 'cmk-postgres'
  properties: {
    kty: 'RSA-HSM'
    keySize: 3072
    keyOps: [ 'wrapKey', 'unwrapKey' ]
    attributes: { enabled: true }
    rotationPolicy: {
      attributes: { expiryTime: 'P2Y' }
      lifetimeActions: [
        {
          trigger: { timeBeforeExpiry: 'P30D' }
          action: { type: 'notify' }
        }
        {
          trigger: { timeAfterCreate: 'P18M' }
          action: { type: 'rotate' }
        }
      ]
    }
  }
  dependsOn: [ kvAdminRa ]
}

resource blobCmkKey 'Microsoft.KeyVault/vaults/keys@2024-11-01' = {
  parent: kv
  name: 'cmk-blob'
  properties: {
    kty: 'RSA-HSM'
    keySize: 3072
    keyOps: [ 'wrapKey', 'unwrapKey' ]
    attributes: { enabled: true }
    rotationPolicy: {
      attributes: { expiryTime: 'P2Y' }
      lifetimeActions: [
        {
          trigger: { timeBeforeExpiry: 'P30D' }
          action: { type: 'notify' }
        }
        {
          trigger: { timeAfterCreate: 'P18M' }
          action: { type: 'rotate' }
        }
      ]
    }
  }
  dependsOn: [ kvAdminRa ]
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------
resource kvDiag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: kv
  name: 'to-law'
  properties: {
    workspaceId: law.id
    logs: [
      { categoryGroup: 'audit', enabled: true }
      { categoryGroup: 'allLogs', enabled: true }
    ]
    metrics: [
      { category: 'AllMetrics', enabled: true }
    ]
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
output logAnalyticsId string = law.id
output logAnalyticsName string = law.name
output logAnalyticsCustomerId string = law.properties.customerId
output appInsightsId string = appi.id
output appInsightsConnectionString string = appi.properties.ConnectionString
output keyVaultName string = kv.name
output keyVaultUri string = kv.properties.vaultUri
output cmkIdentityId string = cmkIdentity.id
output cmkIdentityPrincipalId string = cmkIdentity.properties.principalId
output pgCmkKeyName string = pgCmkKey.name
output blobCmkKeyName string = blobCmkKey.name

output vnetId string = network.outputs.vnetId
output pgSubnetId string = network.outputs.pgSubnetId
output dataSubnetId string = network.outputs.dataSubnetId
output appsSubnetId string = network.outputs.appsSubnetId
output peSubnetId string = network.outputs.peSubnetId
output apimSubnetId string = network.outputs.apimSubnetId
output funcSubnetId string = network.outputs.funcSubnetId
output pgPrivateDnsZoneId string = network.outputs.pgPrivateDnsZoneId
output blobPrivateDnsZoneId string = network.outputs.blobPrivateDnsZoneId
output eventHubPrivateDnsZoneId string = network.outputs.eventHubPrivateDnsZoneId
output kvPrivateDnsZoneId string = network.outputs.kvPrivateDnsZoneId
output webPubSubPrivateDnsZoneId string = network.outputs.webPubSubPrivateDnsZoneId
output apimPrivateDnsZoneId string = network.outputs.apimPrivateDnsZoneId
