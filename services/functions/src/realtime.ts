// Realtime: server-sent events stream backed by Postgres LISTEN/NOTIFY.
// Client subscribes to a channel (slug-safe). Each NOTIFY on that channel is forwarded.
import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import pg from 'pg';
import { DefaultAzureCredential } from '@azure/identity';
import { guard } from './auth.js';

const credential = new DefaultAzureCredential();

async function pgClient(): Promise<pg.Client> {
  const tok = await credential.getToken('https://ossrdbms-aad.database.windows.net/.default');
  const c = new pg.Client({
    host: process.env.PG_HOST!,
    user: process.env.PG_USER!,
    database: process.env.PG_DB ?? 'postgres',
    password: tok!.token,
    port: 5432,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  return c;
}

function safeChannel(s: string): string | null {
  const v = (s ?? '').toLowerCase();
  return /^[a-z][a-z0-9_]{0,40}$/.test(v) ? v : null;
}

async function publish(req: HttpRequest): Promise<HttpResponseInit> {
  const g = await guard(req, 'realtime:publish'); if (!g.ok) return g.response;
  let body: { channel?: string; payload?: unknown };
  try { body = (await req.json()) as never; } catch { return { status: 400, jsonBody: { error: 'invalid_json' } }; }
  const ch = safeChannel(body.channel ?? '');
  if (!ch) return { status: 400, jsonBody: { error: 'invalid_channel' } };
  const payload = JSON.stringify(body.payload ?? {});
  if (payload.length > 7000) return { status: 400, jsonBody: { error: 'payload_too_large' } };
  const c = await pgClient();
  try {
    await c.query(`select pg_notify($1, $2)`, [ch, payload]);
  } finally { await c.end(); }
  return { status: 200, jsonBody: { ok: true, channel: ch } };
}

async function subscribe(req: HttpRequest): Promise<HttpResponseInit> {
  const g = await guard(req, 'realtime:subscribe'); if (!g.ok) return g.response;
  const ch = safeChannel(req.params.channel ?? '');
  if (!ch) return { status: 400, jsonBody: { error: 'invalid_channel' } };
  const c = await pgClient();
  try {
    await c.query(`LISTEN ${ch}`);
    // Collect up to 30s of events then return — clients poll in a loop (SSE not supported on Functions Consumption).
    const events: Array<{ at: string; payload: unknown }> = [];
    const start = Date.now();
    const timeoutMs = 28_000;
    const onNotify = (msg: pg.Notification) => {
      let parsed: unknown = msg.payload;
      try { parsed = msg.payload ? JSON.parse(msg.payload) : null; } catch { /* keep raw */ }
      events.push({ at: new Date().toISOString(), payload: parsed });
    };
    c.on('notification', onNotify);
    while (Date.now() - start < timeoutMs && events.length < 50) {
      await new Promise(r => setTimeout(r, 250));
    }
    return { status: 200, jsonBody: { ok: true, channel: ch, count: events.length, events, waited: Date.now() - start } };
  } finally { await c.end(); }
}

app.http('rt-publish',   { route: 'realtime/publish',           methods: ['POST'], authLevel: 'function', handler: publish });
app.http('rt-subscribe', { route: 'realtime/{channel}',         methods: ['GET'],  authLevel: 'function', handler: subscribe });
