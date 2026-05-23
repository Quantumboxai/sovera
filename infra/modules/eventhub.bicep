// ============================================================================
//  Event Hubs — namespace + hub for Postgres logical replication (Realtime)
// ============================================================================
targetScope = 'resourceGroup'

param location string
param tags object
param subnetId string
param privateDnsZoneId string
param logAnalyticsId string

var prefix = 'sovera'
var uniq = uniqueString(resourceGroup().id)

resource ns 'Microsoft.EventHub/namespaces@2024-05-01-preview' = {
  name: '${prefix}-eh-${uniq}'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
    capacity: 2
  }
  properties: {
    isAutoInflateEnabled: true
    maximumThroughputUnits: 10
    publicNetworkAccess: 'Disabled'
    minimumTlsVersion: '1.2'
    disableLocalAuth: true
    zoneRedundant: true
  }
}

resource hubWal 'Microsoft.EventHub/namespaces/eventhubs@2024-05-01-preview' = {
  parent: ns
  name: 'pg-wal'
  properties: {
    partitionCount: 4
    messageRetentionInDays: 1
    retentionDescription: {
      cleanupPolicy: 'Delete'
      retentionTimeInHours: 24
    }
  }
}

// ---------------------------------------------------------------------------
// Private endpoint
// ---------------------------------------------------------------------------
resource pe 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: '${ns.name}-pe'
  location: location
  tags: tags
  properties: {
    subnet: { id: subnetId }
    privateLinkServiceConnections: [
      {
        name: 'eh'
        properties: {
          privateLinkServiceId: ns.id
          groupIds: [ 'namespace' ]
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
        name: 'eh'
        properties: { privateDnsZoneId: privateDnsZoneId }
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------
resource diag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: ns
  name: 'to-law'
  properties: {
    workspaceId: logAnalyticsId
    logs: [ { categoryGroup: 'allLogs', enabled: true } ]
    metrics: [ { category: 'AllMetrics', enabled: true } ]
  }
}

output namespaceName string = ns.name
output namespaceId string = ns.id
output walHubName string = hubWal.name
