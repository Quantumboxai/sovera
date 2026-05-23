// Shared auth helper: validates either an Easy Auth user (x-ms-client-principal header)
// or a Sovera API key (Authorization: Bearer sov_live_... or x-api-key header).
// API keys are stored hashed (SHA-256) in app.api_keys.
import { HttpRequest } from '@azure/functions';
import crypto from 'crypto';
import { query } from './db.js';

export type Principal =
  | { kind: 'user'; sub: string; name?: string; email?: string }
  | { kind: 'key'; keyId: string; name: string; tenant: string | null; scopes: string[] };

export function hashKey(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

export function generateKey(): { plain: string; prefix: string; hash: string } {
  // sov_live_ + 32 url-safe random bytes (base64url)
  const bytes = crypto.randomBytes(32);
  const body = bytes.toString('base64url');
  const plain = `sov_live_${body}`;
  const prefix = plain.slice(0, 16); // sov_live_xxxxxxx — safe to display
  return { plain, prefix, hash: hashKey(plain) };
}

function readBearer(req: HttpRequest): string | null {
  const auth = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? m[1].trim() : null;
}

function readEasyAuth(req: HttpRequest): Principal | null {
  // Easy Auth injects x-ms-client-principal (base64 JSON) on requests behind the Container App auth.
  // Functions are not behind Easy Auth here, but Studio forwards the header when proxying.
  const h = req.headers.get('x-ms-client-principal');
  if (!h) return null;
  try {
    const decoded = JSON.parse(Buffer.from(h, 'base64').toString('utf-8'));
    const claims: Array<{ typ: string; val: string }> = decoded.claims ?? [];
    const get = (t: string) => claims.find(c => c.typ === t)?.val;
    return {
      kind: 'user',
      sub: get('http://schemas.microsoft.com/identity/claims/objectidentifier') ?? decoded.userId ?? 'unknown',
      name: get('name') ?? decoded.userDetails,
      email: get('preferred_username') ?? get('emails') ?? undefined,
    };
  } catch { return null; }
}

export async function authenticate(req: HttpRequest): Promise<Principal | null> {
  // 1) Easy Auth user
  const user = readEasyAuth(req);
  if (user) return user;

  // 2) API key (bearer or x-api-key)
  const candidate = readBearer(req) ?? req.headers.get('x-api-key');
  if (!candidate) return null;
  if (!/^sov_(live|test)_[A-Za-z0-9_\-]{20,}$/.test(candidate)) return null;

  const hash = hashKey(candidate);
  const r = await query<{
    id: string; name: string; tenant: string | null; scopes: string[]; revoked_at: Date | null;
  }>(
    `update app.api_keys set last_used_at = now()
     where key_hash = $1 and revoked_at is null
     returning id, name, tenant, scopes, revoked_at`,
    [hash],
  );
  if (r.rowCount === 0) return null;
  const row = r.rows[0];
  // Backward-compat: legacy keys with no scopes get wildcard so they keep working.
  // New keys MUST be created with explicit scopes (UI enforces this).
  const scopes = (Array.isArray(row.scopes) && row.scopes.length > 0) ? row.scopes : ['*'];
  return { kind: 'key', keyId: row.id, name: row.name, tenant: row.tenant, scopes };
}

// ---------- Scope catalog (single source of truth) ----------
export const SCOPE_CATALOG = [
  { id: 'db:read',           label: 'Read database (tables, SELECT, logs, tenants)', group: 'Database' },
  { id: 'db:write',          label: 'Create tables, add tenants',                    group: 'Database' },
  { id: 'embed:read',        label: 'Read embedding stats',                          group: 'Vector / AI' },
  { id: 'embed:write',       label: 'Store embeddings via Azure OpenAI',             group: 'Vector / AI' },
  { id: 'search',            label: 'Semantic search',                               group: 'Vector / AI' },
  { id: 'blob:read',         label: 'List containers / blobs, download SAS',         group: 'Storage' },
  { id: 'blob:write',        label: 'Create containers, upload, delete blobs',       group: 'Storage' },
  { id: 'keys:read',         label: 'List API keys',                                 group: 'API Keys' },
  { id: 'keys:write',        label: 'Create / revoke API keys',                      group: 'API Keys' },
  { id: 'rbac:read',         label: 'Read role assignments',                         group: 'RBAC' },
  { id: 'rbac:write',        label: 'Assign / unassign roles',                       group: 'RBAC' },
  { id: 'compliance:read',   label: 'Read compliance posture',                       group: 'Compliance' },
  { id: 'realtime:publish',  label: 'Publish realtime events',                       group: 'Realtime' },
  { id: 'realtime:subscribe',label: 'Subscribe to realtime events',                  group: 'Realtime' },
] as const;

export type Scope = typeof SCOPE_CATALOG[number]['id'] | '*';
export const SCOPE_IDS: string[] = SCOPE_CATALOG.map(s => s.id);

export function requireScope(p: Principal, scope: Scope): boolean {
  if (p.kind === 'user') return true; // signed-in studio users get full scope
  return p.scopes.includes('*') || p.scopes.includes(scope);
}

// Combined auth + scope guard. Usage:
//   const g = await guard(req, 'embed:write');
//   if (!g.ok) return g.response;
//   const principal = g.principal;
export type GuardResult =
  | { ok: true; principal: Principal }
  | { ok: false; response: import('@azure/functions').HttpResponseInit };

export async function guard(req: HttpRequest, scope: Scope): Promise<GuardResult> {
  const principal = await authenticate(req);
  if (!principal) {
    return { ok: false, response: { status: 401, jsonBody: { error: 'unauthenticated', detail: 'Send Authorization: Bearer sov_live_... or sign in via Studio.' } } };
  }
  if (!requireScope(principal, scope)) {
    return { ok: false, response: { status: 403, jsonBody: { error: 'insufficient_scope', required: scope, have: principal.kind === 'key' ? principal.scopes : ['(user has all)'] } } };
  }
  return { ok: true, principal };
}

// Helper used by handlers that audit
export function actorOf(p: Principal): string {
  return p.kind === 'user' ? (p.email ?? p.sub) : `key:${p.keyId}`;
}
