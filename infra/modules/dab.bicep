// ============================================================================
//  Data API Builder (DAB) — REST + GraphQL on top of Postgres
//  Microsoft-owned, MIT, GA. Image: mcr.microsoft.com/azure-databases/data-api-builder
// ============================================================================
targetScope = 'resourceGroup'

param location string
param tags object
param environmentId string
param postgresFqdn string
@description('Postgres database name DAB connects to.')
param pgDatabase string = 'sovera'
@description('Existing user-assigned identity that has Postgres + Key Vault access.')
param userAssignedIdentityId string
param keyVaultName string
@description('Key Vault secret name holding the DAB Postgres connection string.')
param pgConnSecretName string = 'dab-pg-connection'
@description('Key Vault secret name holding the JWT signing key (or set issuer/audience and use JWKS).')
param jwtIssuer string
param jwtAudience string

var prefix = 'sovera'

resource dab 'Microsoft.App/containerApps@2024-10-02-preview' = {
  name: '${prefix}-dab'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${userAssignedIdentityId}': {} }
  }
  properties: {
    environmentId: environmentId
    workloadProfileName: 'D4'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 5000
        transport: 'auto'
        allowInsecure: false
        traffic: [ { latestRevision: true, weight: 100 } ]
      }
      secrets: [
        {
          name: 'pg-connection'
          keyVaultUrl: 'https://${keyVaultName}.vault.azure.net/secrets/${pgConnSecretName}'
          identity: userAssignedIdentityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'dab'
          image: 'mcr.microsoft.com/azure-databases/data-api-builder:latest'
          resources: { cpu: json('1.0'), memory: '2Gi' }
          env: [
            { name: 'DAB_ENVIRONMENT', value: 'Production' }
            { name: 'PG_FQDN', value: postgresFqdn }
            { name: 'PG_DB', value: pgDatabase }
            { name: 'CONNSTR', secretRef: 'pg-connection' }
            { name: 'JWT_ISSUER', value: jwtIssuer }
            { name: 'JWT_AUDIENCE', value: jwtAudience }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/health', port: 5000 }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: { path: '/health', port: 5000 }
              initialDelaySeconds: 5
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: 2
        maxReplicas: 10
        rules: [
          {
            name: 'http'
            http: { metadata: { concurrentRequests: '100' } }
          }
        ]
      }
    }
  }
}

output fqdn string = dab.properties.configuration.ingress.fqdn
output appId string = dab.id
output appName string = dab.name
