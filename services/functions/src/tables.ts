import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { query } from './db.js';
import { guard } from './auth.js';

type Column = {
  name: string; type: string; nullable: boolean; pk?: boolean; fk?: string; index?: boolean; sensitive?: boolean;
};
type Table = {
  schema: string; name: string; rows: number; bytes: number;
  rls: 'forced' | 'enabled' | 'off';
  columns: Column[];
  policies: Array<{ name: string; using: string; check?: string }>;
};

const TABLES_SQL = `
  SELECT
    n.nspname                                                    AS schema,
    c.relname                                                    AS name,
    COALESCE(c.reltuples, 0)::bigint                             AS rows,
    pg_total_relation_size(c.oid)::bigint                        AS bytes,
    CASE WHEN c.relforcerowsecurity THEN 'forced'
         WHEN c.relrowsecurity      THEN 'enabled'
         ELSE 'off' END                                          AS rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
    AND n.nspname NOT LIKE 'pg_temp_%'
  ORDER BY n.nspname, c.relname
  LIMIT 200;
`;

const COLUMNS_SQL = `
  SELECT
    n.nspname                                            AS schema,
    c.relname                                            AS table,
    a.attname                                            AS name,
    pg_catalog.format_type(a.atttypid, a.atttypmod)      AS type,
    NOT a.attnotnull                                     AS nullable,
    COALESCE(idx.indisprimary, false)                    AS pk,
    COALESCE(has_index.flag, false)                      AS has_index
  FROM pg_attribute a
  JOIN pg_class c   ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_index idx ON idx.indrelid = c.oid AND a.attnum = ANY(idx.indkey) AND idx.indisprimary
  LEFT JOIN LATERAL (
    SELECT true AS flag FROM pg_index ix WHERE ix.indrelid = c.oid AND a.attnum = ANY(ix.indkey) LIMIT 1
  ) has_index ON true
  WHERE c.relkind = 'r'
    AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
    AND a.attnum > 0 AND NOT a.attisdropped
  ORDER BY n.nspname, c.relname, a.attnum;
`;

const POLICIES_SQL = `
  SELECT schemaname AS schema, tablename AS table, policyname AS name,
         COALESCE(qual,'true') AS using_expr,
         COALESCE(with_check, NULL) AS check_expr
  FROM pg_policies
  WHERE schemaname NOT IN ('pg_catalog','information_schema');
`;

const SENSITIVE_HINTS = /(name|email|phone|dob|ssn|address|notes|diff|password|secret)/i;

export async function tables(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const g = await guard(req, 'db:read'); if (!g.ok) return g.response;
  try {
    const [tRes, cRes, pRes] = await Promise.all([
      query<{ schema: string; name: string; rows: string; bytes: string; rls: 'forced'|'enabled'|'off' }>(TABLES_SQL),
      query<{ schema: string; table: string; name: string; type: string; nullable: boolean; pk: boolean; has_index: boolean }>(COLUMNS_SQL),
      query<{ schema: string; table: string; name: string; using_expr: string; check_expr: string | null }>(POLICIES_SQL),
    ]);

    const byTable = new Map<string, Table>();
    for (const r of tRes.rows) {
      const key = `${r.schema}.${r.name}`;
      byTable.set(key, {
        schema: r.schema,
        name: r.name,
        rows: Number(r.rows),
        bytes: Number(r.bytes),
        rls: r.rls,
        columns: [],
        policies: [],
      });
    }
    for (const c of cRes.rows) {
      const key = `${c.schema}.${c.table}`;
      const t = byTable.get(key);
      if (!t) continue;
      t.columns.push({
        name: c.name,
        type: c.type,
        nullable: c.nullable,
        pk: c.pk || undefined,
        index: c.has_index || undefined,
        sensitive: SENSITIVE_HINTS.test(c.name) || undefined,
      });
    }
    for (const p of pRes.rows) {
      const key = `${p.schema}.${p.table}`;
      const t = byTable.get(key);
      if (!t) continue;
      t.policies.push({ name: p.name, using: p.using_expr, ...(p.check_expr ? { check: p.check_expr } : {}) });
    }

    return { status: 200, headers: { 'Cache-Control': 'no-store' }, jsonBody: Array.from(byTable.values()) };
  } catch (e: unknown) {
    ctx.error('tables query failed', e);
    return { status: 500, jsonBody: { error: 'tables_query_failed', detail: (e as Error)?.message } };
  }
}

