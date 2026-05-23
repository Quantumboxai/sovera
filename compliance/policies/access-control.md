# Access Control Policy

## Purpose

Define who may access Sovera resources and customer data, with what privilege,
and how that access is granted, reviewed, and revoked.

## Scope

All Sovera production resources in the `sovera` Azure subscription(s) and any
customer tenant deployed on top.

## Principles

- **Least privilege** — no standing access beyond `Reader`. Privileged roles
  (KV Administrator, Owner, Postgres admin) are granted **just-in-time** via
  Microsoft Entra Privileged Identity Management (PIM).
- **Group-based** — access is granted to Entra groups, never to individuals.
- **MFA mandatory** — all interactive logins require MFA. Service principals
  use Workload Identity Federation where possible (no client secrets).
- **Separation of duties** — same person cannot both approve and execute a
  production change.

## Roles and groups

| Group | Privilege | PIM activation max | Approvers |
|---|---|---|---|
| `sovera-admins` | Owner on RG, KV Administrator, Postgres Entra admin | 4 h | 2-of-N |
| `sovera-sre` | Contributor on RG (no KV) | 8 h | 1-of-N |
| `sovera-readonly` | Reader on RG, Log Analytics Reader | standing | n/a |
| `sovera-tenant-<slug>-admins` | Postgres Entra admin for that tenant DB | 4 h | Customer-side |

## Provisioning

1. Joiner: HR ticket → Entra group membership via SCIM (or manual until SCIM live).
2. Mover: change groups in Entra; access updates within minutes.
3. Leaver: HR ticket → Entra account disabled within 1 business hour; group memberships purged within 24 h.

## Reviews

- Quarterly access review on every privileged group.
- Annual review of all Reader-level groups.
- Reviews logged as evidence in `compliance/evidence/access-review-<YYYY-Qn>.md`.

## Break-glass

One break-glass account per environment. Password split in two halves stored in
separate physical safes. Use requires CTO + CISO joint approval; any use raises
a Sentinel P0.
