// ============================================================================
//  Sovera — Subscription-scope deployment
//  Phase 0 (landing zone) + Phase 1 (data plane) + Phase 2 (API plane)
//  Region: France Central (locked by Azure Policy)
//  Resource group: sovera
// ============================================================================
targetScope = 'subscription'

@description('Resource group name. All workload resources land here.')
param rgName string = 'sovera'

@description('Primary location. Region-lock policy will deny anything else.')
@allowed([ 'francecentral' ])
param location string = 'francecentral'

@description('Short environment tag, e.g. prod, staging, dev.')
param env string = 'prod'

@description('Entra ID object ID of the admin group OR user that should receive elevated access.')
param adminGroupObjectId string

@allowed([ 'Group', 'User', 'ServicePrincipal' ])
@description('Type of principal for adminGroupObjectId. Use User when deploying with your own account.')
param adminPrincipalType string = 'Group'

@description('Postgres administrator login (Entra group is preferred; this is fallback).')
param pgAdminLogin string = 'soveraadmin'

@secure()
@description('Postgres administrator password (rotate immediately after deploy).')
param pgAdminPassword string

// --- Phase 2 toggles -------------------------------------------------------
@description('Phase 2: deploy the API plane (ACA env, Web PubSub, Functions, realtime bridge).')
param deployApiPlane bool = true

@description('Phase 2: deploy DAB. Requires the KV secret "dab-pg-connection" to exist first.')
param deployDab bool = false

@description('Phase 2: deploy APIM Premium. Requires Entra External ID OIDC values.')
param deployApim bool = false

@description('APIM publisher email (required when deployApim=true).')
param apimPublisherEmail string = ''

@description('Entra External ID OpenID metadata URL (required for DAB/APIM).')
param oidcMetadataUrl string = ''

@description('JWT audience — your APIM/DAB client app id.')
param jwtAudience string = ''

@description('JWT issuer URL.')
param jwtIssuer string = ''

@description('Phase 6: deploy Microsoft Sentinel (analytics rules + workbook on the LAW).')
param deploySentinel bool = false

@description('Phase 4: deploy the Studio (Container App + ACR). Requires deployApiPlane=true.')
param deployStudio bool = false

@description('Image tag for the Studio. Use "bootstrap" on first deploy, then re-deploy with the real tag after `az acr build`.')
param studioImageTag string = 'bootstrap'

@description('Optional full image override (registry/repo:tag) — set by azd.')
param studioImageOverride string = ''

var tags = {
  workload: 'sovera'
  env: env
  dataResidency: 'FR'
  compliance: 'HDS,HIPAA,ISO27001'
  managedBy: 'bicep'
}

// ---------------------------------------------------------------------------
// 1. Resource group + region lock
// ---------------------------------------------------------------------------
resource rg 'Microsoft.Resources/resourceGroups@2024-11-01' = {
  name: rgName
  location: location
  tags: tags
}

module regionLock 'modules/policy-region-lock.bicep' = {
  name: 'policy-region-lock'
  params: { allowedLocation: location }
}

// ---------------------------------------------------------------------------
// 2. Landing zone (Phase 0)
// ---------------------------------------------------------------------------
module landingZone 'modules/landing-zone.bicep' = {
  scope: rg
  name: 'landing-zone'
  params: {
    location: location
    tags: tags
    adminGroupObjectId: adminGroupObjectId
    adminPrincipalType: adminPrincipalType
  }
}

// ---------------------------------------------------------------------------
// 3. Data plane (Phase 1)
// ---------------------------------------------------------------------------
module postgres 'modules/postgres.bicep' = {
  scope: rg
  name: 'postgres'
  params: {
    location: location
    tags: tags
    subnetId: landingZone.outputs.pgSubnetId
    privateDnsZoneId: landingZone.outputs.pgPrivateDnsZoneId
    keyVaultName: landingZone.outputs.keyVaultName
    cmkKeyName: landingZone.outputs.pgCmkKeyName
    cmkUserAssignedIdentityId: landingZone.outputs.cmkIdentityId
    adminLogin: pgAdminLogin
    adminPassword: pgAdminPassword
    adminGroupObjectId: adminGroupObjectId
    adminPrincipalType: adminPrincipalType
    adminPrincipalName: adminPrincipalType == 'User' ? 'sovera-admin-user' : 'sovera-admins'
    logAnalyticsId: landingZone.outputs.logAnalyticsId
  }
}

