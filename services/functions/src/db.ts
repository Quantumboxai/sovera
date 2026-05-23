// Lazy pg pool that authenticates via Entra (UAI managed identity → token as password).
import pg from 'pg';
import { DefaultAzureCredential } from '@azure/identity';

const PG_HOST = process.env.PG_HOST!;
const PG_DB = process.env.PG_DB ?? 'postgres';
const PG_USER = process.env.PG_USER!; // Entra principal display name granted on the server
const PG_PORT = Number(process.env.PG_PORT ?? 5432);

const credential = new DefaultAzureCredential();

let pool: pg.Pool | null = null;
let tokenExp = 0;
let cachedToken = '';

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExp - 5 * 60_000) return cachedToken;
  const t = await credential.getToken('https://ossrdbms-aad.database.windows.net/.default');
  cachedToken = t!.token;
  tokenExp = t!.expiresOnTimestamp;
  return cachedToken;
}

export async function getPool(): Promise<pg.Pool> {
  if (pool) return pool;
  const password = await getToken();
  pool = new pg.Pool({
    host: PG_HOST,
    port: PG_PORT,
    database: PG_DB,
    user: PG_USER,
    password,
    ssl: { rejectUnauthorized: false },
    max: 4,
    idleTimeoutMillis: 30_000,
  });
  // Refresh password on the pool when token rotates (simple strategy: rebuild pool on auth fail).
  pool.on('error', (err) => {
    console.error('pg pool error', err);
    pool = null;
  });
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const p = await getPool();
  try {
    return await p.query<T>(sql, params as never);
  } catch (e: unknown) {
    // On auth errors, drop the pool so the next call refreshes the token
    const msg = (e as Error)?.message ?? '';
    if (/password authentication failed|SASL|expired/i.test(msg)) {
      pool = null;
      cachedToken = '';
    }
    throw e;
  }
}
