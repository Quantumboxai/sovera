# ISO/IEC 27001:2022 — Statement of Applicability (SoA)

Scope: Sovera platform (shared landing zone + API plane + tenant module + SDK).
ISMS owner: CTO (acting as CISO until role filled). Reviewed quarterly.

Legend:
- **A** = Applicable (control implemented)
- **N/A** = Not applicable (justification given)
- **P** = Planned (target date noted)

| Annex A control | Status | Implementation reference |
|---|---|---|
| 5.1 Information security policies | A | [policies/](../policies/) |
| 5.7 Threat intelligence | A | Defender for Cloud + Microsoft Sentinel feeds. |
| 5.8 Information security in project management | A | This pack reviewed at every release; controls expressed as Bicep. |
| 5.10 Acceptable use | A | Workforce policy, [policies/access-control.md](../policies/access-control.md). |
| 5.12 Classification of information | A | [policies/data-classification.md](../policies/data-classification.md). |
| 5.13 Labelling of information | A | Tags on every Azure resource (`workload`, `env`, `dataResidency`, `compliance`). |
| 5.14 Information transfer | A | TLS 1.2+; private endpoints; cross-tenant blob replication disabled. |
| 5.15 Access control | A | Entra ID + Azure RBAC + Postgres RLS. |
| 5.16 Identity management | A | Per-tenant Entra group; per-service managed identity. |
| 5.17 Authentication information | A | KV Premium HSM stores connection strings; secrets rotated annually. |
| 5.18 Access rights | A | Quarterly access review against Entra group membership exports. |
| 5.19–5.23 Supplier relationships | A | Microsoft Azure BAA + DPA; sub-processor list in DPA template. |
| 5.24 Information security incident management | A | [incident/incident-response-plan.md](../incident/incident-response-plan.md) + Sentinel. |
| 5.25 Assessment of events | A | Sentinel analytics rules (Phase 6 module). |
| 5.26 Response to incidents | A | Runbook + on-call rotation (TBD as headcount grows). |
| 5.27 Learning from incidents | A | Post-mortem template referenced in incident runbook. |
| 5.28 Collection of evidence | A | `evidence/` bundle generated per release/audit. |
| 5.29 Information security during disruption | A | ZRS storage + zone-redundant HA + PITR + DR runbook. |
| 5.30 ICT readiness for business continuity | A | Restore test quarterly. |
| 5.31 Legal, statutory, regulatory & contractual requirements | A | DPA + BAA + HDS attestation chain. |
| 5.32 Intellectual property | A | License compliance via dependency review on CI. |
| 5.33 Protection of records | A | Immutable `audit` container; pgaudit logs to LAW retained 730 days + archive. |
| 5.34 Privacy & protection of PII | A | RoPA, DPIA per processing, Art. 32 measures. |
| 5.35 Independent review of information security | P | External audit Q3 next year. |
| 6.1–6.8 People controls | A | HR onboarding, NDA, MFA required. |
| 7.1–7.14 Physical controls | N/A | Inherited from Microsoft Azure (HITRUST, SOC 2, ISO 27001 certified DCs). |
| 8.1 User end-point devices | A | Workstation MDM (customer responsibility for end-users; staff devices managed). |
| 8.2 Privileged access rights | A | PIM JIT activation for KV Administrator + Owner roles. |
| 8.3 Information access restriction | A | RLS + per-tenant DB + per-tenant APIM product. |
| 8.4 Access to source code | A | GitHub repo, branch protection, signed commits, required reviews. |
| 8.5 Secure authentication | A | OIDC via Entra External ID; PKCE for SPAs. |
| 8.6 Capacity management | A | Postgres auto-grow; APIM scale-out; ACA Consumption + D4 profiles. |
| 8.7 Protection against malware | A | Defender for Cloud + container image scanning in CI. |
| 8.8 Management of technical vulnerabilities | A | Renovate / Dependabot; quarterly pen-test. |
| 8.9 Configuration management | A | Bicep + bicepconfig; `bicep build` in CI gates merges. |
| 8.10 Information deletion | A | Customer-initiated tenant offboarding script (Phase 6.1) purges DB + container + secrets. |
| 8.11 Data masking | A | DAB field-level authorization rules; pgaudit excludes secret columns. |
| 8.12 Data leakage prevention | A | Storage shared-key disabled; outbound NSGs deny Internet by default. |
| 8.13 Information backup | A | Postgres 35-day PITR + Blob versioning. |
| 8.14 Redundancy of information processing facilities | A | Zone-redundant on every stateful resource. |
| 8.15 Logging | A | Diagnostic settings on every resource → LAW + immutable archive. |
| 8.16 Monitoring activities | A | Sentinel + Defender + custom workbook (Phase 6 module). |
| 8.17 Clock synchronisation | A | Azure-managed (UTC, NTP). |
| 8.18 Use of privileged utility programs | A | Restricted; psql admin sessions require Entra token. |
| 8.19 Installation of software on operational systems | A | Immutable container images only; no shell access in production ACA apps. |
| 8.20–8.22 Network security | A | Internal APIM, private endpoints, NSGs, no public IPs on workloads. |
| 8.23 Web filtering | N/A | No outbound user browsing from workloads. |
| 8.24 Use of cryptography | A | CMK + TLS 1.2 + PKCE + JWT RS256. |
| 8.25 Secure development lifecycle | A | This pack; threat model per major release. |
| 8.26 Application security requirements | A | OWASP ASVS L2 target; APIM WAF (Phase 6+). |
| 8.27 Secure system architecture & engineering | A | Zero-trust: every call carries JWT, every row carries `tenant_id`, RLS forced. |
| 8.28 Secure coding | A | Linting + secret scanning + dependency review in CI. |
| 8.29 Security testing | A | Unit + integration; quarterly pen-test. |
| 8.30 Outsourced development | N/A | Currently in-house only. |
| 8.31 Separation of development, test, production | A | Separate Azure subscriptions per env (`prod`, `staging`, `dev`); same Bicep. |
| 8.32 Change management | A | [policies/change-management.md](../policies/change-management.md). |
| 8.33 Test information | A | Synthetic test data only; no production PHI in non-prod. |
| 8.34 Protection of information systems during audit testing | A | Audits run against read-replica or staging. |
