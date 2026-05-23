// Real API keys: list / create / revoke. Backed by app.api_keys (hashed).
import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { query } from './db.js';
import { ensureSchema, audit } from './bootstrap.js';
import { guard, generateKey, actorOf, SCOPE_IDS } from './auth.js';

type CreateBody = { name?: string; tenant?: string | null; scopes?: string[] };

async function listKeys(req: HttpRequest): Promise<HttpResponseInit> {
  const g = await guard(req, 'keys:read'); if (!g.ok) return g.response;
  await ensureSchema();
  const r = await query<{
    id: string; name: string; prefix: string; tenant: string | null; scopes: string[];
    created_at: Date; last_used_at: Date | null; revoked_at: Date | null; created_by: string | null;
  }>(`select id, name, prefix, tenant, scopes, created_at, last_used_at, revoked_at, created_by
      from app.api_keys
      order by revoked_at nulls first, created_at desc
      limit 200`);
  return { status: 200, jsonBody: { keys: r.rows } };
}

async function createKey(req: HttpRequest): Promise<HttpResponseInit> {
  const g = await guard(req, 'keys:write'); if (!g.ok) return g.response;
  const principal = g.principal;
  await ensureSchema();

  let body: CreateBody;
  try { body = (await req.json()) as CreateBody; }
  catch { return { status: 400, jsonBody: { error: 'invalid_json' } }; }

  const name = (body.name ?? '').trim();
  if (!name || name.length > 80) return { status: 400, jsonBody: { error: 'invalid_name' } };

  const tenant = body.tenant?.trim() || null;
  // Validate against the real scope catalog; '*' is allowed for full-access keys.
  const VALID = new Set<string>([...SCOPE_IDS, '*']);
  const requested = Array.isArray(body.scopes) ? body.scopes.map(String) : [];
  const invalid = requested.filter(s => !VALID.has(s));
  if (invalid.length) return { status: 400, jsonBody: { error: 'invalid_scopes', invalid, validScopes: [...VALID] } };
  if (!requested.length) return { status: 400, jsonBody: { error: 'scopes_required', detail: 'Pick at least one scope.', validScopes: [...VALID] } };
  // Only signed-in users (Studio) may mint a wildcard key.
  if (requested.includes('*') && principal.kind !== 'user') return { status: 403, jsonBody: { error: 'wildcard_requires_user' } };
  const scopes = requested.slice(0, 16);

  const { plain, prefix, hash } = generateKey();
  const createdBy = actorOf(principal);

  const r = await query<{ id: string; created_at: Date }>(
    `insert into app.api_keys (name, prefix, key_hash, tenant, scopes, created_by)
     values ($1,$2,$3,$4,$5,$6)
     returning id, created_at`,
    [name, prefix, hash, tenant, scopes, createdBy],
  );

  await audit(createdBy, 'api_key.create', r.rows[0].id, true, { name, prefix, tenant, scopes });

  return {
    status: 201,
    jsonBody: {
      id: r.rows[0].id,
      name, prefix, tenant, scopes,
      created_at: r.rows[0].created_at,
      secret: plain, // shown ONCE — client must store it
      warning: 'This is the only time the full key is shown. Store it now.',
    },
  };
}

async function revokeKey(req: HttpRequest): Promise<HttpResponseInit> {
  const g = await guard(req, 'keys:write'); if (!g.ok) return g.response;
  const principal = g.principal;
  await ensureSchema();
  const id = req.params.id;
  if (!/^[0-9a-f-]{36}$/.test(id ?? '')) return { status: 400, jsonBody: { error: 'invalid_id' } };

  const r = await query(`update app.api_keys set revoked_at = now() where id = $1 and revoked_at is null`, [id]);
  if (r.rowCount === 0) return { status: 404, jsonBody: { error: 'not_found_or_already_revoked' } };

  const actor = actorOf(principal);
  await audit(actor, 'api_key.revoke', id, true);
  return { status: 200, jsonBody: { ok: true, id, revoked_at: new Date().toISOString() } };
}

app.http('keys-list',   { route: 'keys',        methods: ['GET'],    authLevel: 'function', handler: listKeys });
app.http('keys-create', { route: 'keys',        methods: ['POST'],   authLevel: 'function', handler: createKey });
app.http('keys-revoke', { route: 'keys/{id}',   methods: ['DELETE'], authLevel: 'function', handler: revokeKey });
