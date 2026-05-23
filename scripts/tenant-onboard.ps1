<#
.SYNOPSIS
  Onboard a new Sovera tenant.

.DESCRIPTION
  End-to-end:
    1. Reads shared-platform resource names from the `sovera` RG outputs.
    2. Deploys infra/modules/tenant.bicep — creates per-tenant DB, blob
       container, Web PubSub hub, APIM product + subscription, KV secrets.
    3. Runs services/db/tenant-bootstrap.sql against the new database.
    4. Prints credentials + tenant config block ready to paste into the
       control-plane registry.

.PARAMETER Slug
  Lowercase tenant slug (3-20 chars, [a-z0-9-]).

.PARAMETER DisplayName
  Human-readable name shown in APIM and admin UI.

.PARAMETER Tier
  starter | pro | enterprise

.PARAMETER ResourceGroup
  Shared platform RG. Defaults to 'sovera'.

.EXAMPLE
  ./tenant-onboard.ps1 -Slug acme -DisplayName 'Acme Health' -Tier enterprise
#>
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-z0-9][a-z0-9-]{2,19}$')]
  [string]$Slug,
  [Parameter(Mandatory)][string]$DisplayName,
  [ValidateSet('starter','pro','enterprise')][string]$Tier = 'pro',
  [string]$ResourceGroup = 'sovera',
  [string]$AdminGroupObjectId = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Write-Host "==> Sovera tenant onboarding: $Slug ($Tier)" -ForegroundColor Cyan

# --------------------------------------------------------------------------
# 1. Discover shared platform names from RG
# --------------------------------------------------------------------------
Write-Host "[1/4] Discovering platform resources in RG '$ResourceGroup'..." -ForegroundColor Yellow

$pgServer = az postgres flexible-server list -g $ResourceGroup --query "[0].name" -o tsv
$storageAcct = az storage account list -g $ResourceGroup --query "[?starts_with(name, 'soverast')].name | [0]" -o tsv
$wpsName = az webpubsub list -g $ResourceGroup --query "[0].name" -o tsv
$kvName = az keyvault list -g $ResourceGroup --query "[?starts_with(name, 'sovera-kv')].name | [0]" -o tsv
$apimName = az apim list -g $ResourceGroup --query "[0].name" -o tsv 2>$null
if (-not $apimName) { $apimName = '' }

foreach ($p in @('pgServer','storageAcct','wpsName','kvName')) {
  if (-not (Get-Variable $p -ValueOnly)) {
    throw "Required platform resource not found: $p"
  }
}

Write-Host "  pg:       $pgServer"
Write-Host "  storage:  $storageAcct"
Write-Host "  webpubsub:$wpsName"
Write-Host "  kv:       $kvName"
Write-Host "  apim:     $(if ($apimName) { $apimName } else { '(not deployed)' })"

# --------------------------------------------------------------------------
# 2. Deploy tenant Bicep
# --------------------------------------------------------------------------
Write-Host "[2/4] Deploying tenant module..." -ForegroundColor Yellow

$env:TENANT_SLUG = $Slug
$env:TENANT_DISPLAY_NAME = $DisplayName
$env:TENANT_TIER = $Tier
$env:PG_SERVER_NAME = $pgServer
$env:STORAGE_ACCOUNT_NAME = $storageAcct
$env:WEBPUBSUB_NAME = $wpsName
$env:APIM_NAME = $apimName
$env:KEYVAULT_NAME = $kvName
$env:TENANT_ADMIN_GROUP_OID = $AdminGroupObjectId

$deployName = "tenant-$Slug-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))"
$result = az deployment group create `
  --resource-group $ResourceGroup `
  --name $deployName `
  --template-file "$root/infra/modules/tenant.bicep" `
  --parameters "$root/infra/tenant.bicepparam" `
  --query 'properties.outputs' -o json | ConvertFrom-Json

$dbName = $result.dbName.value
$tenantId = $result.tenantId.value
$containerName = $result.containerName.value
$hubName = $result.hubName.value

Write-Host "  tenantId:  $tenantId"
Write-Host "  db:        $dbName"
Write-Host "  container: $containerName"
Write-Host "  hub:       $hubName"

# --------------------------------------------------------------------------
# 3. Run per-tenant SQL bootstrap
# --------------------------------------------------------------------------
Write-Host "[3/4] Running per-tenant SQL bootstrap..." -ForegroundColor Yellow

$pgFqdn = az postgres flexible-server show -g $ResourceGroup -n $pgServer --query 'fullyQualifiedDomainName' -o tsv
$adminUpn = az ad signed-in-user show --query userPrincipalName -o tsv

# Get an Entra access token for Postgres
$pgToken = az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv

# Generate a strong dab_app password for this tenant DB
$dabPwd = -join ((48..57) + (65..90) + (97..122) + (33,35,37,38,42,43,45,95) | Get-Random -Count 32 | ForEach-Object { [char]$_ })

$env:PGPASSWORD = $pgToken
psql "host=$pgFqdn port=5432 dbname=$dbName user=$adminUpn sslmode=require" `
  -v "tenant_id=$tenantId" `
  -v "dab_password=$dabPwd" `
  -f "$root/services/db/tenant-bootstrap.sql"
if ($LASTEXITCODE -ne 0) { throw "tenant-bootstrap.sql failed" }
Remove-Item Env:PGPASSWORD

# Store the dab_app password in Key Vault
az keyvault secret set --vault-name $kvName `
  --name "tenant-$Slug-dab-password" `
  --value $dabPwd `
  --content-type 'text/plain' | Out-Null

# Compose the full DAB connection string for this tenant and store it too
$dabConn = "Host=$pgFqdn;Database=$dbName;Username=dab_app;Password=$dabPwd;SslMode=Require;Trust Server Certificate=true"
az keyvault secret set --vault-name $kvName `
  --name "tenant-$Slug-dab-connection" `
  --value $dabConn `
  --content-type 'text/plain' | Out-Null

# --------------------------------------------------------------------------
# 4. Print summary
# --------------------------------------------------------------------------
Write-Host "[4/4] Done." -ForegroundColor Green
Write-Host ""
Write-Host "===== Tenant '$Slug' is live =====" -ForegroundColor Cyan
$summary = [pscustomobject]@{
  tenantSlug       = $Slug
  tenantId         = $tenantId
  tier             = $Tier
  database         = $dbName
  blobContainer    = $containerName
  webPubSubHub     = $hubName
  apimProduct      = $result.productName.value
  apimSubscription = $result.subscriptionName.value
  rateLimit        = $result.rateLimit.value
  quota            = $result.quota.value
  storageQuotaGB   = $result.storageQuotaGB.value
  maxClients       = $result.maxClients.value
  secrets          = @(
    "tenant-$Slug-dab-password"
    "tenant-$Slug-dab-connection"
    "tenant-$Slug-pg-database"
    "tenant-$Slug-blob-container"
    "tenant-$Slug-wps-hub"
    "tenant-$Slug-tid"
  )
}
$summary | ConvertTo-Json -Depth 5
