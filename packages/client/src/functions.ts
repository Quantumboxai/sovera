type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

export class Functions {
  constructor(private fetcher: Fetcher) {}

  /** Invoke an Edge Function: `POST /functions/v1/<name>`. */
  async invoke<T = unknown>(name: string, body?: unknown): Promise<{ data: T | null; error: Error | null }> {
    const r = await this.fetcher(`/functions/v1/${name}`, {
      method: 'POST',
      body: body == null ? undefined : JSON.stringify(body),
    });
    if (!r.ok) {
      return { data: null, error: new Error(`${r.status} ${r.statusText}`) };
    }
    const data = r.headers.get('content-type')?.includes('application/json')
      ? await r.json()
      : ((await r.text()) as unknown as T);
    return { data: data as T, error: null };
  }
}
