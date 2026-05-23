// Real embeddings: calls Azure OpenAI via UAI token, persists vectors in app.embeddings.
// CREATE EXTENSION vector + table is created on first call (idempotent).
import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { DefaultAzureCredential } from '@azure/identity';
import { query, getPool } from './db.js';
import { ensureSchema, audit } from './bootstrap.js';
import { guard, actorOf } from './auth.js';

const AOAI_ENDPOINT = process.env.AOAI_ENDPOINT!;
const AOAI_DEPLOYMENT = process.env.AOAI_DEPLOYMENT ?? 'text-embedding-3-small';
const AOAI_API_VERSION = process.env.AOAI_API_VERSION ?? '2024-10-21';
const EMBED_DIM = 1536; // text-embedding-3-small

const credential = new DefaultAzureCredential();
let aoaiToken = ''; let aoaiTokenExp = 0;
async function getAoaiToken(): Promise<string> {
  if (aoaiToken && Date.now() < aoaiTokenExp - 5 * 60_000) return aoaiToken;
  const t = await credential.getToken('https://cognitiveservices.azure.com/.default');
  aoaiToken = t!.token; aoaiTokenExp = t!.expiresOnTimestamp;
  return aoaiToken;
}

let vecReady = false;
async function ensureVectorSchema(): Promise<void> {
  if (vecReady) return;
  await ensureSchema();
  await query(`create extension if not exists vector`);
  await query(`
    create table if not exists app.embeddings (
      id           uuid primary key default gen_random_uuid(),
      tenant       text,
      source       text not null,
      ref          text,
      content      text not null,
      embedding    vector(${EMBED_DIM}) not null,
      metadata     jsonb,
      created_at   timestamptz not null default now()
    )
  `);
  // Idempotent migration: add model + dim columns for safe model upgrades.
  await query(`alter table app.embeddings add column if not exists model text not null default '${AOAI_DEPLOYMENT}'`);
  await query(`alter table app.embeddings add column if not exists dim   int  not null default ${EMBED_DIM}`);
  await query(`
    create index if not exists embeddings_hnsw_cos
      on app.embeddings using hnsw (embedding vector_cosine_ops)
  `);
  await query(`create index if not exists embeddings_tenant on app.embeddings (tenant)`);
  await query(`create index if not exists embeddings_source on app.embeddings (source)`);
  await query(`create index if not exists embeddings_model  on app.embeddings (model)`);
  vecReady = true;
}

