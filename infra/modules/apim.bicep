// ============================================================================
//  API Management Premium — VNet-injected, the only public surface.
//  Hosts: WAF (via Front Door upstream — Phase 6), JWT validation, rate limit.
// ============================================================================
targetScope = 'resourceGroup'

param location string
param tags object
param apimSubnetId string
param logAnalyticsId string
param appInsightsId string
param publisherEmail string
param publisherName string = 'Sovera'

@description('Backend URL for DAB (internal ACA FQDN with https://).')
param dabBackendUrl string
@description('Backend URL for Functions (https://...azurewebsites.net).')
param functionsBackendUrl string
@description('Web PubSub hub negotiate URL (Functions endpoint that returns a client access token).')
param webPubSubNegotiateUrl string

@description('Web PubSub resource name (used to build the management URL for native negotiate).')
param webPubSubName string = ''

@description('Entra External ID OpenID metadata URL, e.g. https://<tenant>.ciamlogin.com/<tenantId>/v2.0/.well-known/openid-configuration')
param oidcMetadataUrl string
@description('Expected JWT audience (your APIM client app id).')
param jwtAudience string

var prefix = 'sovera'
var uniq = uniqueString(resourceGroup().id)

resource apim 'Microsoft.ApiManagement/service@2024-06-01-preview' = {
  name: '${prefix}-apim-${uniq}'
  location: location
  tags: tags
  sku: {
    name: 'Premium'
    capacity: 1
  }
  identity: { type: 'SystemAssigned' }
  properties: {
    publisherEmail: publisherEmail
    publisherName: publisherName
    virtualNetworkType: 'Internal'
    virtualNetworkConfiguration: {
      subnetResourceId: apimSubnetId
    }
    publicNetworkAccess: 'Disabled'
    apiVersionConstraint: { minApiVersion: '2021-08-01' }
  }
}

// ---------------------------------------------------------------------------
// Logger (App Insights) + diagnostic
// ---------------------------------------------------------------------------
resource logger 'Microsoft.ApiManagement/service/loggers@2024-06-01-preview' = {
  parent: apim
  name: 'appi'
  properties: {
    loggerType: 'applicationInsights'
    resourceId: appInsightsId
    credentials: {
      instrumentationKey: reference(appInsightsId, '2020-02-02').InstrumentationKey
    }
  }
}

resource apimDiag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: apim
  name: 'to-law'
  properties: {
    workspaceId: logAnalyticsId
    logs: [ { categoryGroup: 'allLogs', enabled: true } ]
    metrics: [ { category: 'AllMetrics', enabled: true } ]
  }
}

// ---------------------------------------------------------------------------
// Named values (config)
// ---------------------------------------------------------------------------
resource nvOidc 'Microsoft.ApiManagement/service/namedValues@2024-06-01-preview' = {
  parent: apim
  name: 'oidc-metadata-url'
  properties: { displayName: 'oidc-metadata-url', value: oidcMetadataUrl, secret: false }
}

resource nvAud 'Microsoft.ApiManagement/service/namedValues@2024-06-01-preview' = {
  parent: apim
  name: 'jwt-audience'
  properties: { displayName: 'jwt-audience', value: jwtAudience, secret: false }
}

