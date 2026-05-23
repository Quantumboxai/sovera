// ============================================================================
//  Azure Functions Flex Consumption — "Edge Functions"
// ============================================================================
targetScope = 'resourceGroup'

param location string
param tags object
param funcSubnetId string
@description('Storage account for the Functions runtime (separate from data blob).')
param runtimeStorageName string
param logAnalyticsId string
param appInsightsConnectionString string
param userAssignedIdentityId string

@allowed([ 'node', 'python', 'dotnet-isolated', 'java' ])
param runtime string = 'node'
@allowed([ '20', '22', '3.11', '3.12', '8.0', '9.0', '17', '21' ])
param runtimeVersion string = '22'

var prefix = 'sovera'
var uniq = uniqueString(resourceGroup().id)

// Plan
resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: '${prefix}-fnplan-${uniq}'
  location: location
  tags: tags
  sku: {
    tier: 'FlexConsumption'
    name: 'FC1'
  }
  properties: {
    reserved: true
  }
  kind: 'functionapp'
}

// Runtime storage account (Functions needs an attached storage; this is NOT user data)
resource runtimeSa 'Microsoft.Storage/storageAccounts@2025-01-01' = {
  name: runtimeStorageName
  location: location
  tags: tags
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true   // Functions runtime currently requires this
    publicNetworkAccess: 'Enabled' // restricted by network ACLs to AAD bypass
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Deny'
    }
    supportsHttpsTrafficOnly: true
  }
}

resource runtimeBlob 'Microsoft.Storage/storageAccounts/blobServices@2025-01-01' = {
  parent: runtimeSa
  name: 'default'
}

resource deployContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-01-01' = {
  parent: runtimeBlob
  name: 'deployment'
  properties: { publicAccess: 'None' }
}

resource fn 'Microsoft.Web/sites@2024-04-01' = {
  name: '${prefix}-fn-${uniq}'
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${userAssignedIdentityId}': {} }
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    publicNetworkAccess: 'Enabled'  // APIM is the only intended caller; lock down via access restrictions
    virtualNetworkSubnetId: funcSubnetId
    keyVaultReferenceIdentity: userAssignedIdentityId
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${runtimeSa.properties.primaryEndpoints.blob}deployment'
          authentication: {
            type: 'UserAssignedIdentity'
            userAssignedIdentityResourceId: userAssignedIdentityId
          }
        }
      }
      runtime: {
        name: runtime
        version: runtimeVersion
      }
      scaleAndConcurrency: {
        instanceMemoryMB: 2048
        maximumInstanceCount: 100
      }
    }
    siteConfig: {
      appSettings: [
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
        { name: 'AzureWebJobsStorage__accountName', value: runtimeSa.name }
        { name: 'AzureWebJobsStorage__credential', value: 'managedidentity' }
        { name: 'AzureWebJobsStorage__clientId', value: reference(userAssignedIdentityId, '2024-11-30').clientId }
      ]
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
    }
  }
}

resource diag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: fn
  name: 'to-law'
  properties: {
    workspaceId: logAnalyticsId
    logs: [ { categoryGroup: 'allLogs', enabled: true } ]
    metrics: [ { category: 'AllMetrics', enabled: true } ]
  }
}

output functionAppName string = fn.name
output functionAppHostname string = fn.properties.defaultHostName
output functionAppId string = fn.id
