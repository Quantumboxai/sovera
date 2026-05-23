# Incident Response Plan

Audience: Sovera SRE on-call + executive leadership.
Severity scale aligned with [SLA](../contracts/sla.md) and HIPAA/GDPR breach
notification timelines.

## 1. Severity classification

| Sev | Definition | Response |
|---|---|---|
| **P0 — Outage** | Platform unavailable for ≥ 5 min, OR confirmed Personal Data Breach. | War-room within 15 min, executive notification, controller notification ≤ 24 h. |
| **P1 — Degradation** | One tenant impacted, OR Sentinel high-severity rule fired. | On-call ack ≤ 30 min, mitigation plan ≤ 2 h. |
| **P2 — Partial** | Non-critical feature degraded. | Next business day. |
| **P3 — Cosmetic** | Documentation, minor UI. | Backlog. |

## 2. Roles

| Role | Responsibility |
|---|---|
| Incident Commander (IC) | Owns the war room, communicates externally. |
| Subject Matter Expert (SME) | Diagnoses root cause. |
| Scribe | Maintains the incident timeline. |
| Comms lead | Drafts customer + regulator notifications. |
| Legal / DPO | Determines notification scope under GDPR/HIPAA. |

## 3. Workflow

```
detect → triage → mitigate → recover → notify → post-mortem
```

### 3.1 Detect
- Microsoft Sentinel high-severity incident (auto-paged via Logic App).
- Defender for Cloud security alert.
- Customer report via support channel.

### 3.2 Triage (≤ 15 min for P0)
- IC opens incident in tracker, severity assigned.
- War room (Teams channel + bridge) opened.
- Scope: which tenants? which data classes?

### 3.3 Mitigate
- Stop the bleeding: revoke compromised credentials, isolate affected resource (private endpoint disable, NSG block), rotate keys.
- Preserve evidence: snapshot Postgres + immutable-blob copy of relevant logs.

### 3.4 Recover
- Failover to standby zone if RTO breached.
- Restore from PITR if data integrity affected.
- Validate via smoke tests (login, sample query, sample write).

### 3.5 Notify
| Audience | Trigger | Deadline |
|---|---|---|
| Affected controller (customer) | Confirmed Personal Data Breach | 24 h |
| CNIL | Controller responsibility | 72 h |
| HHS (for U.S. PHI) | Controller notifies if subjects ≥ 500; we assist | 60 days |
| Data subjects | Controller responsibility | "Without unreasonable delay" |
| Internal exec | P0/P1 | Within 1 h of declaration |
| Status page | P0/P1 | Within 30 min of confirmation |

### 3.6 Post-mortem
- Blameless template; due within 5 business days for P0/P1.
- Action items tracked in backlog with deadlines.
- Pattern → analytics rule? Add to [sentinel.bicep](../../infra/modules/sentinel.bicep).

## 4. Evidence preservation

For any P0/P1, the IC ensures the following snapshots are exported to the
immutable `audit` container before any remediation is applied:

- Last 7 days of pgaudit logs (LAW export).
- KV key access events (LAW export).
- APIM request traces for the affected tenant.
- Sentinel incident JSON + entities + comments.

## 5. Quarterly drill

The on-call team runs a tabletop scenario each quarter. Results logged in
`evidence/incident-drills/<YYYY-Qn>.md`.