// ---------------------------------------------------------------------------
// Global policy — JWT validation + rate limiting + security headers
// ---------------------------------------------------------------------------
resource globalPolicy 'Microsoft.ApiManagement/service/policies@2024-06-01-preview' = {
  parent: apim
  name: 'policy'
  properties: {
    format: 'rawxml'
    value: '''<policies>
  <inbound>
    <base />
    <validate-jwt header-name="Authorization" failed-validation-httpcode="401" require-scheme="Bearer" require-signed-tokens="true" output-token-variable-name="jwt">
      <openid-config url="{{oidc-metadata-url}}" />
      <audiences>
        <audience>{{jwt-audience}}</audience>
      </audiences>
      <required-claims>
        <claim name="sub" match="any" />
      </required-claims>
    </validate-jwt>
    <rate-limit-by-key calls="600" renewal-period="60" counter-key="@(context.Request.IpAddress)" />
    <quota-by-key calls="100000" renewal-period="86400" counter-key="@((string)context.Request.Headers.GetValueOrDefault(&quot;Authorization&quot;,&quot;anon&quot;))" />
    <!-- Stamp identity headers for downstream services. DAB reads these into
         the Postgres session via set-session-context. -->
    <set-header name="X-Tenant-Id" exists-action="override">
      <value>@(((Jwt)context.Variables["jwt"]).Claims.GetValueOrDefault("extension_tenantId", ((Jwt)context.Variables["jwt"]).Claims.GetValueOrDefault("tid","")))</value>
    </set-header>
    <set-header name="X-User-Sub" exists-action="override">
      <value>@(((Jwt)context.Variables["jwt"]).Claims.GetValueOrDefault("sub",""))</value>
    </set-header>
    <set-header name="X-User-Email" exists-action="override">
      <value>@(((Jwt)context.Variables["jwt"]).Claims.GetValueOrDefault("email",""))</value>
    </set-header>
    <set-header name="X-MS-API-ROLE" exists-action="override">
      <value>authenticated</value>
    </set-header>
  </inbound>
  <backend><base /></backend>
  <outbound>
    <base />
    <set-header name="Strict-Transport-Security" exists-action="override"><value>max-age=63072000; includeSubDomains; preload</value></set-header>
    <set-header name="X-Content-Type-Options" exists-action="override"><value>nosniff</value></set-header>
    <set-header name="Referrer-Policy" exists-action="override"><value>no-referrer</value></set-header>
    <set-header name="X-Frame-Options" exists-action="override"><value>DENY</value></set-header>
    <set-header name="Server" exists-action="delete" />
    <set-header name="X-Powered-By" exists-action="delete" />
  </outbound>
  <on-error><base /></on-error>
</policies>'''
  }
  dependsOn: [ nvOidc, nvAud ]
}

// ---------------------------------------------------------------------------
// Backends
// ---------------------------------------------------------------------------
resource beDab 'Microsoft.ApiManagement/service/backends@2024-06-01-preview' = {
  parent: apim
  name: 'dab'
  properties: {
    url: dabBackendUrl
    protocol: 'http'
    tls: { validateCertificateChain: true, validateCertificateName: true }
  }
}

resource beFn 'Microsoft.ApiManagement/service/backends@2024-06-01-preview' = {
  parent: apim
  name: 'functions'
  properties: {
    url: functionsBackendUrl
    protocol: 'http'
    tls: { validateCertificateChain: true, validateCertificateName: true }
  }
}

// ---------------------------------------------------------------------------
// API: /data → DAB (REST + GraphQL passthrough)
// ---------------------------------------------------------------------------
resource apiData 'Microsoft.ApiManagement/service/apis@2024-06-01-preview' = {
  parent: apim
  name: 'data'
  properties: {
    displayName: 'Data API'
    path: 'data'
    protocols: [ 'https' ]
    serviceUrl: dabBackendUrl
    subscriptionRequired: false
  }
}

resource apiDataAll 'Microsoft.ApiManagement/service/apis/operations@2024-06-01-preview' = {
  parent: apiData
  name: 'all'
  properties: {
    displayName: 'All'
    method: 'GET'
    urlTemplate: '/*'
  }
}

// ---------------------------------------------------------------------------
// API: /functions → Functions Flex
// ---------------------------------------------------------------------------
resource apiFn 'Microsoft.ApiManagement/service/apis@2024-06-01-preview' = {
  parent: apim
  name: 'functions'
  properties: {
    displayName: 'Edge Functions'
    path: 'functions/v1'
    protocols: [ 'https' ]
    serviceUrl: functionsBackendUrl
    subscriptionRequired: false
  }
}

// ---------------------------------------------------------------------------
// API: /realtime/negotiate → Functions endpoint that returns Web PubSub token
// ---------------------------------------------------------------------------
resource apiRt 'Microsoft.ApiManagement/service/apis@2024-06-01-preview' = {
  parent: apim
  name: 'realtime'
  properties: {
    displayName: 'Realtime'
    path: 'realtime'
    protocols: [ 'https' ]
    serviceUrl: webPubSubNegotiateUrl
    subscriptionRequired: false
  }
}

output gatewayUrl string = apim.properties.gatewayUrl
output apimName string = apim.name
output apimPrincipalId string = apim.identity.principalId
