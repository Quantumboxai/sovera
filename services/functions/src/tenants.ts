import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { query } from './db.js';
import { guard } from './auth.js';

type Tenant = {
  slug: string;
  name: string;
  tier: 'starter' | 'pro' | 'enterprise';
  region: string;
  status: 'active' | 'paused' | 'provisioning';
  createdAt: string;
  rps: number;
  storageGb: number;
};

// Sovera tenants are stored either:
//   (a) in a `sovera.tenants` table when the platform schema is seeded, or
//   (b) one DB per tenant (early adopter pattern).
// We try (a) first, then fall back to (b).
const TENANTS_TABLE_SQL = `
  SELECT slug, name, tier, region, status,
         created_at::text AS created_at,
         COALESCE(rps, 0)::int AS rps,
         COALESCE(storage_gb, 0)::int AS storage_gb
  FROM sovera.tenants
  ORDER BY created_at DESC NULLS LAST
  LIMIT 200;
`;

const DBS_SQL = `
  SELECT datname AS name, pg_database_size(datname)::bigint AS bytes
  FROM pg_database
  WHERE datistemplate = false
    AND datname NOT IN ('azure_maintenance','azure_sys','postgres')
  ORDER BY datname;
`;

export async function tenants(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const g = await guard(req, 'db:read'); if (!g.ok) return g.response;
  // Try the canonical sovera.tenants table.
  try {
    const r = await query<{ slug: string; name: string; tier: Tenant['tier']; region: string; status: Tenant['status']; created_at: string; rps: number; storage_gb: number }>(TENANTS_TABLE_SQL);
    return {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: r.rows.map(x => ({
        slug: x.slug, name: x.name, tier: x.tier, region: x.region, status: x.status,
        createdAt: x.created_at?.slice(0, 10) ?? '',
        rps: x.rps, storageGb: x.storage_gb,
      } satisfies Tenant)),
    };
  } catch (e) {
    ctx.info('sovera.tenants not present, falling back to pg_database', (e as Error)?.message);
  }

  // Fallback: derive a tenant per non-system database.
  try {
    const r = await query<{ name: string; bytes: string }>(DBS_SQL);
    const tenants: Tenant[] = r.rows.map(x => ({
      slug: x.name,
      name: x.name,
      tier: 'starter',
      region: 'FR',
      status: 'provisioning',
      createdAt: '',
      rps: 0,
      storageGb: Math.round(Number(x.bytes) / 1_000_000_000),
    }));
    return { status: 200, headers: { 'Cache-Control': 'no-store' }, jsonBody: tenants };
  } catch (e: unknown) {
    ctx.error('tenants fallback failed', e);
    return { status: 500, jsonBody: { error: 'tenants_query_failed', detail: (e as Error)?.message } };
  }
}

app.http('tenants', {
  route: 'tenants',
  methods: ['GET'],
  authLevel: 'function',
  handler: tenants,
});
