// ============================================================================
//  Realtime bridge — Container App that consumes Postgres logical replication
//  events from Event Hubs (pg-wal) and fans them out via Web PubSub.
//
//  Image: a small Node/.NET service you build (services/realtime-bridge).
//  For Phase 2 we deploy a placeholder image; replace with your ACR image later.
// ============================================================================
targetScope = 'resourceGroup'

param location string
param tags object
param environmentId string
param userAssignedIdentityId string
param eventHubNamespaceFqdn string
param eventHubName string
param webPubSubHostName string
param webPubSubName string
param image string = 'mcr.microsoft.com/k8se/quickstart:latest' // placeholder

resource bridge 'Microsoft.App/containerApps@2024-10-02-preview' = {
  name: 'sovera-realtime-bridge'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${userAssignedIdentityId}': {} }
  }
  properties: {
    environmentId: environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: null
    }
    template: {
      containers: [
        {
          name: 'bridge'
          image: image
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'EH_NAMESPACE', value: eventHubNamespaceFqdn }
            { name: 'EH_NAME', value: eventHubName }
            { name: 'WPS_HOST', value: webPubSubHostName }
            { name: 'WPS_HUB', value: 'realtime' }
            { name: 'WPS_NAME', value: webPubSubName }
            { name: 'AZURE_CLIENT_ID', value: reference(userAssignedIdentityId, '2024-11-30').clientId }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

output appId string = bridge.id
output appName string = bridge.name
