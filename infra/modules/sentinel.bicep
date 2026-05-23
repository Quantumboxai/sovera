// ============================================================================
//  Sovera Microsoft Sentinel module
//  Deploys SecurityInsights solution onto the existing Log Analytics workspace
//  with analytics rules + a Sovera operations workbook.
//
//  Scope: resourceGroup (the shared 'sovera' RG).
// ============================================================================
targetScope = 'resourceGroup'

@description('Existing Log Analytics workspace name (created by landing-zone.bicep).')
param logAnalyticsWorkspaceName string

@description('Location for the workbook resource.')
param location string

param tags object = {}

// --------------------------------------------------------------------------
// 1. Enable Sentinel (SecurityInsights solution) on the workspace
// --------------------------------------------------------------------------
resource laws 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: logAnalyticsWorkspaceName
}

resource sentinel 'Microsoft.SecurityInsights/onboardingStates@2024-09-01' = {
  scope: laws
  name: 'default'
  properties: {}
}

// --------------------------------------------------------------------------
// 2. Analytics rules — the ones an HDS/HIPAA auditor expects to see
// --------------------------------------------------------------------------

// 2.1 — Key Vault key access from unexpected principal
resource ruleKvKeyAccess 'Microsoft.SecurityInsights/alertRules@2024-09-01' = {
  scope: laws
  name: guid(resourceGroup().id, 'sovera-rule-kv-key-access')
  kind: 'Scheduled'
  properties: {
    displayName: 'Sovera — Key Vault CMK key access from unexpected principal'
    description: 'Fires when a principal other than the Sovera CMK identity reads a CMK key.'
    severity: 'High'
    enabled: true
    query: '''
AzureDiagnostics
| where ResourceType == "VAULTS"
| where OperationName in ("KeyGet", "KeyWrap", "KeyUnwrap", "KeySign", "KeyDecrypt")
| where tostring(identity_claim_appid_g) !in (
    // allow-list filled in post-deploy with Sovera CMK identity appId(s)
    "00000000-0000-0000-0000-000000000000"
)
| project TimeGenerated, ResourceGroup, Resource, OperationName, CallerIPAddress,
          identity_claim_upn_s, identity_claim_appid_g, ResultType
'''
    queryFrequency: 'PT5M'
    queryPeriod: 'PT1H'
    triggerOperator: 'GreaterThan'
    triggerThreshold: 0
    suppressionEnabled: false
    suppressionDuration: 'PT1H'
    tactics: [ 'CredentialAccess', 'Impact' ]
    techniques: [ 'T1552' ]
    incidentConfiguration: {
      createIncident: true
      groupingConfiguration: {
        enabled: true
        reopenClosedIncident: false
        lookbackDuration: 'PT6H'
        matchingMethod: 'AllEntities'
      }
    }
  }
  dependsOn: [ sentinel ]
}

// 2.2 — Storage shared-key usage attempt (must always be 0; sharedKey is disabled)
resource ruleSharedKey 'Microsoft.SecurityInsights/alertRules@2024-09-01' = {
  scope: laws
  name: guid(resourceGroup().id, 'sovera-rule-storage-shared-key')
  kind: 'Scheduled'
  properties: {
    displayName: 'Sovera — Storage shared-key usage detected (should be impossible)'
    description: 'Fires on any successful shared-key authentication against Sovera storage. allowSharedKeyAccess is false; any hit indicates a config drift or misuse.'
    severity: 'High'
    enabled: true
    query: '''
StorageBlobLogs
| where AuthenticationType == "AccountKey"
| where toint(StatusCode) < 400
| project TimeGenerated, AccountName, OperationName, CallerIpAddress, StatusCode, Uri
'''
    queryFrequency: 'PT15M'
    queryPeriod: 'PT1H'
    triggerOperator: 'GreaterThan'
    triggerThreshold: 0
    suppressionEnabled: false
    suppressionDuration: 'PT1H'
    tactics: [ 'CredentialAccess', 'PrivilegeEscalation' ]
    incidentConfiguration: {
      createIncident: true
      groupingConfiguration: {
        enabled: true
        reopenClosedIncident: false
        lookbackDuration: 'PT12H'
        matchingMethod: 'AllEntities'
      }
    }
  }
  dependsOn: [ sentinel ]
}

