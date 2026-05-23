# Evidence bundle

For every release **and** every audit cycle, generate a versioned evidence
bundle that lets a third-party auditor reconstruct the operational posture of
the platform without having to log into Azure.

## Contents (target)

```
evidence/<YYYY-MM-DD>/
├── manifest.json                  ← SHA-256 of every file + git SHA + release tag
├── region-policy.json             ← Region-lock policy assignment
├── cmk-keys.json                  ← KV key list, rotation policies, last-rotated dates
├── tls-config.json                ← TLS minimum / ciphers across storage/APIM/Postgres
├── rbac-export.json               ← All role assignments scoped to the sovera RG
├── role-assignments.json          ← Per-managed-identity scope/role/principal
├── tenant-registry.json           ← All tenants + tier + creation date (no PII)
├── ha-config.json                 ← HA settings per stateful resource
├── backup-config.json             ← PITR + Blob versioning + soft-delete config
├── diagnostic-settings.json       ← Diag settings on every resource → LAW
├── pgaudit-config.json            ← server params: pgaudit.log, log_*, wal_level
├── log-retention.json             ← Workspace retention + archive policy
├── network-topology.json          ← VNet + subnets + NSG rules + private endpoints
├── defender-status.json           ← Defender plans enabled per subscription
├── sentinel-rules.json            ← Analytics rules + automation rules + watchlists
├── azqr-report.html               ← Latest Azure Quick Review output
└── change-log.md                  ← All Bicep changes since previous bundle
```

## Generation

`scripts/compliance-evidence.ps1` (Phase 6.1) will produce the bundle and
upload it to the immutable `audit` blob container with a legal hold.

For now, run the queries manually:

```powershell
# Region policy
az policy assignment list --scope (az group show -n sovera --query id -o tsv) > region-policy.json

# CMK keys
az keyvault key list --vault-name <kv> > cmk-keys.json
az keyvault key rotation-policy show --vault-name <kv> --name cmk-postgres > cmk-postgres-rotation.json

# RBAC
az role assignment list -g sovera --include-inherited > rbac-export.json

# Diagnostic settings (per resource)
az resource list -g sovera --query "[].id" -o tsv | %{ az monitor diagnostic-settings list --resource $_ } > diagnostic-settings.json

# pg config
az postgres flexible-server parameter list -g sovera --server-name <pg> > pg-params.json

# azqr
azqr scan azure -s <subId>
```

## Retention

- Active bundle (last 12 months): immutable `audit` container.
- Archived bundle (> 12 months): same container with `Archive` access tier.
- Hash chain: `manifest.json` of bundle N includes the SHA-256 of bundle N−1,
  detecting any tampering.