module storage 'modules/storage.bicep' = {
  scope: rg
  name: 'storage'
  params: {
    location: location
    tags: tags
    subnetId: landingZone.outputs.dataSubnetId
    blobPrivateDnsZoneId: landingZone.outputs.blobPrivateDnsZoneId
    keyVaultUri: landingZone.outputs.keyVaultUri
    cmkKeyName: landingZone.outputs.blobCmkKeyName
    cmkUserAssignedIdentityId: landingZone.outputs.cmkIdentityId
    logAnalyticsId: landingZone.outputs.logAnalyticsId
  }
}

module eventhub 'modules/eventhub.bicep' = {
  scope: rg
  name: 'eventhub'
  params: {
    location: location
    tags: tags
    subnetId: landingZone.outputs.dataSubnetId
    privateDnsZoneId: landingZone.outputs.eventHubPrivateDnsZoneId
    logAnalyticsId: landingZone.outputs.logAnalyticsId
  }
}

// ---------------------------------------------------------------------------
// 4. API plane (Phase 2)
// ---------------------------------------------------------------------------
module apiPlane 'modules/api-plane.bicep' = if (deployApiPlane) {
  scope: rg
  name: 'api-plane'
  params: {
    location: location
    tags: tags
    appsSubnetId: landingZone.outputs.appsSubnetId
    funcSubnetId: landingZone.outputs.funcSubnetId
    dataSubnetId: landingZone.outputs.dataSubnetId
    apimSubnetId: landingZone.outputs.apimSubnetId
    webPubSubPrivateDnsZoneId: landingZone.outputs.webPubSubPrivateDnsZoneId
    logAnalyticsId: landingZone.outputs.logAnalyticsId
    logAnalyticsCustomerId: landingZone.outputs.logAnalyticsCustomerId
    logAnalyticsName: landingZone.outputs.logAnalyticsName
    appInsightsId: landingZone.outputs.appInsightsId
    appInsightsConnectionString: landingZone.outputs.appInsightsConnectionString
    cmkIdentityId: landingZone.outputs.cmkIdentityId
    keyVaultName: landingZone.outputs.keyVaultName
    postgresFqdn: postgres.outputs.fqdn
    eventHubNamespaceFqdn: '${eventhub.outputs.namespaceName}.servicebus.windows.net'
    eventHubName: eventhub.outputs.walHubName
    deployDab: deployDab
    deployApim: deployApim
    apimPublisherEmail: apimPublisherEmail
    oidcMetadataUrl: oidcMetadataUrl
    jwtAudience: jwtAudience
    jwtIssuer: jwtIssuer
  }
}

// ---------------------------------------------------------------------------
// 4b. Studio (Phase 4) — Container App + ACR for the admin UI
// ---------------------------------------------------------------------------
module studio 'modules/studio.bicep' = if (deployStudio && deployApiPlane) {
  scope: rg
  name: 'studio'
  params: {
    location: location
    tags: tags
    environmentId: apiPlane.outputs.acaEnvironmentId
    userAssignedIdentityId: landingZone.outputs.cmkIdentityId
    userAssignedIdentityPrincipalId: landingZone.outputs.cmkIdentityPrincipalId
    apimGatewayUrl: deployApim ? 'https://${apiPlane.outputs.apimName}.azure-api.net' : ''
    authority: oidcMetadataUrl
    clientId: jwtAudience
    imageTag: studioImageTag
    imageOverride: studioImageOverride
  }
}

// ---------------------------------------------------------------------------
// 5. Compliance pack (Phase 6) — Sentinel analytics + workbook
// ---------------------------------------------------------------------------
module sentinel 'modules/sentinel.bicep' = if (deploySentinel) {
  scope: rg
  name: 'sentinel'
  params: {
    location: location
    tags: tags
    logAnalyticsWorkspaceName: landingZone.outputs.logAnalyticsName
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
output resourceGroupName string = rg.name
output keyVaultName string = landingZone.outputs.keyVaultName
output postgresFqdn string = postgres.outputs.fqdn
output storageAccountName string = storage.outputs.accountName
output eventHubNamespace string = eventhub.outputs.namespaceName
output logAnalyticsId string = landingZone.outputs.logAnalyticsId
output studioUrl string = (deployStudio && deployApiPlane) ? studio!.outputs.studioUrl : ''
output studioRegistry string = (deployStudio && deployApiPlane) ? studio!.outputs.registryLoginServer : ''
