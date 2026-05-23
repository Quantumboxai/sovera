// ============================================================================
//  studio-standalone.bicep
//  Minimal public-internet stack for testing the Sovera Studio UI.
//  - User-assigned identity (for ACR pull)
//  - ACR Basic (admin disabled)
//  - Log Analytics
//  - Container Apps environment (public, Consumption only — no VNet)
//  - Container App 'sovera-studio' with external HTTPS ingress on :3000
// ============================================================================
targetScope = 'resourceGroup'

param location string
param tags object
param prefix string

@description('Image override. If empty, bootstraps with mcr quickstart image until first `az acr build`.')
param imageOverride string = ''

var uniq = uniqueString(resourceGroup().id)
var uamiName = '${prefix}-studio-uami'
var lawName = '${prefix}-studio-law'
var acrName = toLower('${prefix}studio${uniq}')
var envName = '${prefix}-studio-env'
var appName = '${prefix}-studio'

resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: uamiName
  location: location
  tags: tags
}

resource law 'Microsoft.OperationalInsights/workspaces@2025-02-01' = {
  name: lawName
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    features: { enableLogAccessUsingOnlyResourcePermissions: true }
  }
}

resource acr 'Microsoft.ContainerRegistry/registries@2025-04-01' = {
  name: acrName
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
    anonymousPullEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

// AcrPull role for the UAMI on this registry.
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: acr
  name: guid(acr.id, uami.id, acrPullRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource env 'Microsoft.App/managedEnvironments@2025-02-02-preview' = {
  name: envName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: law.properties.customerId
        sharedKey: law.listKeys().primarySharedKey
      }
    }
    zoneRedundant: false
    workloadProfiles: [
      { name: 'Consumption', workloadProfileType: 'Consumption' }
    ]
    publicNetworkAccess: 'Enabled'
  }
}

var resolvedImage = empty(imageOverride)
  ? 'mcr.microsoft.com/k8se/quickstart:latest'
  : imageOverride

resource studio 'Microsoft.App/containerApps@2025-02-02-preview' = {
  name: appName
  location: location
  tags: union(tags, { 'azd-service-name': 'studio' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${uami.id}': {} }
  }
  properties: {
    environmentId: env.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: empty(imageOverride) ? 80 : 3000
        transport: 'auto'
        allowInsecure: false
        traffic: [ { weight: 100, latestRevision: true } ]
      }
      registries: empty(imageOverride) ? [] : [
        {
          server: '${acrName}.azurecr.io'
          identity: uami.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'studio'
          image: resolvedImage
          resources: { cpu: json('0.5'), memory: '1.0Gi' }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3000' }
            { name: 'HOSTNAME', value: '0.0.0.0' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
  dependsOn: [ acrPull ]
}

output registryName string = acr.name
output registryLoginServer string = acr.properties.loginServer
output studioName string = studio.name
output studioUrl string = 'https://${studio.properties.configuration.ingress.fqdn}'
output acaEnvName string = env.name
output uamiPrincipalId string = uami.properties.principalId
