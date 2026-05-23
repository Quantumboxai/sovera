# Sovera — Azure-native, HDS/HIPAA-ready Supabase alternative

Self-hosted, France-resident BaaS built entirely on Azure managed services.
All resources are pinned to **France Central** in resource group **`sovera`**.

## Why this stack wins enterprise compliance deals

- Every layer (Postgres Flex, Blob, Key Vault HSM, APIM, Container Apps, Functions, Web PubSub, Event Hubs) is already certified by Microsoft for **HDS, HIPAA, ISO 27001, SOC 2, PCI-DSS, ENS, C5** in France Central.
- **Customer-Managed Keys (CMK)** per tenant via Key Vault Premium (HSM-backed).
- **Private Link everywhere** — only APIM Premium is reachable from the Internet.
- **Azure Policy** enforces `location == francecentral` at the subscription level (deny effect).
- **Microsoft Sentinel + Defender for Cloud** ship as part of the offering.
- **Entra External ID** for end-users; federation with hospital tenants via Entra ID Workforce.

## Architecture (high level)

```
Client ─▶ APIM Premium (WAF, JWT, OAuth2)
              ├─▶ Data API Builder  (Container Apps)  ─▶ PostgreSQL Flex HA + pgvector + CMK
              ├─▶ Edge Functions    (Azure Functions Flex)
              └─▶ Web PubSub         ◀─ Realtime bridge ◀─ Event Hubs ◀─ wal2json
                                                                                   │
                                                  Blob Storage (CMK + immutable) ◀─┘
Identity: Entra External ID  •  Secrets/Keys: Key Vault HSM
Observability: Log Analytics + App Insights + Sentinel
```

## Repository layout

```
infra/
  main.bicep                  # subscription-scope entry (RG + policy + workload)
  main.bicepparam             # parameter file
  modules/
    rg.bicep                  # resource group
    policy-region-lock.bicep  # deny non-FR-Central deployments
    landing-zone.bicep        # Log Analytics, App Insights, Key Vault HSM, network, DNS zones
    network.bicep             # VNet + subnets + NSGs + private DNS zones
    keyvault.bicep            # Premium HSM Key Vault with CMK keys
    postgres.bicep            # PG Flex HA + CMK + pgvector + private endpoint
    storage.bicep             # Blob with CMK, immutable, private endpoint
    eventhub.bicep            # Event Hubs namespace + hub for logical replication
    observability.bicep       # Log Analytics, App Insights, diagnostic settings module
policy/
  region-lock.json            # Azure Policy definition (deny non-fr-central)
azure.yaml                    # azd configuration (Phase 2+ adds services)
```

## Deploy (Phase 0 + 1)

```powershell
az login
az account set --subscription <SUB_ID>
az deployment sub create `
  --location francecentral `
  --template-file infra/main.bicep `
  --parameters infra/main.bicepparam
```

Or with **azd** once Phase 2 services are added:

```powershell
azd up
```

## Roadmap

- [x] Phase 0 — Landing zone (RG, policy, network, Key Vault HSM, observability)
- [x] Phase 1 — Data plane (Postgres Flex HA + CMK, Blob CMK, Event Hubs)
- [x] Phase 2 — API plane (ACA env, DAB, Functions Flex, Web PubSub, realtime bridge, APIM Premium)
- [x] Phase 3 — Identity (Entra External ID + APIM JWT policy + RLS wiring + SDK + sample)
- [x] Phase 4 — Studio (Next.js admin) + CLI (`sovera init / db push / functions deploy`)
- [x] Phase 5 — Tenant module (per-customer isolated stack: DB, container, hub, APIM product)
- [x] Phase 6 — Compliance pack (DPIA, RoPA, HDS evidence, Sentinel workbooks, BAA)

## Onboarding a tenant (Phase 5 — silo-per-customer)

Once the shared platform is deployed, each enterprise customer gets a fully
isolated silo (dedicated Postgres DB, blob container, Web PubSub hub, APIM
product + per-tier rate limit/quota, Key Vault secrets) with a single command:

```powershell
./scripts/tenant-onboard.ps1 `
  -Slug acme `
  -DisplayName 'Acme Health' `
  -Tier enterprise
```

