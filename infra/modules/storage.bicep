// ============================================================================
//  Storage account — Blob, CMK, immutable, private endpoint
// ============================================================================
targetScope = 'resourceGroup'

param location string
param tags object
param subnetId string
param blobPrivateDnsZoneId string
param keyVaultUri string
param cmkKeyName string
param cmkUserAssignedIdentityId string
param logAnalyticsId string

var prefix = 'sovera'
var uniq = uniqueString(resourceGroup().id)
var saName = toLower('${prefix}st${uniq}')

resource sa 'Microsoft.Storage/storageAccounts@2024-01-01' = {
  name: saName
  location: location
  tags: tags
  sku: { name: 'Standard_ZRS' }
  kind: 'StorageV2'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${cmkUserAssignedIdentityId}': {}
    }
  }
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    allowCrossTenantReplication: false
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Disabled'
    defaultToOAuthAuthentication: true
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Deny'
    }
    encryption: {
      requireInfrastructureEncryption: true
      keySource: 'Microsoft.Keyvault'
      identity: {
        userAssignedIdentity: cmkUserAssignedIdentityId
      }
      keyvaultproperties: {
        keyvaulturi: keyVaultUri
        keyname: cmkKeyName
      }
      services: {
        blob: { enabled: true, keyType: 'Account' }
        file: { enabled: true, keyType: 'Account' }
      }
    }
  }
}

resource blobSvc 'Microsoft.Storage/storageAccounts/blobServices@2024-01-01' = {
  parent: sa
  name: 'default'
  properties: {
    isVersioningEnabled: true
    changeFeed: { enabled: true, retentionInDays: 30 }
    deleteRetentionPolicy: { enabled: true, days: 30 }
    containerDeleteRetentionPolicy: { enabled: true, days: 30 }
  }
}

// Default tenant container with immutability — production tenants use the
// per-tenant module that creates one container per customer.
resource immutableContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2024-01-01' = {
  parent: blobSvc
  name: 'audit'
  properties: {
    publicAccess: 'None'
    immutableStorageWithVersioning: { enabled: true }
  }
}

// ---------------------------------------------------------------------------
// Private endpoint
// ---------------------------------------------------------------------------
resource pe 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: '${saName}-pe'
  location: location
  tags: tags
  properties: {
    subnet: { id: subnetId }
    privateLinkServiceConnections: [
      {
        name: 'blob'
        properties: {
          privateLinkServiceId: sa.id
          groupIds: [ 'blob' ]
        }
      }
    ]
  }
}

resource peDns 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = {
  parent: pe
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'blob'
        properties: { privateDnsZoneId: blobPrivateDnsZoneId }
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------
resource diag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: blobSvc
  name: 'to-law'
  properties: {
    workspaceId: logAnalyticsId
    logs: [ { categoryGroup: 'allLogs', enabled: true } ]
    metrics: [ { category: 'AllMetrics', enabled: true } ]
  }
}

output accountName string = sa.name
output accountId string = sa.id
output blobEndpoint string = sa.properties.primaryEndpoints.blob
