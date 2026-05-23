using 'main.bicep'

param rgName = 'sovera'
param location = 'francecentral'
param env = 'prod'

// REPLACE with the objectId of your "Sovera Admins" Entra group
param adminGroupObjectId = '00000000-0000-0000-0000-000000000000'

param pgAdminLogin = 'soveraadmin'
// Use `azd env set` or `--parameters pgAdminPassword=...` at deploy time.
// Do NOT commit a real password.
param pgAdminPassword = readEnvironmentVariable('PG_ADMIN_PASSWORD', '')

// --- Phase 2 ---------------------------------------------------------------
param deployApiPlane = true
// Flip to true after creating the KV secret `dab-pg-connection`
// and configuring Entra External ID (Phase 3).
param deployDab = false
param deployApim = false

param apimPublisherEmail = 'ops@sovera.fr'
param oidcMetadataUrl = ''
param jwtAudience = ''
param jwtIssuer = ''
