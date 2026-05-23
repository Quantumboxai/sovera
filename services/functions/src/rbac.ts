// Real RBAC: list role assignments from app.role_assignments + resolve current principal's roles.
import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { query } from './db.js';
import { ensureSchema, audit } from './bootstrap.js';
import { guard, authenticate, actorOf } from './auth.js';

const VALID_ROLES = ['Owner','Admin','Developer','Data Analyst','Auditor','Tenant Admin'];

async function listAssignments(req: HttpRequest): Promise<HttpResponseInit> {
  const g = await guard(req, 'rbac:read'); if (!g.ok) return g.response;
  await ensureSchema();
  // Seed owner on first call if table is empty
  const c = await query<{ n: string }>(`select count(*)::text as n from app.role_assignments`);
  if (c.rows[0].n === '0') {
    await query(
      `insert into app.role_assignments (principal, principal_name, role, scope)
       values ($1,$2,$3,$4) on conflict do nothing`,
      ['MoiseAlexandreGBAGUIDI@QUANTUMBOX353.onmicrosoft.com', 'Moïse Alexandre GBAGUIDI', 'Owner', 'project:sovera'],
    );
  }
  const r = await query<{
    id: string; principal: string; principal_name: string | null; role: string; scope: string; created_at: Date;
  }>(`select id, principal, principal_name, role, scope, created_at
      from app.role_assignments order by created_at desc limit 500`);
  return { status: 200, jsonBody: { assignments: r.rows, validRoles: VALID_ROLES } };
}

async function createAssignment(req: HttpRequest): Promise<HttpResponseInit> {
  const g = await guard(req, 'rbac:write'); if (!g.ok) return g.response;
  const principal = g.principal;
  await ensureSchema();

  let body: { principal?: string; principalName?: string; role?: string; scope?: string };
  try { body = (await req.json()) as never; } catch { return { status: 400, jsonBody: { error: 'invalid_json' } }; }

  const p = (body.principal ?? '').trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(p)) return { status: 400, jsonBody: { error: 'invalid_principal_email' } };
  const role = (body.role ?? '').trim();
  if (!VALID_ROLES.includes(role)) return { status: 400, jsonBody: { error: 'invalid_role', valid: VALID_ROLES } };
  const scope = (body.scope ?? 'project:sovera').trim().slice(0, 100);
  const name = (body.principalName ?? '').trim().slice(0, 200) || null;

  const r = await query<{ id: string; created_at: Date }>(
    `insert into app.role_assignments (principal, principal_name, role, scope)
     values ($1,$2,$3,$4)
     on conflict (principal, role, scope) do update set principal_name = excluded.principal_name
     returning id, created_at`,
    [p, name, role, scope],
  );

  const actor = actorOf(principal);
  await audit(actor, 'rbac.assign', `${p}|${role}|${scope}`, true);

  return { status: 201, jsonBody: { ok: true, id: r.rows[0].id, principal: p, role, scope, created_at: r.rows[0].created_at } };
}

async function deleteAssignment(req: HttpRequest): Promise<HttpResponseInit> {
  const g = await guard(req, 'rbac:write'); if (!g.ok) return g.response;
  const principal = g.principal;
  await ensureSchema();
  const id = req.params.id;
  if (!/^[0-9a-f-]{36}$/.test(id ?? '')) return { status: 400, jsonBody: { error: 'invalid_id' } };
  const r = await query(`delete from app.role_assignments where id = $1`, [id]);
  if (r.rowCount === 0) return { status: 404, jsonBody: { error: 'not_found' } };
  const actor = actorOf(principal);
  await audit(actor, 'rbac.unassign', id, true);
  return { status: 200, jsonBody: { ok: true, id } };
}

async function me(req: HttpRequest): Promise<HttpResponseInit> {
  await ensureSchema();
  const principal = await authenticate(req);
  if (!principal) return { status: 200, jsonBody: { authenticated: false } };
  if (principal.kind === 'key') {
    return { status: 200, jsonBody: { authenticated: true, kind: 'key', name: principal.name, tenant: principal.tenant, scopes: principal.scopes } };
  }
  const lookup = (principal.email ?? '').toLowerCase();
  const r = await query<{ role: string; scope: string }>(
    `select role, scope from app.role_assignments where lower(principal) = $1`,
    [lookup],
  );
  return {
    status: 200,
    jsonBody: {
      authenticated: true, kind: 'user',
      sub: principal.sub, name: principal.name, email: principal.email,
      roles: r.rows,
    },
  };
}

app.http('rbac-list',   { route: 'rbac',          methods: ['GET'],    authLevel: 'function', handler: listAssignments });
app.http('rbac-create', { route: 'rbac',          methods: ['POST'],   authLevel: 'function', handler: createAssignment });
app.http('rbac-delete', { route: 'rbac/{id}',     methods: ['DELETE'], authLevel: 'function', handler: deleteAssignment });
app.http('rbac-me',     { route: 'rbac/me',       methods: ['GET'],    authLevel: 'function', handler: me });
