# Sovera Service Level Agreement (SLA)

Effective for tenants on **Pro** and **Enterprise** tiers. Starter is best-effort.

## 1. Definitions

- **Monthly Uptime Percentage** = `(total_minutes − unavailable_minutes) / total_minutes`.
- **Unavailable** = the Sovera control APIs (REST/GraphQL via APIM) return 5xx
  for ≥ 5 consecutive minutes attributable to Sovera.
- **Scheduled maintenance** is announced ≥ 72 h in advance and excluded.

## 2. Service commitments

| Tier | Uptime | Support response P1 | RPO | RTO |
|---|---|---|---|---|
| Starter | best-effort | next business day | 24 h | 24 h |
| Pro | 99.9 % | ≤ 4 h | 1 h | 4 h |
| Enterprise | 99.95 % | ≤ 1 h | 5 min | 1 h |

## 3. Service credits

| Monthly Uptime | Credit |
|---|---|
| < 99.95 % | 10 % of monthly fee |
| < 99.0 %  | 25 % of monthly fee |
| < 95.0 %  | 50 % of monthly fee |

Credits are applied to the next invoice and capped at 100 % of the monthly fee.
Customer must request the credit within 30 days of the incident.

## 4. Exclusions

- Force majeure, Azure-attributable region outages with valid Microsoft incident.
- Customer-caused changes (e.g. removing a Bicep module, deleting a tenant DB).
- Network issues outside Sovera's control (customer ISP, Internet routing).

## 5. Reporting

Status page: `status.sovera.fr` (Phase 6+). Public incident timeline,
post-mortem within 5 business days for any P0/P1.
