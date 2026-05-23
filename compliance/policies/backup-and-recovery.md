# Backup & Recovery Policy

## Objectives

| Tier | RPO | RTO |
|---|---|---|
| Starter | 24 h | 24 h |
| Pro | 1 h | 4 h |
| Enterprise | 5 min | 1 h |

## Mechanisms

### Postgres Flexible Server
- **Point-in-time restore (PITR)**: 35 days (configured in [postgres.bicep](../../infra/modules/postgres.bicep)).
- **High availability**: `ZoneRedundant` synchronous standby in another AZ; automatic failover on zone failure.
- **Geo-redundant backup**: disabled by design (HDS data residency). Cross-region DR is opt-in via a customer-paid `geoReplica` flag on the tenant module.

### Blob Storage
- **ZRS replication** in `francecentral`.
- **Versioning** enabled, **30-day soft delete** on blobs and containers.
- **Change feed** enabled (30 days) for forensic replay.
- `audit` container: **immutable** with versioning; legal hold can be applied per investigation.

### Key Vault
- **Soft-delete** 90 days + **purge protection** enabled.
- Keys are `RSA-HSM`; rotation policy notifies at P30D before expiry, rotates at P18M.

### Configuration (Bicep)
- The `infra/` tree is the source of truth. Git history is the configuration backup.

## Restore drills

- **Quarterly**: restore a sample tenant DB from a 24 h-old PITR snapshot into a staging server; validate RLS + audit + sample query.
- **Annually**: full DR exercise — simulate AZ failure, walk through runbook end-to-end.
- Results filed in `compliance/evidence/restore-drill-<YYYY-Qn>.md`.

## Tenant export (right to portability + reversibility)

`scripts/tenant-export.ps1` (Phase 6.1) produces:

1. `pg_dump --no-owner` of the tenant DB.
2. `azcopy` mirror of `tnt-<slug>/` to a customer-supplied storage account.
3. Manifest of KV secrets referenced by the tenant (values *not* exported).
4. SHA-256 hash of the bundle; signed manifest archived in `audit`.

Bundle is delivered to the customer over a secure channel and retained for
30 days, then purged.