type EmbedTokenUsage = { prompt_tokens?: number; total_tokens?: number };
async function embedTexts(texts: string[]): Promise<{ vectors: number[][]; usage: EmbedTokenUsage }> {
  const token = await getAoaiToken();
  const url = `${AOAI_ENDPOINT.replace(/\/$/, '')}/openai/deployments/${AOAI_DEPLOYMENT}/embeddings?api-version=${AOAI_API_VERSION}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ input: texts, model: AOAI_DEPLOYMENT }),
  });
  if (!res.ok) throw new Error(`aoai_${res.status}:${await res.text()}`);
  const json = await res.json() as { data: Array<{ embedding: number[] }>; usage?: EmbedTokenUsage };
  return { vectors: json.data.map(d => d.embedding), usage: json.usage ?? {} };
}

type EmbedBody = { texts?: string[]; tenant?: string; source?: string; refs?: (string|null)[]; metadata?: unknown[] };

async function embedHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const g = await guard(req, 'embed:write'); if (!g.ok) return g.response;
  const principal = g.principal;
  await ensureVectorSchema();
  let body: EmbedBody;
  try { body = (await req.json()) as EmbedBody; } catch { return { status: 400, jsonBody: { error: 'invalid_json' } }; }
  const texts = (body.texts ?? []).map(t => String(t ?? '')).filter(t => t.length > 0 && t.length < 8000);
  if (!texts.length) return { status: 400, jsonBody: { error: 'texts_required' } };
  if (texts.length > 64) return { status: 400, jsonBody: { error: 'too_many_texts', max: 64 } };

  const source = (body.source ?? 'inline').slice(0, 80);
  const tenant = body.tenant?.trim() || (principal.kind === 'key' ? principal.tenant : null);
  const refs = body.refs ?? [];
  const meta = body.metadata ?? [];

  const t0 = Date.now();
  const { vectors, usage } = await embedTexts(texts);
  const ms = Date.now() - t0;

  const pool = await getPool();
  const client = await pool.connect();
  const inserted: string[] = [];
  try {
    await client.query('BEGIN');
    for (let i = 0; i < texts.length; i++) {
      const vec = `[${vectors[i].join(',')}]`;
      const r = await client.query<{ id: string }>(
        `insert into app.embeddings (tenant, source, ref, content, embedding, metadata, model, dim)
         values ($1,$2,$3,$4,$5::vector,$6,$7,$8) returning id`,
        [tenant, source, refs[i] ?? null, texts[i], vec, meta[i] ? JSON.stringify(meta[i]) : null, AOAI_DEPLOYMENT, EMBED_DIM],
      );
      inserted.push(r.rows[0].id);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally { client.release(); }

  const actor = actorOf(principal);
  await audit(actor, 'embed.create', source, true, { count: texts.length, ms, tokens: usage.total_tokens, tenant });

  return { status: 201, jsonBody: { ok: true, count: inserted.length, ids: inserted, ms, model: AOAI_DEPLOYMENT, dim: EMBED_DIM, tokens: usage.total_tokens ?? null } };
}

type SearchBody = { query?: string; tenant?: string; source?: string; k?: number };

async function searchHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const g = await guard(req, 'search'); if (!g.ok) return g.response;
  const principal = g.principal;
  await ensureVectorSchema();
  let body: SearchBody;
  try { body = (await req.json()) as SearchBody; } catch { return { status: 400, jsonBody: { error: 'invalid_json' } }; }
  const q = (body.query ?? '').trim();
  if (!q) return { status: 400, jsonBody: { error: 'query_required' } };
  const k = Math.max(1, Math.min(50, body.k ?? 10));
  // API keys are tenant-locked: ignore any tenant override from the body.
  const tenant = principal.kind === 'key'
    ? principal.tenant
    : (body.tenant?.trim() || null);
  const source = body.source?.trim() || null;

  const t0 = Date.now();
  const { vec, usage } = await (async () => {
    const r = await embedTexts([q]);
    return { vec: r.vectors[0], usage: r.usage };
  })();
  const vecLit = `[${vec.join(',')}]`;

  // Always filter by current model + dim so vectors from a previous model don't pollute results.
  const filters: string[] = [`model = $3`, `dim = $4`];
  const params: unknown[] = [vecLit, k, AOAI_DEPLOYMENT, EMBED_DIM];
  if (tenant) { params.push(tenant); filters.push(`tenant = $${params.length}`); }
  if (source) { params.push(source); filters.push(`source = $${params.length}`); }
  const where = `where ${filters.join(' and ')}`;

  const r = await query<{ id: string; tenant: string | null; source: string; ref: string | null; content: string; score: number; metadata: unknown }>(
    `select id, tenant, source, ref, content, metadata,
            1 - (embedding <=> $1::vector) as score
     from app.embeddings ${where}
     order by embedding <=> $1::vector
     limit $2`,
    params,
  );
  const ms = Date.now() - t0;
  return { status: 200, jsonBody: { ok: true, query: q, results: r.rows, ms, k, model: AOAI_DEPLOYMENT, dim: EMBED_DIM, tenantScope: tenant, tokens: usage.total_tokens ?? null } };
}

async function statsHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const g = await guard(req, 'embed:read'); if (!g.ok) return g.response;
  await ensureVectorSchema();
  const r = await query<{ source: string; n: string; tenants: string }>(
    `select coalesce(source,'(none)') as source, count(*)::text as n,
            count(distinct tenant)::text as tenants
     from app.embeddings group by 1 order by 2 desc limit 50`,
  );
  const byModel = await query<{ model: string; dim: number; n: string }>(
    `select model, dim, count(*)::text as n from app.embeddings group by model, dim order by 3 desc`,
  );
  const total = await query<{ n: string }>(`select count(*)::text as n from app.embeddings`);
  return {
    status: 200,
    jsonBody: {
      ok: true,
      total: Number(total.rows[0].n),
      model: AOAI_DEPLOYMENT,
      dim: EMBED_DIM,
      bySource: r.rows.map(x => ({ source: x.source, count: Number(x.n), tenants: Number(x.tenants) })),
      byModel: byModel.rows.map(x => ({ model: x.model, dim: x.dim, count: Number(x.n), current: x.model === AOAI_DEPLOYMENT && x.dim === EMBED_DIM })),
    },
  };
}

// DELETE /api/embed/{id}  — delete a single embedding row
async function deleteOneHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const g = await guard(req, 'embed:write'); if (!g.ok) return g.response;
  const principal = g.principal;
  await ensureVectorSchema();
  const id = (req.params.id ?? '').trim();
  if (!/^[a-f0-9-]{36}$/i.test(id)) return { status: 400, jsonBody: { error: 'invalid_id' } };
  // API keys can only delete rows in their own tenant.
  const lockedTenant = principal.kind === 'key' ? principal.tenant : null;
  const params: unknown[] = [id];
  let tenantClause = '';
  if (lockedTenant) { params.push(lockedTenant); tenantClause = `and tenant = $${params.length}`; }
  const r = await query<{ id: string }>(`delete from app.embeddings where id = $1 ${tenantClause} returning id`, params);
  await audit(actorOf(principal), 'embed.delete', id, (r.rowCount ?? 0) > 0, { tenantScoped: !!lockedTenant });
  if (r.rowCount === 0) return { status: 404, jsonBody: { error: 'not_found_or_forbidden' } };
  return { status: 200, jsonBody: { ok: true, id } };
}

// POST /api/embed/bulk-delete  — { source?, tenant?, model? }
type BulkDeleteBody = { source?: string; tenant?: string; model?: string };
async function bulkDeleteHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const g = await guard(req, 'embed:write'); if (!g.ok) return g.response;
  const principal = g.principal;
  await ensureVectorSchema();
  let body: BulkDeleteBody;
  try { body = (await req.json()) as BulkDeleteBody; } catch { return { status: 400, jsonBody: { error: 'invalid_json' } }; }
  // Force at least one filter to avoid mass-wipe by accident.
  const filters: string[] = [];
  const params: unknown[] = [];
  // API keys are always tenant-locked.
  const lockedTenant = principal.kind === 'key' ? principal.tenant : (body.tenant?.trim() || null);
  if (lockedTenant) { params.push(lockedTenant); filters.push(`tenant = $${params.length}`); }
  if (body.source?.trim()) { params.push(body.source.trim()); filters.push(`source = $${params.length}`); }
  if (body.model?.trim()) { params.push(body.model.trim()); filters.push(`model = $${params.length}`); }
  if (filters.length === 0) return { status: 400, jsonBody: { error: 'filter_required', hint: 'specify source, tenant, or model' } };
  const r = await query<{ id: string }>(`delete from app.embeddings where ${filters.join(' and ')} returning id`, params);
  await audit(actorOf(principal), 'embed.bulk_delete', filters.join(' and '), true, { deleted: r.rowCount, filters: body });
  return { status: 200, jsonBody: { ok: true, deleted: r.rowCount } };
}

app.http('embed',           { route: 'embed',             methods: ['POST'],   authLevel: 'function', handler: embedHandler });
app.http('embed-search',    { route: 'search',            methods: ['POST'],   authLevel: 'function', handler: searchHandler });
app.http('embed-stats',     { route: 'embed/stats',       methods: ['GET'],    authLevel: 'function', handler: statsHandler });
app.http('embed-delete',    { route: 'embed/{id}',        methods: ['DELETE'], authLevel: 'function', handler: deleteOneHandler });
app.http('embed-bulk-del',  { route: 'embed/bulk-delete', methods: ['POST'],   authLevel: 'function', handler: bulkDeleteHandler });
