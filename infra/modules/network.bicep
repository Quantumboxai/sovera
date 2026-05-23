// ============================================================================
//  Network — VNet with delegated subnets + private DNS zones
// ============================================================================
targetScope = 'resourceGroup'

param location string
param tags object
param namePrefix string
param vnetCidr string = '10.42.0.0/16'

var subnets = {
  apps:  '10.42.1.0/24'   // Container Apps environment (delegated)
  pg:    '10.42.2.0/24'   // Postgres Flex (delegated)
  data:  '10.42.3.0/24'   // Storage / Event Hubs / Web PubSub private endpoints
  pe:    '10.42.4.0/24'   // Generic private endpoints (Key Vault, etc.)
  apim:  '10.42.5.0/24'   // APIM Premium (Phase 2)
  func:  '10.42.6.0/24'   // Functions Flex VNet integration (Phase 2)
}

resource nsg 'Microsoft.Network/networkSecurityGroups@2024-05-01' = {
  name: '${namePrefix}-nsg-default'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'DenyInternetInbound'
        properties: {
          priority: 4096
          direction: 'Inbound'
          access: 'Deny'
          protocol: '*'
          sourceAddressPrefix: 'Internet'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '*'
        }
      }
    ]
  }
}

resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: '${namePrefix}-vnet'
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: [ vnetCidr ] }
    subnets: [
      {
        name: 'snet-apps'
        properties: {
          addressPrefix: subnets.apps
          networkSecurityGroup: { id: nsg.id }
          delegations: [
            { name: 'aca', properties: { serviceName: 'Microsoft.App/environments' } }
          ]
        }
      }
      {
        name: 'snet-pg'
        properties: {
          addressPrefix: subnets.pg
          networkSecurityGroup: { id: nsg.id }
          delegations: [
            { name: 'pg', properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' } }
          ]
        }
      }
      {
        name: 'snet-data'
        properties: {
          addressPrefix: subnets.data
          networkSecurityGroup: { id: nsg.id }
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
      {
        name: 'snet-pe'
        properties: {
          addressPrefix: subnets.pe
          networkSecurityGroup: { id: nsg.id }
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
      {
        name: 'snet-apim'
        properties: {
          addressPrefix: subnets.apim
          networkSecurityGroup: { id: nsg.id }
        }
      }
      {
        name: 'snet-func'
        properties: {
          addressPrefix: subnets.func
          networkSecurityGroup: { id: nsg.id }
          delegations: [
            { name: 'func', properties: { serviceName: 'Microsoft.App/environments' } }
          ]
        }
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// Private DNS zones (linked to vnet)
// ---------------------------------------------------------------------------
var zones = [
  'privatelink.postgres.database.azure.com'
  'privatelink.blob.core.windows.net'
  'privatelink.servicebus.windows.net'   // Event Hubs uses this zone
  'privatelink.vaultcore.azure.net'
  'privatelink.webpubsub.azure.com'
  'privatelink.azure-api.net'
]

resource pdz 'Microsoft.Network/privateDnsZones@2024-06-01' = [for z in zones: {
  name: z
  location: 'global'
  tags: tags
}]

resource pdzLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = [for (z, i) in zones: {
  parent: pdz[i]
  name: 'link-${namePrefix}'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}]

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
output vnetId string = vnet.id
output appsSubnetId string = '${vnet.id}/subnets/snet-apps'
output pgSubnetId string = '${vnet.id}/subnets/snet-pg'
output dataSubnetId string = '${vnet.id}/subnets/snet-data'
output peSubnetId string = '${vnet.id}/subnets/snet-pe'
output apimSubnetId string = '${vnet.id}/subnets/snet-apim'
output funcSubnetId string = '${vnet.id}/subnets/snet-func'

output pgPrivateDnsZoneId string = pdz[0].id
output blobPrivateDnsZoneId string = pdz[1].id
output eventHubPrivateDnsZoneId string = pdz[2].id
output kvPrivateDnsZoneId string = pdz[3].id
output webPubSubPrivateDnsZoneId string = pdz[4].id
output apimPrivateDnsZoneId string = pdz[5].id
