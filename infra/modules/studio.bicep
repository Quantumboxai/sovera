// ============================================================================
//  Sovera Studio — Container App + Azure Container Registry
//  Front-end admin console. External HTTPS ingress (TLS auto-provisioned).
//  Pulls image from a private ACR via the existing CMK managed identity.
// ============================================================================
targetScope = 'resourceGroup'

param location string
param tags object

@description('ACA managed environment to host the Studio container.')
param environmentId string

@description('Existing user-assigned managed identity. Must be grantable AcrPull.')
param userAssignedIdentityId string

@description('Principal ID of the same identity (for the role assignment).')
param userAssignedIdentityPrincipalId string

@description('Public-facing env vars for the Studio (no secrets here).')
param apimGatewayUrl string = ''
param authority string = ''
param clientId string = ''

@description('Image tag to pull. Set by azd / az acr build after the registry exists.')
param imageTag string = 'latest'

@description('Allow azd to override the full image (registry/repo:tag).')
param imageOverride string = ''

var prefix = 'sovera'
var uniq = uniqueString(resourceGroup().id)
var registryName = toLower('${prefix}acr${uniq}')
var repoName = 'studio'
// On the very first deployment the image doesn't exist yet — fall back to a
// public placeholder so the Container App resource creates successfully.
// azd / `az acr build` populates the real image, then a re-deploy flips to it.
var defaultImage = '${registryName}.azurecr.io/${repoName}:${imageTag}'
var placeholderImage = 'mcr.microsoft.com/k8se/quickstart:latest'
var image = empty(imageOverride) ? (imageTag == 'bootstrap' ? placeholderImage : defaultImage) : imageOverride

// ---------------------------------------------------------------------------
// 1. Azure Container Registry (Basic — admin-facing, no private link needed)
// ---------------------------------------------------------------------------
resource acr 'Microsoft.ContainerRegistry/registries@2024-11-01-preview' = {
  name: registryName
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    anonymousPullEnabled: false
  }
}

// AcrPull for the workload identity so the Container App can pull images.
resource acrPullRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' existing = {
  scope: subscription()
  name: '7f951dda-4ed3-4680-a7ca-43fe172d538d' // AcrPull
}
resource acrPullAssign 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, userAssignedIdentityPrincipalId, 'AcrPull')
  scope: acr
  properties: {
    principalId: userAssignedIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRole.id
  }
}

// ---------------------------------------------------------------------------
// 2. The Studio container app — external ingress on 3000
// ---------------------------------------------------------------------------
resource studio 'Microsoft.App/containerApps@2024-10-02-preview' = {
  name: '${prefix}-studio'
  location: location
  tags: union(tags, { 'azd-service-name': 'studio' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${userAssignedIdentityId}': {} }
  }
  dependsOn: [ acrPullAssign ]
  properties: {
    environmentId: environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
        traffic: [ { latestRevision: true, weight: 100 } ]
      }
      registries: [
        {
          server: '${registryName}.azurecr.io'
          identity: userAssignedIdentityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'studio'
          image: image
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'NEXT_TELEMETRY_DISABLED', value: '1' }
            { name: 'PORT', value: '3000' }
            { name: 'HOSTNAME', value: '0.0.0.0' }
            { name: 'NEXT_PUBLIC_APIM_URL', value: apimGatewayUrl }
            { name: 'NEXT_PUBLIC_AUTHORITY', value: authority }
            { name: 'NEXT_PUBLIC_CLIENT_ID', value: clientId }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http'
            http: { metadata: { concurrentRequests: '50' } }
          }
        ]
      }
    }
  }
}

output registryName string = acr.name
output registryLoginServer string = '${acr.name}.azurecr.io'
output studioName string = studio.name
output studioFqdn string = studio.properties.configuration.ingress.fqdn
output studioUrl string = 'https://${studio.properties.configuration.ingress.fqdn}'
