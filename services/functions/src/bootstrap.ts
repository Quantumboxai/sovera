// Bootstrap: idempotently create the app.* meta tables Sovera needs (api_keys, rbac).
// Called on each cold start of every Function so a fresh install self-heals.
import { query } from './db.js';

let initialized = false;
let initPromise: Promise<void> | null = null;

export async function ensureSchema(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await query(`create schema if not exists app`);

    await query(`
      create table if not exists app.api_keys (
        id            uuid primary key default gen_random_uuid(),
        name          text not null,
        prefix        text not null,
        key_hash      text not null unique,
        tenant        text,
        scopes        text[] not null default array['db:read','db:write','sql:run','embed:run'],
        created_by    text,
        created_at    timestamptz not null default now(),
        last_used_at  timestamptz,
        revoked_at    timestamptz
      )
    `);

    await query(`
      create table if not exists app.role_assignments (
        id          uuid primary key default gen_random_uuid(),
        principal   text not null,
        principal_name text,
        role        text not null check (role in ('Owner','Admin','Developer','Data Analyst','Auditor','Tenant Admin')),
        scope       text not null default 'project:sovera',
        created_at  timestamptz not null default now(),
        unique (principal, role, scope)
      )
    `);

    await query(`
      create table if not exists app.audit_log (
        id          bigserial primary key,
        at          timestamptz not null default now(),
        principal   text,
        action      text not null,
        target      text,
        ok          boolean not null default true,
        detail      jsonb
      )
    `);

    initialized = true;
  })();
  try { await initPromise; }
  catch (e) { initPromise = null; throw e; }
}

export async function audit(principal: string, action: string, target: string, ok = true, detail?: unknown): Promise<void> {
  try {
    await query(
      `insert into app.audit_log (principal, action, target, ok, detail) values ($1,$2,$3,$4,$5)`,
      [principal, action, target, ok, detail ? JSON.stringify(detail) : null],
    );
  } catch (e) { console.error('audit failed', e); }
}
