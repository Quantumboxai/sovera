// ============================================================================
//  Sovera Studio — STANDALONE deployment (no data plane, no VNet)
//  Spins up: RG + Log Analytics + ACR + public ACA env + Studio container app
//  Cost: ~€30/mo idle. Delete with: az group delete -n sovera-studio --yes
// ============================================================================
targetScope = 'subscription'

@description('Resource group name. Isolated from the full sovera RG so tests can be torn down independently.')
param rgName string = 'sovera-studio'

@allowed([ 'francecentral' ])
param location string = 'francecentral'

@description('Tag the container app so azd / az can find it later.')
var prefix = 'sovera'
var tags = {
  workload: 'sovera'
  scope: 'studio-test'
  managedBy: 'bicep'
}

resource rg 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: rgName
  location: location
  tags: tags
}

module studio 'modules/studio-standalone.bicep' = {
  scope: rg
  name: 'studio-standalone'
  params: {
    location: location
    tags: tags
    prefix: prefix
  }
}

output resourceGroupName string = rg.name
output registryLoginServer string = studio.outputs.registryLoginServer
output registryName string = studio.outputs.registryName
output studioName string = studio.outputs.studioName
output studioUrl string = studio.outputs.studioUrl
output acaEnvName string = studio.outputs.acaEnvName
output uamiPrincipalId string = studio.outputs.uamiPrincipalId
