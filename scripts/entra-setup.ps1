<#
.SYNOPSIS
  Provisions Entra External ID app registrations for Sovera.

.DESCRIPTION
  Creates three app registrations in your Entra External ID (CIAM) tenant:
    1. sovera-api      — the API audience (DAB + APIM validate tokens against this).
    2. sovera-studio   — the admin SPA (interactive login).
    3. sovera-sample   — the customer-facing SPA (interactive login).

  The script writes an `entra.env` file that you can `cat` into `.env` for the
  sample app and source for the Bicep parameters (oidcMetadataUrl, jwtAudience,
  jwtIssuer).

  Run AFTER you have:
    - Created the External ID tenant in the Azure portal
      (https://learn.microsoft.com/entra/external-id/customers/quickstart-tenant-setup)
    - `az login --tenant <ciam-tenant-id> --allow-no-subscriptions`

.PARAMETER TenantId
  The Entra External ID tenant ID (GUID).

.PARAMETER StudioRedirectUri
  Reply URL for the admin SPA. Default: http://localhost:5173

.PARAMETER SampleRedirectUri
  Reply URL for the sample SPA. Default: http://localhost:3000
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$TenantId,
  [string]$StudioRedirectUri = 'http://localhost:5173',
  [string]$SampleRedirectUri = 'http://localhost:3000'
)

$ErrorActionPreference = 'Stop'
Write-Host "Tenant: $TenantId" -ForegroundColor Cyan

# 1. API app -----------------------------------------------------------------
$api = az ad app create `
  --display-name 'sovera-api' `
  --sign-in-audience 'AzureADMyOrg' `
  --identifier-uris "api://sovera" `
  | ConvertFrom-Json

# Expose a default scope so other apps can request it
$apiScopeId = [guid]::NewGuid().ToString()
$apiManifest = @{
  api = @{
    requestedAccessTokenVersion = 2
    oauth2PermissionScopes = @(
      @{
        id                      = $apiScopeId
        adminConsentDescription = 'Access Sovera as the signed-in user.'
        adminConsentDisplayName = 'Access Sovera'
        isEnabled               = $true
        type                    = 'User'
        userConsentDescription  = 'Access Sovera on your behalf.'
        userConsentDisplayName  = 'Access Sovera'
        value                   = 'access_as_user'
      }
    )
  }
} | ConvertTo-Json -Depth 8

$tempApi = New-TemporaryFile
$apiManifest | Set-Content -Path $tempApi
az ad app update --id $api.appId --set "api=$(Get-Content $tempApi -Raw)" 2>$null
az rest --method PATCH `
  --url "https://graph.microsoft.com/v1.0/applications/$($api.id)" `
  --headers 'Content-Type=application/json' `
  --body (@{ api = (ConvertFrom-Json $apiManifest).api } | ConvertTo-Json -Depth 8 -Compress) | Out-Null
Remove-Item $tempApi -Force

Write-Host "API app: $($api.appId)  (scope: api://sovera/access_as_user)" -ForegroundColor Green

# 2. Studio SPA --------------------------------------------------------------
$studio = az ad app create `
  --display-name 'sovera-studio' `
  --sign-in-audience 'AzureADMyOrg' `
  --public-client-redirect-uris $StudioRedirectUri `
  | ConvertFrom-Json

# Convert to SPA platform via Graph (CLI lacks --spa-redirect-uris)
$spaPatch = @{ spa = @{ redirectUris = @($StudioRedirectUri) } } | ConvertTo-Json -Depth 5 -Compress
az rest --method PATCH `
  --url "https://graph.microsoft.com/v1.0/applications/$($studio.id)" `
  --headers 'Content-Type=application/json' `
  --body $spaPatch | Out-Null

# Grant access to the API scope
az ad app permission add --id $studio.appId `
  --api $api.appId `
  --api-permissions "$apiScopeId=Scope" | Out-Null
Write-Host "Studio SPA: $($studio.appId)" -ForegroundColor Green

# 3. Sample SPA --------------------------------------------------------------
$sample = az ad app create `
  --display-name 'sovera-sample' `
  --sign-in-audience 'AzureADMyOrg' `
  | ConvertFrom-Json

$spaPatch = @{ spa = @{ redirectUris = @($SampleRedirectUri) } } | ConvertTo-Json -Depth 5 -Compress
az rest --method PATCH `
  --url "https://graph.microsoft.com/v1.0/applications/$($sample.id)" `
  --headers 'Content-Type=application/json' `
  --body $spaPatch | Out-Null

az ad app permission add --id $sample.appId `
  --api $api.appId `
  --api-permissions "$apiScopeId=Scope" | Out-Null
Write-Host "Sample SPA: $($sample.appId)" -ForegroundColor Green

# 4. Custom claim mapping: add `tid` (tenant) and `roles` --------------------
# In Entra External ID you typically use custom user attributes + token augment
# via custom authentication extension. For Sovera we map:
#   - oid  → sub (already in token)
#   - extension_tenantId → tid  (configured in Portal: User attributes)
#
# Run this manually in the Portal: Identity > External Identities >
# User attributes > Add "tenantId" (String). Then add it as an Application
# claim on the sovera-api app. The SDK and DAB read it as `tid`.

# 5. Output ------------------------------------------------------------------
$out = @"
# Sovera — Entra External ID environment
ENTRA_TENANT_ID=$TenantId
OIDC_AUTHORITY=https://$TenantId.ciamlogin.com/$TenantId/v2.0
OIDC_METADATA_URL=https://$TenantId.ciamlogin.com/$TenantId/v2.0/.well-known/openid-configuration
JWT_ISSUER=https://$TenantId.ciamlogin.com/$TenantId/v2.0
JWT_AUDIENCE=$($api.appId)
API_APP_ID=$($api.appId)
API_SCOPE=api://sovera/access_as_user
STUDIO_APP_ID=$($studio.appId)
SAMPLE_APP_ID=$($sample.appId)
"@

$out | Set-Content -Path 'entra.env' -Encoding utf8
Write-Host ""
Write-Host "Wrote entra.env. Use the values to set Bicep params:" -ForegroundColor Yellow
Write-Host "  oidcMetadataUrl = `$OIDC_METADATA_URL"
Write-Host "  jwtAudience     = `$JWT_AUDIENCE"
Write-Host "  jwtIssuer       = `$JWT_ISSUER"
