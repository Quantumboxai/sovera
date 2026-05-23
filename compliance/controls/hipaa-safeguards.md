# HIPAA Security Rule — Sovera safeguards mapping

Reference: 45 CFR §§ 164.302–318 (Security Rule) and §164.404–414 (Breach
Notification). Sovera positions itself as a **Business Associate** to Covered
Entities and signs a BAA (see [contracts/baa-template.md](../contracts/baa-template.md)).
Underlying cloud is Microsoft Azure (Microsoft signs a separate BAA with us).

## Administrative safeguards (§164.308)

| Standard | Sovera implementation |
|---|---|
| (a)(1)(i) Security management process | This compliance pack, change-management policy, quarterly risk review. |
| (a)(2) Assigned security responsibility | CISO role (TBD); CTO interim. |
| (a)(3) Workforce security | All staff sign confidentiality + acceptable use; access provisioned via Entra groups only. |
| (a)(4) Information access management | Per-tenant Entra group → DB Entra admin, per-tenant KV secrets, APIM subscription scoped to product. |
| (a)(5) Security awareness | Annual training; documented in [policies/access-control.md](../policies/access-control.md). |
| (a)(6) Security incident procedures | [incident/incident-response-plan.md](../incident/incident-response-plan.md). |
| (a)(7) Contingency plan | Postgres PITR 35 days + ZRS storage + zone-redundant HA; restore test cadence quarterly. |
| (a)(8) Evaluation | Annual penetration test + azqr report each release. |
| (b)(1) BAA | [contracts/baa-template.md](../contracts/baa-template.md). |

## Physical safeguards (§164.310)

Inherited from Microsoft Azure (HITRUST, SOC 2, ISO 27001 certified data centers
in France Central). Microsoft BAA covers physical safeguards.

## Technical safeguards (§164.312)

| Standard | Sovera implementation |
|---|---|
| (a)(1) Access control — unique user identification | Entra External ID `oid` claim → Postgres `dl.user_sub()` → audit trail. |
| (a)(2)(i) Emergency access | Break-glass Entra account with PIM JIT activation, MFA enforced. |
| (a)(2)(iii) Automatic logoff | APIM JWT lifetime ≤ 60 min; SDK refreshes via MSAL silent flow. |
| (a)(2)(iv) Encryption / decryption | CMK at-rest (KV Premium HSM), TLS 1.2+ in transit. |
| (b) Audit controls | pgaudit `WRITE,DDL,ROLE` + per-row `audit.events` + APIM App Insights + Sentinel rules. |
| (c)(1) Integrity | Immutable blob versioning + Postgres WAL + audit trigger appends only. |
| (c)(2) Mechanism to authenticate ePHI | SHA-256 content hashes on every blob (versioning); audit row diff stored as canonical JSON. |
| (d) Person or entity authentication | Entra External ID (CIAM) with MFA, conditional access on customer tenant. |
| (e)(1) Transmission security | HTTPS-only APIM, TLS 1.2 minimum everywhere, private endpoints for all PaaS. |

## Organizational requirements (§164.314)

BAA template ([contracts/baa-template.md](../contracts/baa-template.md))
covers permitted uses, safeguards, sub-contractor disclosure (Microsoft Azure),
breach reporting (≤ 60 days), and termination.

## Breach notification (§§164.404–414)

See [incident/incident-response-plan.md](../incident/incident-response-plan.md).
HHS notification within 60 days of discovery; affected individuals notified
without unreasonable delay (≤ 60 days).
