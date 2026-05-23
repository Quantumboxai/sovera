# Change Management Policy

## Goal

Every change to the Sovera platform is **traceable, peer-reviewed, automatically
validated, and reversible**.

## Source of truth

- All infrastructure changes go through Bicep files in [infra/](../../infra/).
- All application changes go through code in [services/](../../services/),
  [packages/](../../packages/), [apps/](../../apps/).
- Manual portal changes are **forbidden** in production. If unavoidable,
  reconcile back to Bicep within 24 h and document in `evidence/portal-drift-<YYYY-MM-DD>.md`.

## Workflow

```
branch → PR → CI gates → 2 reviewers → merge → CD (azd up to staging) → manual prod gate → azd up to prod
```

### CI gates (must pass)
- `az bicep build infra/main.bicep` exits 0.
- `npx tsc --noEmit` exits 0 in [packages/client](../../packages/client) and [services/functions](../../services/functions).
- Secret scanning (gitleaks).
- Dependency review (Dependabot / Renovate alerts triaged).

### Reviewers
- 2 approvers required on `main`.
- 1 must be from `sovera-admins` if the change touches:
  - Bicep files in [infra/modules/](../../infra/modules/)
  - Key Vault policies
  - APIM policies
  - This compliance pack

### Production deployment
- Gated by manual approval in the CD pipeline.
- `what-if` analysis attached as a comment on the deployment ticket.
- Deployment window: business hours only, except P0 hotfixes.

## Change classes

| Class | Examples | Approval |
|---|---|---|
| **Standard** | App code, non-breaking SDK changes. | 2 peer reviewers. |
| **Normal** | New entity in DAB, new Function. | 2 peer reviewers + CTO/CISO sign-off. |
| **Major** | New Bicep module, region change, CMK rotation outside policy. | 2 reviewers + CTO + CISO + DPO if customer data impacted. |
| **Emergency** | P0 hotfix. | CTO verbal approval, paper trail within 24 h. |

## Rollback

- Bicep deployments use `what-if` and named deployments to allow side-by-side comparison.
- Application containers tagged with git SHA; previous tag deployable in ≤ 5 min.
- Tenant DB schema changes are forward-only; rollback via app code or compensating migration.
