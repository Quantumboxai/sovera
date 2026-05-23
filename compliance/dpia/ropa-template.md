# Record of Processing Activities (RoPA) — Art. 30 GDPR

> Maintain two RoPAs: one as **controller** (Sovera operations) and one as
> **processor** per customer tenant. This is the processor RoPA template.

## Identification

| Field | Value |
|---|---|
| Processor | Sovera SAS |
| Processor representative | (if applicable) |
| DPO | (TBD) |
| Customer / Controller | |
| Controller representative | |
| Controller DPO | |
| Date of entry | |
| Last update | |

## Processing categories carried out on behalf of the controller

| # | Processing | Categories of data | Categories of subjects | Recipients | Sub-processors | Cross-border transfer | Retention | Security measures |
|---|---|---|---|---|---|---|---|---|
| 1 | Storage & retrieval of customer application data | Identification, health, contact | Customer's end users | Customer staff via Entra group | Microsoft Azure (France Central) | None (data residency FR) | Per controller's instructions; default 7 years | CMK encryption, RLS, TLS 1.2+, pgaudit |
| 2 | Telemetry & observability (no PII payload) | App logs, metrics | Customer's end users (pseudonymous `sub` only) | Sovera SRE on-call (read-only) | Microsoft Azure (Log Analytics) | None | 730 days hot, archive 7 years | LAW with workspace-key encryption; access via PIM |
| 3 | Backup & disaster recovery | Snapshot of (1) | as (1) | None | Microsoft Azure | None | 35-day PITR; immutable archive | CMK, ZRS, restore drill quarterly |
| 4 | Incident response | as (1) + Sentinel telemetry | as (1) | Sovera SOC, customer's DPO | Microsoft Sentinel | None | Per incident lifecycle | Sentinel workspace, MFA on access |

## Sub-processor register

| Sub-processor | Purpose | Location | Safeguards |
|---|---|---|---|
| Microsoft Azure (Microsoft France) | Cloud hosting | France | HDS certification, SOC 2, ISO 27001, EU SCC where needed |
| Microsoft Entra External ID | Identity provider | EU region | Microsoft DPA + EU SCC |

Add or remove sub-processors with 30 days' written notice to the controller
(see [DPA template](../contracts/dpa-template.md), section 7).
