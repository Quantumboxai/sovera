// ============================================================================
//  Region-lock policy: deny any deployment outside the allowed location.
//  Scope: subscription. Built-in policy "Allowed locations" id used.
// ============================================================================
targetScope = 'subscription'

@description('The single location allowed for all resources.')
param allowedLocation string

var allowedLocationsBuiltInId = '/providers/Microsoft.Authorization/policyDefinitions/e56962a6-4747-49cd-b67b-bf8b01975c4c'
var rgLocationsBuiltInId = '/providers/Microsoft.Authorization/policyDefinitions/e765b5de-1225-4ba3-bd56-1ac6695af988'

resource resourcePolicy 'Microsoft.Authorization/policyAssignments@2024-04-01' = {
  name: 'sovera-region-lock-resources'
  properties: {
    displayName: 'Sovera — resources must be in ${allowedLocation}'
    policyDefinitionId: allowedLocationsBuiltInId
    enforcementMode: 'Default'
    parameters: {
      listOfAllowedLocations: {
        value: [
          allowedLocation
        ]
      }
    }
  }
}

resource rgPolicy 'Microsoft.Authorization/policyAssignments@2024-04-01' = {
  name: 'sovera-region-lock-rgs'
  properties: {
    displayName: 'Sovera — resource groups must be in ${allowedLocation}'
    policyDefinitionId: rgLocationsBuiltInId
    enforcementMode: 'Default'
    parameters: {
      listOfAllowedLocations: {
        value: [
          allowedLocation
        ]
      }
    }
  }
}
