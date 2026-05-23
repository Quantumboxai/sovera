// ============================================================================
//  Tenant deployment parameters.
//  Usage:
//    az deployment group create \
//      --resource-group sovera \
//      --template-file infra/modules/tenant.bicep \
//      --parameters infra/tenant.bicepparam \
//      --parameters tenantSlug=acme tenantDisplayName='Acme Health' tier=enterprise
//
//  The platform names below come from `azd env get-values` or your
//  `main.bicep` outputs after the shared platform is deployed.
// ============================================================================
using './modules/tenant.bicep'

param tenantSlug = readEnvironmentVariable('TENANT_SLUG', 'acme')
param tenantDisplayName = readEnvironmentVariable('TENANT_DISPLAY_NAME', 'Acme Health')
param tier = readEnvironmentVariable('TENANT_TIER', 'pro')

// Shared platform names (filled in by the onboarding script from main outputs)
param postgresServerName = readEnvironmentVariable('PG_SERVER_NAME', '')
param storageAccountName = readEnvironmentVariable('STORAGE_ACCOUNT_NAME', '')
param webPubSubName = readEnvironmentVariable('WEBPUBSUB_NAME', '')
param apimName = readEnvironmentVariable('APIM_NAME', '')
param keyVaultName = readEnvironmentVariable('KEYVAULT_NAME', '')

// Optional: per-tenant Entra group OID for DB admin federation
param tenantAdminGroupObjectId = readEnvironmentVariable('TENANT_ADMIN_GROUP_OID', '')
