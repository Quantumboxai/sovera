# Data Classification Policy

## Classes

| Class | Examples | Handling |
|---|---|---|
| **C0 — Public** | Marketing pages, open-source code. | No restrictions. |
| **C1 — Internal** | Architecture diagrams, RoPAs, SoA. | Shared inside Sovera + with audited vendors. |
| **C2 — Confidential** | Customer business data, application logs (no PII payload). | Encrypted at rest + in transit; access via Entra groups. |
| **C3 — Restricted / Special category** | PHI, Art. 9 GDPR health data, authentication secrets. | C2 controls + per-tenant logical isolation, RLS forced, pgaudit, immutable audit, KV Premium HSM. |

## Mapping to Sovera resources

| Resource | Default class | Notes |
|---|---|---|
| Postgres tenant DB (`tnt_*`) | C3 | RLS forced, audit trigger. |
| Blob container `tnt-<slug>` | C3 | Immutable versioning, CMK. |
| Blob container `audit` | C3 | Immutable, append-only. |
| Log Analytics workspace | C2 | Pseudonymous `sub` only; no payload bodies. |
| App Insights | C2 | Same as LAW. |
| KV secrets | C3 | HSM-protected; managed identity access only. |

## Rules

- **No production C3 data in non-prod**: synthetic test data only.
- **No screenshots of C3 data** outside the secure environment.
- **No download of C3 data to personal devices** under any circumstance.
- **Tenant offboarding** purges C3 (DB drop, container deletion with versioning purge, KV soft-delete + purge).