app.http('tables', {
  route: 'tables',
  methods: ['GET'],
  authLevel: 'function',
  handler: tables,
});

// ---------- POST /api/tables : create a table ----------
const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const ALLOWED_TYPES = new Set([
  'uuid', 'text', 'varchar', 'int', 'integer', 'bigint', 'smallint',
  'boolean', 'bool', 'date', 'timestamp', 'timestamptz', 'jsonb', 'json',
  'numeric', 'real', 'double precision', 'bytea',
]);

function qIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

type CreateTableBody = {
  schema?: string;
  name?: string;
  columns?: Array<{ name?: string; type?: string; nullable?: boolean; pk?: boolean }>;
  rls?: boolean;
};

export async function createTable(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const g = await guard(req, 'db:write'); if (!g.ok) return g.response;
  let body: CreateTableBody;
  try {
    body = (await req.json()) as CreateTableBody;
  } catch {
    return { status: 400, jsonBody: { error: 'invalid_json' } };
  }

  const schema = (body.schema ?? 'public').trim().toLowerCase();
  const name = (body.name ?? '').trim().toLowerCase();
  const cols = Array.isArray(body.columns) ? body.columns : [];

  if (!IDENT.test(schema)) return { status: 400, jsonBody: { error: 'invalid_schema' } };
  if (!IDENT.test(name)) return { status: 400, jsonBody: { error: 'invalid_table_name' } };
  if (cols.length === 0 || cols.length > 50) return { status: 400, jsonBody: { error: 'columns_required' } };

  const pieces: string[] = [];
  let hasPk = false;
  for (const c of cols) {
    const cn = (c.name ?? '').trim().toLowerCase();
    const ct = (c.type ?? '').trim().toLowerCase();
    if (!IDENT.test(cn)) return { status: 400, jsonBody: { error: 'invalid_column_name', column: cn } };
    if (!ALLOWED_TYPES.has(ct)) return { status: 400, jsonBody: { error: 'invalid_column_type', type: ct } };
    let part = `${qIdent(cn)} ${ct}`;
    if (c.pk) { part += ' PRIMARY KEY'; hasPk = true; }
    else if (c.nullable === false) part += ' NOT NULL';
    pieces.push(part);
  }
  if (!hasPk) {
    // prepend an id uuid PK
    pieces.unshift(`${qIdent('id')} uuid PRIMARY KEY DEFAULT gen_random_uuid()`);
  }

  const fqn = `${qIdent(schema)}.${qIdent(name)}`;
  const ddl = `CREATE TABLE ${fqn} (${pieces.join(', ')});`;
  const rlsDdl = body.rls ? `ALTER TABLE ${fqn} ENABLE ROW LEVEL SECURITY;` : '';

  try {
    await query(`CREATE SCHEMA IF NOT EXISTS ${qIdent(schema)};`);
    await query(ddl);
    if (rlsDdl) await query(rlsDdl);
    return { status: 201, jsonBody: { ok: true, schema, name, ddl, rls: !!body.rls } };
  } catch (e: unknown) {
    ctx.error('createTable failed', e);
    const msg = (e as Error)?.message ?? 'unknown';
    const status = /already exists/i.test(msg) ? 409 : 500;
    return { status, jsonBody: { error: 'create_table_failed', detail: msg } };
  }
}

app.http('tables-create', {
  route: 'tables',
  methods: ['POST'],
  authLevel: 'function',
  handler: createTable,
});