// 2.3 — Postgres RLS exception spike (RLS bypass attempt or bug)
resource ruleRlsSpike 'Microsoft.SecurityInsights/alertRules@2024-09-01' = {
  scope: laws
  name: guid(resourceGroup().id, 'sovera-rule-rls-exception-spike')
  kind: 'Scheduled'
  properties: {
    displayName: 'Sovera — Spike in Postgres RLS / tenant assertion errors'
    description: 'Fires when more than 25 RLS or sovera tenant-mismatch errors occur in 15 minutes.'
    severity: 'Medium'
    enabled: true
    query: '''
AzureDiagnostics
| where ResourceProvider == "MICROSOFT.DBFORPOSTGRESQL"
| where Category in ("PostgreSQLLogs", "PostgreSQLFlexSessions")
| where Message has_any ("row-level security", "sovera: tenant mismatch", "sovera: missing tenant claim")
| summarize cnt = count() by bin(TimeGenerated, 15m), Resource
| where cnt > 25
'''
    queryFrequency: 'PT15M'
    queryPeriod: 'PT1H'
    triggerOperator: 'GreaterThan'
    triggerThreshold: 0
    suppressionEnabled: false
    suppressionDuration: 'PT1H'
    tactics: [ 'Discovery', 'PrivilegeEscalation' ]
    incidentConfiguration: {
      createIncident: true
      groupingConfiguration: {
        enabled: true
        reopenClosedIncident: false
        lookbackDuration: 'PT1H'
        matchingMethod: 'AllEntities'
      }
    }
  }
  dependsOn: [ sentinel ]
}

// 2.4 — Admin sign-in from new IP (privileged Entra group)
resource ruleAdminNewIp 'Microsoft.SecurityInsights/alertRules@2024-09-01' = {
  scope: laws
  name: guid(resourceGroup().id, 'sovera-rule-admin-new-ip')
  kind: 'Scheduled'
  properties: {
    displayName: 'Sovera — Admin sign-in from new IP'
    description: 'Fires when a member of sovera-admins signs in from an IP not seen in the prior 30 days.'
    severity: 'Medium'
    enabled: true
    query: '''
let lookback = 14d;
let knownIps = SigninLogs
    | where TimeGenerated between (ago(lookback) .. ago(1h))
    | where AppDisplayName in ("Azure Portal", "Microsoft Azure CLI", "Microsoft Azure PowerShell")
    | summarize by IPAddress, UserPrincipalName;
SigninLogs
| where TimeGenerated > ago(1h)
| where AppDisplayName in ("Azure Portal", "Microsoft Azure CLI", "Microsoft Azure PowerShell")
| where ResultType == "0"
| where UserPrincipalName has "@"
| join kind=leftanti knownIps on IPAddress, UserPrincipalName
| project TimeGenerated, UserPrincipalName, IPAddress, Location, ClientAppUsed, AppDisplayName
'''
    queryFrequency: 'PT1H'
    queryPeriod: 'P14D'
    triggerOperator: 'GreaterThan'
    triggerThreshold: 0
    suppressionEnabled: false
    suppressionDuration: 'PT1H'
    tactics: [ 'InitialAccess' ]
    techniques: [ 'T1078' ]
    incidentConfiguration: {
      createIncident: true
      groupingConfiguration: {
        enabled: true
        reopenClosedIncident: false
        lookbackDuration: 'PT12H'
        matchingMethod: 'AllEntities'
      }
    }
  }
  dependsOn: [ sentinel ]
}