That script:

1. Discovers shared platform resources in the `sovera` RG.
2. Deploys `infra/modules/tenant.bicep` (per-tenant Azure resources).
3. Runs `services/db/tenant-bootstrap.sql` against the new database (pins it to
   the tenant UUID via `dl.this_tenant()`, creates roles, RLS, audit, publication).
4. Stores `dab_app` password + full connection string in Key Vault as
   `tenant-<slug>-dab-connection`.

Tier quotas (APIM rate-limit + quota + storage cap) are defined in
`infra/modules/tenant.bicep` and bumped per tier (`starter` / `pro` / `enterprise`).

## Compliance (Phase 6)

The [compliance/](./compliance/) folder is the source of truth for everything an
enterprise security team will ask for: HDS / HIPAA / ISO 27001 / GDPR Art. 32
control mappings, DPIA + RoPA templates, BAA + DPA + SLA, incident response
runbook, and ready-to-paste policies.

Microsoft Sentinel analytics + an operations workbook are deployed by
[`infra/modules/sentinel.bicep`](./infra/modules/sentinel.bicep) (toggle
`deploySentinel=true` in `main.bicepparam`). Five rules ship by default:

- Key Vault CMK key access from an unexpected principal (High)
- Storage shared-key usage detected — should be impossible (High)
- Postgres RLS / tenant-assertion error spike (Medium)
- Admin sign-in from a new IP (Medium)
- APIM 401/403 spike on a single subscription (Medium)

Per-release / per-audit evidence bundle layout in
[`compliance/evidence/`](./compliance/evidence/README.md).

## Studio + CLI (Phase 4)

A dark, opinionated control plane. Run alongside the platform:

```powershell
cd apps/studio
npm install
npm run dev          # http://localhost:3001
```

To run it **on Azure** (Container Apps + private ACR, behind the same ACA env as DAB):

```powershell
# one-time
azd auth login
azd env new sovera-prod
azd env set DEPLOY_API_PLANE true
azd env set DEPLOY_STUDIO    true

# provision + build + push + deploy
azd up

# subsequent code-only deploys
azd deploy studio
```

`infra/modules/studio.bicep` provisions an Azure Container Registry (Basic),
grants `AcrPull` to the existing CMK managed identity, then creates a
`sovera-studio` Container App with external HTTPS ingress on port 3000.
The first deploy runs from a placeholder image (`studioImageTag=bootstrap`);
`azd deploy studio` builds [`apps/studio/Dockerfile`](./apps/studio/Dockerfile)
remotely in ACR and rolls a new revision. URL is emitted as the `studioUrl`
output.

The Studio ships with everything a Supabase/Xano user expects — Tables, SQL,
Storage, Realtime, Logs, Settings — plus three things they don't:

- **Tenant switcher with impersonation** (bottom-left of the sidebar). When you
  view a customer's data in production, a warning bar reminds you that every
  action is logged to `audit.events`.
- **Visual RLS Designer** (Govern → RLS). Click any table and watch the
  request flow from JWT claim → APIM → DAB → Postgres GUC → policy →
  row. Every clause is also translated to plain English so a security reviewer
  can read it without knowing SQL.
- **Compliance HUD**. Every page shows the HDS / HIPAA / ISO control it
  satisfies, sourced from the [compliance/](./compliance/) pack.

Plus a `⌘K` palette, live WAL inspector in the Logs tab, and an env switcher
(prod / staging / dev) that drives the impersonation warning.

The CLI ([`packages/cli`](./packages/cli/)) is the same operations surface
without the browser:

```powershell
npm install -g @sovera/cli   # or: cd packages/cli && npm link

sovera init                       # scaffold sovera.config.json
sovera login                      # az login
sovera db push                    # apply SQL migrations
sovera tenant create acme -t pro  # delegates to scripts/tenant-onboard.ps1
sovera functions deploy           # publish all function apps
sovera status                     # live `az resource list` against your RG
```
