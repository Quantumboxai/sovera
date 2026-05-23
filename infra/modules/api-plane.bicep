// ============================================================================
//  API plane wrapper — composes ACA env, Web PubSub, Functions, Realtime
//  bridge, and (optionally) DAB and APIM.
// ============================================================================
targetScope = 'resourceGroup'

param location string
param tags object

// Networking
param appsSubnetId string
param funcSubnetId string
param dataSubnetId string
param apimSubnetId string
param webPubSubPrivateDnsZoneId string

// Observability
param logAnalyticsId string
param logAnalyticsCustomerId string
param logAnalyticsName string
param appInsightsId string
param appInsightsConnectionString string

// Identity / Secrets
param cmkIdentityId string
param keyVaultName string

// Data backends
param postgresFqdn string
param eventHubNamespaceFqdn string
param eventHubName string

// Toggles
param deployDab bool = false
param deployApim bool = false

// Required only when toggles are true
param apimPublisherEmail string = ''
param oidcMetadataUrl string = ''
param jwtAudience string = ''
param jwtIssuer string = ''

var prefix = 'sovera'
var uniq = uniqueString(resourceGroup().id)

// Get the LA shared key (RG-scope only)
resource law 'Microsoft.OperationalInsights/workspaces@2025-02-01' existing = {
  name: logAnalyticsName
}

// ---------------------------------------------------------------------------
// 1. Container Apps environment
// ---------------------------------------------------------------------------
module acaEnv 'aca-env.bicep' = {
  name: 'aca-env'
  params: {
    location: location
    tags: tags
    appsSubnetId: appsSubnetId
    logAnalyticsId: logAnalyticsId
    logAnalyticsCustomerId: logAnalyticsCustomerId
    logAnalyticsSharedKey: law.listKeys().primarySharedKey
  }
}

// ---------------------------------------------------------------------------
// 2. Web PubSub
// ---------------------------------------------------------------------------
module wps 'webpubsub.bicep' = {
  name: 'webpubsub'
  params: {
    location: location
    tags: tags
    subnetId: dataSubnetId
    privateDnsZoneId: webPubSubPrivateDnsZoneId
    logAnalyticsId: logAnalyticsId
  }
}

// ---------------------------------------------------------------------------
// 3. Functions Flex (Edge Functions)
// ---------------------------------------------------------------------------
module fn 'functions.bicep' = {
  name: 'functions'
  params: {
    location: location
    tags: tags
    funcSubnetId: funcSubnetId
    runtimeStorageName: toLower('${prefix}fnst${uniq}')
    logAnalyticsId: logAnalyticsId
    appInsightsConnectionString: appInsightsConnectionString
    userAssignedIdentityId: cmkIdentityId
  }
}

// ---------------------------------------------------------------------------
// 4. Realtime bridge
// ---------------------------------------------------------------------------
module bridge 'realtime-bridge.bicep' = {
  name: 'realtime-bridge'
  params: {
    location: location
    tags: tags
    environmentId: acaEnv.outputs.environmentId
    userAssignedIdentityId: cmkIdentityId
    eventHubNamespaceFqdn: eventHubNamespaceFqdn
    eventHubName: eventHubName
    webPubSubHostName: wps.outputs.hostName
    webPubSubName: wps.outputs.name
  }
}

// ---------------------------------------------------------------------------
// 5. DAB (optional — requires KV secret to exist)
// ---------------------------------------------------------------------------
module dab 'dab.bicep' = if (deployDab) {
  name: 'dab'
  params: {
    location: location
    tags: tags
    environmentId: acaEnv.outputs.environmentId
    postgresFqdn: postgresFqdn
    userAssignedIdentityId: cmkIdentityId
    keyVaultName: keyVaultName
    jwtIssuer: jwtIssuer
    jwtAudience: jwtAudience
  }
}

// ---------------------------------------------------------------------------
// 6. APIM Premium (optional — long deploy, requires OIDC config)
// ---------------------------------------------------------------------------
module apim 'apim.bicep' = if (deployApim) {
  name: 'apim'
  params: {
    location: location
    tags: tags
    apimSubnetId: apimSubnetId
    logAnalyticsId: logAnalyticsId
    appInsightsId: appInsightsId
    publisherEmail: apimPublisherEmail
    dabBackendUrl: deployDab ? 'https://${dab.outputs.fqdn}' : 'https://placeholder.invalid'
    functionsBackendUrl: 'https://${fn.outputs.functionAppHostname}'
    webPubSubNegotiateUrl: 'https://${fn.outputs.functionAppHostname}/api/negotiate'
    webPubSubName: wps.outputs.name
    oidcMetadataUrl: oidcMetadataUrl
    jwtAudience: jwtAudience
  }
}

// ---------------------------------------------------------------------------
// Role assignments for the shared identity
// ---------------------------------------------------------------------------
// Storage Blob Data Owner on Functions runtime storage (for MI-based AzureWebJobsStorage)
var roleStorageBlobDataOwner = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
resource fnSaRa 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, cmkIdentityId, 'fn-storage-owner')
  scope: resourceGroup()
  properties: {
    principalId: reference(cmkIdentityId, '2024-11-30').principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleStorageBlobDataOwner)
  }
}

// Azure Event Hubs Data Receiver — for realtime bridge to consume pg-wal
var roleEhReceiver = 'a638d3c7-ab3a-418d-83e6-5f17a39d4fde'
resource ehRa 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, cmkIdentityId, 'eh-receiver')
  scope: resourceGroup()
  properties: {
    principalId: reference(cmkIdentityId, '2024-11-30').principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleEhReceiver)
  }
}

// Web PubSub Service Owner — for realtime bridge and Functions to publish
var roleWpsServiceOwner = '12cf5a90-567b-43ae-8102-96cf46c7d9b4'
resource wpsRa 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, cmkIdentityId, 'wps-owner')
  scope: resourceGroup()
  properties: {
    principalId: reference(cmkIdentityId, '2024-11-30').principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleWpsServiceOwner)
  }
}

// Key Vault Secrets User — for DAB to pull pg connection string
var roleKvSecretsUser = '4633458b-17de-408a-b874-0445c86b69e6'
resource kvRa 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deployDab) {
  name: guid(resourceGroup().id, cmkIdentityId, 'kv-secrets-user')
  scope: resourceGroup()
  properties: {
    principalId: reference(cmkIdentityId, '2024-11-30').principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleKvSecretsUser)
  }
}

output acaEnvironmentId string = acaEnv.outputs.environmentId
output webPubSubName string = wps.outputs.name
output webPubSubHostName string = wps.outputs.hostName
output functionAppHostname string = fn.outputs.functionAppHostname
output realtimeBridgeName string = bridge.outputs.appName
output dabFqdn string = deployDab ? dab.outputs.fqdn : ''
output apimName string = deployApim ? apim.outputs.apimName : ''
output apimGatewayUrl string = deployApim ? apim.outputs.gatewayUrl : ''