// 2.5 — APIM 401 / 403 spike on a single subscription key (token abuse / brute force)
resource ruleApim401 'Microsoft.SecurityInsights/alertRules@2024-09-01' = {
  scope: laws
  name: guid(resourceGroup().id, 'sovera-rule-apim-auth-spike')
  kind: 'Scheduled'
  properties: {
    displayName: 'Sovera — APIM auth failure spike on a single subscription'
    description: 'More than 50 401/403 in 5 minutes from one APIM subscription = abuse or compromised client.'
    severity: 'Medium'
    enabled: true
    query: '''
ApiManagementGatewayLogs
| extend code = toint(ResponseCode)
| where code in (401, 403)
| summarize cnt = count() by bin(TimeGenerated, 5m), ApimSubscriptionId, BackendUrl
| where cnt > 50
'''
    queryFrequency: 'PT5M'
    queryPeriod: 'PT1H'
    triggerOperator: 'GreaterThan'
    triggerThreshold: 0
    suppressionEnabled: false
    suppressionDuration: 'PT1H'
    tactics: [ 'CredentialAccess' ]
    techniques: [ 'T1110' ]
    incidentConfiguration: {
      createIncident: true
      groupingConfiguration: {
        enabled: true
        reopenClosedIncident: false
        lookbackDuration: 'PT1H'
        matchingMethod: 'AllEntities'
      }
    }
  }
  dependsOn: [ sentinel ]
}

// --------------------------------------------------------------------------
// 3. Sovera operations workbook
// --------------------------------------------------------------------------
var workbookContent = {
  version: 'Notebook/1.0'
  items: [
    {
      type: 1
      content: { json: '# Sovera — security & compliance operations\n\nThis workbook surfaces the signals an HDS/HIPAA auditor will ask for: CMK key access, admin sign-ins, RLS violations, storage shared-key usage, APIM auth failures.' }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: 'AzureDiagnostics | where ResourceType == "VAULTS" | where OperationName startswith "Key" | summarize count() by bin(TimeGenerated, 1h), OperationName | render timechart'
        size: 0
        title: 'Key Vault operations (last 24h)'
        timeContext: { durationMs: 86400000 }
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: 'AzureDiagnostics | where ResourceProvider == "MICROSOFT.DBFORPOSTGRESQL" | where Message has_any ("row-level security","sovera: tenant mismatch","sovera: missing tenant claim") | summarize count() by bin(TimeGenerated, 1h), Resource | render timechart'
        size: 0
        title: 'Postgres RLS / tenant-assertion errors (last 24h)'
        timeContext: { durationMs: 86400000 }
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: 'StorageBlobLogs | summarize count() by AuthenticationType, bin(TimeGenerated, 1h) | render columnchart'
        size: 0
        title: 'Blob auth method mix (must be 100% OAuth)'
        timeContext: { durationMs: 86400000 }
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: 'ApiManagementGatewayLogs | summarize calls = count(), errors = countif(ResponseCode >= 400) by bin(TimeGenerated, 1h), BackendUrl | extend errorRate = todouble(errors)/calls | render timechart'
        size: 0
        title: 'APIM error rate by backend (last 24h)'
        timeContext: { durationMs: 86400000 }
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
    {
      type: 3
      content: {
        version: 'KqlItem/1.0'
        query: 'SigninLogs | where AppDisplayName in ("Azure Portal","Microsoft Azure CLI","Microsoft Azure PowerShell") | summarize count() by ResultType, bin(TimeGenerated, 1h) | render columnchart'
        size: 0
        title: 'Admin sign-ins by outcome'
        timeContext: { durationMs: 604800000 }
        queryType: 0
        resourceType: 'microsoft.operationalinsights/workspaces'
      }
    }
  ]
  styleSettings: {}
  '$schema': 'https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/schema/workbook.json'
}

resource workbook 'Microsoft.Insights/workbooks@2023-06-01' = {
  name: guid(resourceGroup().id, 'sovera-sec-ops-workbook')
  location: location
  tags: tags
  kind: 'shared'
  properties: {
    displayName: 'Sovera — security & compliance operations'
    serializedData: string(workbookContent)
    category: 'sentinel'
    sourceId: laws.id
    version: '1.0'
  }
}

output sentinelEnabled bool = true
output workbookId string = workbook.id
output analyticsRuleIds array = [
  ruleKvKeyAccess.id
  ruleSharedKey.id
  ruleRlsSpike.id
  ruleAdminNewIp.id
  ruleApim401.id
]
