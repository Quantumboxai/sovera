// ============================================================================
//  Web PubSub — managed WebSocket fan-out for Realtime
// ============================================================================
targetScope = 'resourceGroup'

param location string
param tags object
param subnetId string
param privateDnsZoneId string
param logAnalyticsId string

var prefix = 'sovera'
var uniq = uniqueString(resourceGroup().id)

resource wps 'Microsoft.SignalRService/webPubSub@2024-10-01-preview' = {
  name: '${prefix}-wps-${uniq}'
  location: location
  tags: tags
  sku: {
    name: 'Premium_P1'
    tier: 'Premium'
    capacity: 1
  }
  identity: { type: 'SystemAssigned' }
  properties: {
    publicNetworkAccess: 'Disabled'
    disableLocalAuth: true
    disableAadAuth: false
    tls: { clientCertEnabled: false }
  }
}

resource hub 'Microsoft.SignalRService/webPubSub/hubs@2024-10-01-preview' = {
  parent: wps
  name: 'realtime'
  properties: {
    anonymousConnectPolicy: 'deny'
  }
}

resource pe 'Microsoft.Network/privateEndpoints@2024-07-01' = {
  name: '${wps.name}-pe'
  location: location
  tags: tags
  properties: {
    subnet: { id: subnetId }
    privateLinkServiceConnections: [
      {
        name: 'wps'
        properties: {
          privateLinkServiceId: wps.id
          groupIds: [ 'webpubsub' ]
        }
      }
    ]
  }
}

resource peDns 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-07-01' = {
  parent: pe
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'wps'
        properties: { privateDnsZoneId: privateDnsZoneId }
      }
    ]
  }
}

resource diag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: wps
  name: 'to-law'
  properties: {
    workspaceId: logAnalyticsId
    logs: [ { categoryGroup: 'allLogs', enabled: true } ]
    metrics: [ { category: 'AllMetrics', enabled: true } ]
  }
}

output name string = wps.name
output id string = wps.id
output hostName string = wps.properties.hostName
output principalId string = wps.identity.principalId
