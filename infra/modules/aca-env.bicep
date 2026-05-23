// ============================================================================
//  Container Apps environment (workload profiles, VNet-internal)
//  Hosts: DAB, Realtime bridge, and any custom services.
// ============================================================================
targetScope = 'resourceGroup'

param location string
param tags object
param appsSubnetId string
param logAnalyticsId string
@description('Customer ID of the Log Analytics workspace (for ACA env config).')
param logAnalyticsCustomerId string
@secure()
param logAnalyticsSharedKey string

var prefix = 'sovera'
var uniq = uniqueString(resourceGroup().id)

resource env 'Microsoft.App/managedEnvironments@2024-10-02-preview' = {
  name: '${prefix}-aca-${uniq}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        sharedKey: logAnalyticsSharedKey
      }
    }
    vnetConfiguration: {
      internal: true
      infrastructureSubnetId: appsSubnetId
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
      {
        name: 'D4'
        workloadProfileType: 'D4'
        minimumCount: 1
        maximumCount: 5
      }
    ]
    zoneRedundant: true
    publicNetworkAccess: 'Disabled'
  }
}

output environmentId string = env.id
output environmentName string = env.name
output defaultDomain string = env.properties.defaultDomain
output staticIp string = env.properties.staticIp
