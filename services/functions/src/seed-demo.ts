// One-shot demo seeder. Inserts a handful of fake patient rows so the SQL editor
// has something to query. Idempotent: skips when rows already exist for the tenant.
// Remove this file once the real seeder/migrations land.
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { query } from './db.js';

const ACME_TENANT = '11111111-1111-1111-1111-111111111111';

const NAMES = [
  'Marie Dupont', 'Jean Martin', 'Sophie Bernard', 'Pierre Thomas', 'Camille Petit',
  'Lucas Robert', 'Emma Richard', 'Hugo Durand', 'Léa Moreau', 'Louis Laurent',
  'Chloé Simon', 'Gabriel Michel', 'Manon Garcia', 'Nathan David', 'Inès Bertrand',
];

export async function seedDemo(_req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    // Ensure table exists (in case this runs before the table-create POST was used).
    await query(`CREATE SCHEMA IF NOT EXISTS app;`);
    await query(`
      CREATE TABLE IF NOT EXISTS app.patients (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        full_name text NOT NULL,
        dob date,
        created_at timestamptz NOT NULL DEFAULT now()
      );`);
    const existing = await query<{ c: string }>('SELECT count(*)::text AS c FROM app.patients WHERE tenant_id = $1', [ACME_TENANT]);
    if (Number(existing.rows[0].c) >= NAMES.length) {
      return { status: 200, jsonBody: { ok: true, skipped: true, rows: Number(existing.rows[0].c) } };
    }
    let inserted = 0;
    for (let i = 0; i < NAMES.length; i++) {
      const ageYears = 25 + (i * 3) % 55;
      const dob = new Date(Date.now() - ageYears * 365.25 * 86400_000).toISOString().slice(0, 10);
      const createdDaysAgo = i % 9; // spread across last ~9 days so the 7-day filter returns some
      const createdAt = new Date(Date.now() - createdDaysAgo * 86400_000 - i * 3_600_000).toISOString();
      await query(
        'INSERT INTO app.patients (id, tenant_id, full_name, dob, created_at) VALUES (gen_random_uuid(), $1, $2, $3, $4)',
        [ACME_TENANT, NAMES[i], dob, createdAt],
      );
      inserted++;
    }
    return { status: 201, jsonBody: { ok: true, inserted, tenant: ACME_TENANT } };
  } catch (e: unknown) {
    ctx.error('seedDemo failed', e);
    return { status: 500, jsonBody: { error: 'seed_failed', detail: (e as Error)?.message } };
  }
}

app.http('seed-demo', {
  route: 'seed-demo',
  methods: ['POST'],
  authLevel: 'function',
  handler: seedDemo,
});
