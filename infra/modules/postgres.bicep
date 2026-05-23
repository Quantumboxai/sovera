// ============================================================================
//  PostgreSQL Flexible Server — HA, CMK, pgvector, private VNet integration
// ============================================================================
targetScope = 'resourceGroup'

param location string
param tags object
param subnetId string
param privateDnsZoneId string
param keyVaultName string
param cmkKeyName string
param cmkUserAssignedIdentityId string
param adminLogin string
@secure()
param adminPassword string
param adminGroupObjectId string

@allowed([ 'Group', 'User', 'ServicePrincipal' ])
param adminPrincipalType string = 'Group'

@description('Friendly label shown in Postgres for the Entra admin.')
param adminPrincipalName string = 'sovera-admins'
param logAnalyticsId string

@allowed([ 'Standard_D2ds_v5', 'Standard_D4ds_v5', 'Standard_D8ds_v5', 'Standard_E4ds_v5', 'Standard_E8ds_v5' ])
param skuName string = 'Standard_D4ds_v5'

@allowed([ 'GeneralPurpose', 'MemoryOptimized' ])
param skuTier string = 'GeneralPurpose'

@allowed([ '15', '16' ])
param pgVersion string = '16'

var prefix = 'sovera'
var uniq = uniqueString(resourceGroup().id)

resource kv 'Microsoft.KeyVault/vaults@2024-11-01' existing = {
  name: keyVaultName
}

resource cmkKey 'Microsoft.KeyVault/vaults/keys@2024-11-01' existing = {
  parent: kv
  name: cmkKeyName
}

resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${prefix}-pg-${uniq}'
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuTier
  }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${cmkUserAssignedIdentityId}': {}
    }
  }
  properties: {
    version: pgVersion
    administratorLogin: adminLogin
    administratorLoginPassword: adminPassword
    storage: {
      storageSizeGB: 256
      autoGrow: 'Enabled'
      tier: 'P20'
    }
    backup: {
      backupRetentionDays: 35
      geoRedundantBackup: 'Disabled'   // HDS: keep within FR. Use cross-region replica instead.
    }
    highAvailability: {
      mode: 'ZoneRedundant'
    }
    network: {
      delegatedSubnetResourceId: subnetId
      privateDnsZoneArmResourceId: privateDnsZoneId
      publicNetworkAccess: 'Disabled'
    }
    authConfig: {
      activeDirectoryAuth: 'Enabled'
      passwordAuth: 'Enabled'
      tenantId: subscription().tenantId
    }
    dataEncryption: {
      type: 'AzureKeyVault'
      primaryKeyURI: cmkKey.properties.keyUriWithVersion
      primaryUserAssignedIdentityId: cmkUserAssignedIdentityId
    }
  }
}

// ---------------------------------------------------------------------------
// Server configuration — required extensions + audit
// ---------------------------------------------------------------------------
var sharedPreloadLibraries = 'pg_cron,pgaudit,pg_stat_statements'

resource cfgPreload 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: pg
  name: 'shared_preload_libraries'
  properties: {
    value: sharedPreloadLibraries
    source: 'user-override'
  }
}

resource cfgAzExt 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: pg
  name: 'azure.extensions'
  properties: {
    value: 'PGAUDIT,PGCRYPTO,PG_CRON,PG_STAT_STATEMENTS,VECTOR,UUID-OSSP,CITEXT,HSTORE,LTREE,PG_TRGM'
    source: 'user-override'
  }
  dependsOn: [ cfgPreload ]
}

resource cfgPgaudit 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: pg
  name: 'pgaudit.log'
  properties: {
    value: 'WRITE,DDL,ROLE'
    source: 'user-override'
  }
  dependsOn: [ cfgAzExt ]
}

resource cfgLogConn 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: pg
  name: 'log_connections'
  properties: { value: 'on', source: 'user-override' }
  dependsOn: [ cfgPgaudit ]
}

resource cfgLogDisc 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: pg
  name: 'log_disconnections'
  properties: { value: 'on', source: 'user-override' }
  dependsOn: [ cfgLogConn ]
}

// Logical replication for the future Realtime bridge
resource cfgWalLevel 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: pg
  name: 'wal_level'
  properties: { value: 'logical', source: 'user-override' }
  dependsOn: [ cfgLogDisc ]
}

// ---------------------------------------------------------------------------
// Entra admin — DEFERRED. Postgres returns 'Ready' before activeDirectoryAuth
// finishes settling, causing intermittent 409 Conflict on the admin resource.
// Run instead from main.bicep post-deploy via az CLI (see README).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------
resource diag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: pg
  name: 'to-law'
  properties: {
    workspaceId: logAnalyticsId
    logs: [
      { categoryGroup: 'allLogs', enabled: true }
      { categoryGroup: 'audit', enabled: true }
    ]
    metrics: [ { category: 'AllMetrics', enabled: true } ]
  }
}

output fqdn string = pg.properties.fullyQualifiedDomainName
output serverId string = pg.id
output serverName string = pg.name
