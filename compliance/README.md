# Sovera compliance pack

This folder is the source of truth for everything an enterprise security /
compliance team will ask for during procurement. It is versioned with the code
so every release ships a matching evidence bundle.

```
compliance/
├── README.md                       ← you are here
├── controls/
│   ├── hds-control-mapping.md      ← HDS articles → Sovera controls → evidence
│   ├── hipaa-safeguards.md         ← HIPAA Security Rule (45 CFR §164.3xx) mapping
│   ├── iso27001-soa.md             ← ISO 27001:2022 Statement of Applicability
│   └── gdpr-art32-mapping.md       ← GDPR Art. 32 technical & organisational measures
├── dpia/
│   ├── dpia-template.md            ← CNIL-aligned DPIA you complete per use case
│   └── ropa-template.md            ← Record of Processing Activities (Art. 30)
├── contracts/
│   ├── baa-template.md             ← Business Associate Agreement (HIPAA)
│   ├── dpa-template.md             ← Data Processing Agreement (GDPR Art. 28)
│   └── sla.md                      ← Sovera SLA + RPO/RTO commitments
├── incident/
│   └── incident-response-plan.md   ← P0 runbook + breach notification timeline
├── policies/
│   ├── access-control.md
│   ├── data-classification.md
│   ├── backup-and-recovery.md
│   └── change-management.md
└── evidence/
    └── README.md                   ← how to generate an evidence bundle per audit
```

## Workflow

1. **At every release** — bump `controls/*.md` if a control implementation changed.
2. **Per customer** — fork `dpia/` + `contracts/` into the customer's silo folder.
3. **Per audit** — run `scripts/compliance-evidence.ps1` (Phase 6.1) to package
   diagnostic settings, RBAC exports, KV key rotation history, Sentinel
   incidents, and the latest azqr report into `evidence/<YYYY-MM-DD>.zip`.
4. **Continuously** — the Sentinel workbook + analytics rules deployed by
   `infra/modules/sentinel.bicep` monitor for the controls that have to be
   *demonstrably* enforced (admin sign-ins, KV key access, RLS bypass attempts,
   storage shared-key usage, etc.).

## Scope of certifications targeted

| Framework | Status | Owner | Next milestone |
|---|---|---|---|
| HDS (FR) | Pre-audit, COFRAC certification target | CTO | Stage 1 audit Q4 |
| HIPAA Security Rule | Self-attestation + BAA-ready | CTO | Independent attestation Q1 next year |
| ISO/IEC 27001:2022 | SoA drafted | CISO (TBD) | Stage 1 Q2 next year |
| SOC 2 Type I | Planned | CTO | After ISO 27001 Stage 1 |
| GDPR Art. 28/32 | Operational | DPO (TBD) | DPIA per processing |

> Disclaimer: these templates are starting points. Have them reviewed by qualified
> counsel and your auditor before signing or relying on them.
