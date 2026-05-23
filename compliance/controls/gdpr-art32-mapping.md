# GDPR Article 32 — Technical & organisational measures

Sovera is a **processor** for customers' personal data. This document lists the
Article 32 measures we implement; combine with the [DPA template](../contracts/dpa-template.md)
for the contractual binding.

## (a) Pseudonymisation and encryption of personal data

- **At rest**: customer-managed encryption keys (RSA-HSM 3072, auto-rotated every 18 months) backing Postgres and Blob ([landing-zone.bicep](../../infra/modules/landing-zone.bicep)).
- **In transit**: TLS 1.2 minimum across the entire stack (storage `minimumTlsVersion=TLS1_2`, APIM HTTPS-only, Postgres `sslmode=require`).
- **Pseudonymisation**: the `dl.user_sub()` claim stores the Entra `sub`/`oid` (an opaque GUID), not the user email; emails are stored only when business-required and stamped via the audit trail.

## (b) Ensure ongoing confidentiality, integrity, availability, resilience

- **Confidentiality**: per-tenant Postgres database with RLS *forced*; double-check `claims.tid = dl.this_tenant()`; per-tenant blob container; per-tenant Web PubSub hub; per-tenant APIM product.
- **Integrity**: Blob immutability + versioning; audit trigger appending canonical-JSON diffs; pgaudit on `WRITE,DDL,ROLE`.
- **Availability**: Postgres Flexible Server `ZoneRedundant`; ACA env zone-redundant; Blob ZRS; Event Hubs zone-redundant; APIM Premium multi-zone within region.
- **Resilience**: PITR 35 days on Postgres; Blob versioning + 30-day soft delete; geo-redundant backup *off* by design (HDS data-residency); cross-region DR is opt-in per tenant.

## (c) Restore availability and access in a timely manner

- **RPO target**: ≤ 5 minutes (zone-redundant HA + WAL streaming).
- **RTO target**: ≤ 1 hour (automatic zonal failover).
- **Restore tests**: quarterly, results archived in `evidence/`.

## (d) Regular testing, assessing & evaluating effectiveness

- **Continuous**: Microsoft Defender for Cloud + Sentinel analytics rules.
- **Per release**: Bicep linter + `bicep build` in CI; azqr compliance scan attached to release notes.
- **Per quarter**: access review, restore test, vulnerability scan.
- **Per year**: external penetration test, ISO 27001 internal audit.

## Personal data breach notification

- Detection → triage in ≤ 1 hour (Sentinel high-severity incident).
- Notification to controller (customer) within 24 hours of confirmed breach.
- CNIL notification path: ≤ 72 hours; customer files unless delegated.
- See full runbook in [incident/incident-response-plan.md](../incident/incident-response-plan.md).
