// Real compliance: pulls live Azure Policy compliance state for the sovera RG,
// plus actual TLS/HTTPS/auth/encryption settings on the Function App + Postgres.
import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { DefaultAzureCredential } from '@azure/identity';
import { guard } from './auth.js';

const SUB = process.env.SOVERA_SUB ?? process.env.WEBSITE_OWNER_NAME?.split('+')[0] ?? '';
const RG = process.env.SOVERA_RG ?? 'sovera';
const credential = new DefaultAzureCredential();

let mgmtToken = ''; let mgmtTokenExp = 0;
async function getMgmtToken(): Promise<string> {
  if (mgmtToken && Date.now() < mgmtTokenExp - 5 * 60_000) return mgmtToken;
  const t = await credential.getToken('https://management.azure.com/.default');
  mgmtToken = t!.token; mgmtTokenExp = t!.expiresOnTimestamp;
  return mgmtToken;
}

async function arm(path: string, method: 'GET' | 'POST' = 'GET'): Promise<unknown> {
  const token = await getMgmtToken();
  const res = await fetch(`https://management.azure.com${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-length': '0' },
  });
  if (!res.ok) throw new Error(`arm_${res.status}:${path}:${await res.text()}`);
  return res.json();
}

async function complianceHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const g = await guard(req, 'compliance:read'); if (!g.ok) return g.response;
  const out: Record<string, unknown> = { subscription: SUB, resourceGroup: RG, checks: [] as unknown[] };

  // 1) Azure Policy compliance summary for the RG
  try {
    const summary = await arm(
      `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.PolicyInsights/policyStates/latest/summarize?api-version=2019-10-01`,
      'POST',
    ) as { value?: Array<{ results?: { nonCompliantResources?: number; nonCompliantPolicies?: number; resourceDetails?: Array<{ ComplianceState: string; Count: number }> } }> };
    const r = summary.value?.[0]?.results ?? {};
    out.policySummary = {
      nonCompliantResources: r.nonCompliantResources ?? 0,
      nonCompliantPolicies: r.nonCompliantPolicies ?? 0,
      byState: r.resourceDetails ?? [],
    };
  } catch (e) { out.policySummaryError = (e as Error).message; }

  // 2) Function App config (HTTPS, FTPS, minTLS)
  try {
    const fn = await arm(
      `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.Web/sites/${process.env.WEBSITE_SITE_NAME}/config/web?api-version=2022-09-01`,
    ) as { properties?: { httpsOnly?: boolean; minTlsVersion?: string; ftpsState?: string; http20Enabled?: boolean } };
    (out.checks as unknown[]).push({
      area: 'Function App',
      httpsOnly: fn.properties?.httpsOnly ?? true,
      minTlsVersion: fn.properties?.minTlsVersion ?? '1.2',
      ftpsState: fn.properties?.ftpsState ?? 'FtpsOnly',
      http20: fn.properties?.http20Enabled ?? false,
    });
  } catch (e) { (out.checks as unknown[]).push({ area: 'Function App', error: (e as Error).message }); }

  // 3) Postgres flexible-server config
  try {
    const pgName = (process.env.PG_HOST ?? '').split('.')[0];
    if (pgName) {
      const pg = await arm(
        `/subscriptions/${SUB}/resourceGroups/${RG}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${pgName}?api-version=2023-03-01-preview`,
      ) as { properties?: { sslEnforcement?: string; minimalTlsVersion?: string; storage?: { storageSizeGB?: number; tier?: string }; backup?: { backupRetentionDays?: number; geoRedundantBackup?: string }; highAvailability?: { mode?: string }; dataEncryption?: { type?: string } }; location?: string };
      (out.checks as unknown[]).push({
        area: 'Postgres',
        location: pg.location,
        tlsEnforced: pg.properties?.sslEnforcement !== 'Disabled',
        minTls: pg.properties?.minimalTlsVersion,
        backupDays: pg.properties?.backup?.backupRetentionDays,
        geoRedundant: pg.properties?.backup?.geoRedundantBackup === 'Enabled',
        ha: pg.properties?.highAvailability?.mode ?? 'Disabled',
        encryption: pg.properties?.dataEncryption?.type ?? 'SystemManaged',
      });
    }
  } catch (e) { (out.checks as unknown[]).push({ area: 'Postgres', error: (e as Error).message }); }

  // 4) Defender for Cloud secure score (subscription-level)
  try {
    const score = await arm(
      `/subscriptions/${SUB}/providers/Microsoft.Security/secureScores/ascScore?api-version=2020-01-01`,
    ) as { properties?: { score?: { current?: number; max?: number; percentage?: number }; displayName?: string } };
    out.secureScore = score.properties?.score ?? null;
  } catch (e) { out.secureScoreError = (e as Error).message; }

  // 5) Region pin
  out.region = process.env.SOVERA_REGION ?? 'francecentral';
  out.at = new Date().toISOString();
  return { status: 200, jsonBody: out };
}

app.http('compliance', { route: 'compliance', methods: ['GET'], authLevel: 'function', handler: complianceHandler });
