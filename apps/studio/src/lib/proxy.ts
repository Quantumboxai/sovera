// Server-side proxy: forwards requests to the Functions app using the function key
// stored as a Container App secret. Client never sees the key. Forwards Easy Auth identity.
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

const FUNC_BASE = process.env.FUNC_BASE;
const FUNC_KEY = process.env.FUNC_KEY;

export async function proxyFunctions(
  path: string,
  init?: RequestInit & { body?: BodyInit | null; query?: Record<string, string | undefined> },
) {
  if (!FUNC_BASE || !FUNC_KEY) {
    return NextResponse.json({ error: 'gateway_not_configured' }, { status: 503 });
  }
  const qs = new URLSearchParams({ code: FUNC_KEY });
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    }
  }
  const url = `${FUNC_BASE.replace(/\/$/, '')}/api/${path}?${qs.toString()}`;

  const h = await headers();
  const easyAuth = h.get('x-ms-client-principal');
  const easyAuthName = h.get('x-ms-client-principal-name');
  const easyAuthId = h.get('x-ms-client-principal-id');

  try {
    const method = init?.method ?? 'GET';
    const r = await fetch(url, {
      method,
      headers: {
        'accept': 'application/json',
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...(easyAuth ? { 'x-ms-client-principal': easyAuth } : {}),
        ...(easyAuthName ? { 'x-ms-client-principal-name': easyAuthName } : {}),
        ...(easyAuthId ? { 'x-ms-client-principal-id': easyAuthId } : {}),
        ...(init?.headers ?? {}),
      },
      body: init?.body ?? undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    const body = await r.text();
    return new NextResponse(body, {
      status: r.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'gateway_unreachable', detail: (e as Error)?.message },
      { status: 502 },
    );
  }
}
