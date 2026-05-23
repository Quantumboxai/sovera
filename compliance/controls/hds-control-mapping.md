# HDS — Sovera control mapping

Reference: *Référentiel de certification HDS v1.1.1* (ASIP Santé / ANS).
Scope of certification targeted: **Hébergeur d'infrastructure physique** (1–2) and
**Hébergeur infogérant** (3–6) via Microsoft Azure France Central (Microsoft is
certified HDS for activities 1–2 and 5; Sovera operates activities 3, 4, 6 on top).

| HDS § | Requirement (summary) | Sovera implementation | Evidence file |
|---|---|---|---|
| 5.1.1 | Data residency in France | Region locked to `francecentral` via `Microsoft.Authorization/policyAssignments` in [policy-region-lock.bicep](../../infra/modules/policy-region-lock.bicep). Geo-redundant backup disabled on Postgres. | `evidence/region-policy.json` |
| 5.1.2 | Encryption at rest with customer-managed keys | Key Vault Premium (HSM) with RSA-HSM 3072-bit CMKs, auto-rotation (P18M). Postgres + Blob both reference CMKs. See [landing-zone.bicep](../../infra/modules/landing-zone.bicep), [postgres.bicep](../../infra/modules/postgres.bicep), [storage.bicep](../../infra/modules/storage.bicep). | `evidence/cmk-keys.json` |
| 5.1.3 | Encryption in transit (TLS ≥ 1.2) | `minimumTlsVersion: TLS1_2` on storage; APIM enforces HTTPS only; Postgres `sslmode=require`; Web PubSub TLS-only. | `evidence/tls-config.json` |
| 5.2.1 | Strong authentication for admins | Entra ID with conditional access (customer subscription). Postgres Entra-group admin (`sovera-admins`). KV Administrator only granted to the admin group. | `evidence/rbac-export.json` |
| 5.2.2 | Least privilege | Per-service managed identities (`cmkIdentity` for CMK, separate SystemAssigned for APIM, WPS, Functions). 4 narrowly-scoped role assignments in [api-plane.bicep](../../infra/modules/api-plane.bicep). | `evidence/role-assignments.json` |
| 5.2.3 | Per-tenant logical isolation | Silo-per-customer pattern: dedicated DB + container + WPS hub + APIM product per tenant. Postgres RLS double-checks `claims.tid = dl.this_tenant()`. See [tenant.bicep](../../infra/modules/tenant.bicep) and [tenant-bootstrap.sql](../../services/db/tenant-bootstrap.sql). | `evidence/tenant-registry.json` |
| 5.3.1 | High availability | Postgres Flexible Server `ZoneRedundant`; ACA env zone-redundant; Blob Standard_ZRS; Event Hubs zone-redundant. | `evidence/ha-config.json` |
| 5.3.2 | Backup & restore | Postgres 35-day PITR; Blob versioning + 30-day soft delete + container delete retention; immutable `audit` container. | `evidence/backup-config.json` |
| 5.3.3 | RPO / RTO | RPO ≤ 5 min (zone-redundant HA + PITR). RTO ≤ 1 h (zone failover automatic). See [contracts/sla.md](../contracts/sla.md). | `contracts/sla.md` |
| 5.4.1 | Traceability — admin actions | Activity Log → Log Analytics via diagnostic settings on every resource. KV audit logs preserved 365 days. | `evidence/diagnostic-settings.json` |
| 5.4.2 | Traceability — data access | pgaudit `WRITE,DDL,ROLE`; APIM logger → App Insights; per-row `audit.events` table populated by trigger; immutable audit container for exported logs. | `evidence/pgaudit-config.json` |
| 5.4.3 | Log retention ≥ 36 months | Log Analytics retention configured to 730 days hot + archive to immutable blob (configurable). | `evidence/log-retention.json` |
| 5.5.1 | Network segmentation | VNet-only deployment, all PaaS via private endpoints; NSGs deny Internet inbound; APIM Premium internal mode; only Front Door (Phase 6+) is public-facing. See [network.bicep](../../infra/modules/network.bicep). | `evidence/network-topology.json` |
| 5.5.2 | Vulnerability management | Defender for Cloud enabled per subscription (customer responsibility, documented in [policies/change-management.md](../policies/change-management.md)). | `evidence/defender-status.json` |
| 5.6.1 | Security monitoring 24/7 | Microsoft Sentinel solution deployed by [sentinel.bicep](../../infra/modules/sentinel.bicep) with analytics rules for: KV key access, admin sign-ins, RLS exception spikes, storage shared-key usage attempts. | `evidence/sentinel-rules.json` |
| 5.6.2 | Incident response | [incident/incident-response-plan.md](../incident/incident-response-plan.md) — 24h CNIL breach notification, 60-day HHS notification path. | `incident/incident-response-plan.md` |
| 5.7.1 | Sub-processor disclosure | Microsoft Azure (host), Microsoft Entra External ID (identity). Listed in [contracts/dpa-template.md](../contracts/dpa-template.md). | `contracts/dpa-template.md` |
| 5.8.1 | Right to reversibility | Per-tenant export tooling produces a portable bundle (Postgres `pg_dump` + blob container sync + KV secret manifest). Documented in [policies/data-classification.md](../policies/data-classification.md). | `evidence/reversibility-runbook.md` |

## Out-of-scope (customer's responsibility)

- The end-customer organisation must have its own HDS contract chain with their
  healthcare data controller, plus appropriate Article 32 GDPR measures.
- Application code deployed *on top of* Sovera (custom Functions, custom DAB
  entities) inherits these controls but must be threat-modeled per use case.
