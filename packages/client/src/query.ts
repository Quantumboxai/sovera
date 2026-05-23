type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

export interface QueryResult<T> {
  data: T[] | null;
  error: { message: string; status: number } | null;
  count?: number;
}

export interface Query<T> {
  select(...columns: string[]): Query<T>;
  eq(column: string, value: unknown): Query<T>;
  neq(column: string, value: unknown): Query<T>;
  gt(column: string, value: unknown): Query<T>;
  gte(column: string, value: unknown): Query<T>;
  lt(column: string, value: unknown): Query<T>;
  lte(column: string, value: unknown): Query<T>;
  like(column: string, value: string): Query<T>;
  order(column: string, opts?: { ascending?: boolean }): Query<T>;
  limit(n: number): Query<T>;
  insert(row: Partial<T> | Partial<T>[]): Promise<QueryResult<T>>;
  update(patch: Partial<T>): Promise<QueryResult<T>>;
  delete(): Promise<QueryResult<T>>;
  then<R = QueryResult<T>>(resolve: (v: QueryResult<T>) => R): Promise<R>;
}

/**
 * Tiny DAB REST query builder. DAB uses OData-style filters.
 *   GET /data/rest/Patient?$filter=tenant_id eq guid'...'&$select=id,name&$orderby=name
 */
export class QueryBuilder<T> implements Query<T> {
  private filters: string[] = [];
  private selects: string[] = [];
  private orderBy?: string;
  private take?: number;

  constructor(private fetcher: Fetcher, private entity: string) {}

  select(...columns: string[]) {
    this.selects = columns;
    return this;
  }
  private op(col: string, op: string, val: unknown) {
    this.filters.push(`${col} ${op} ${encodeVal(val)}`);
    return this;
  }
  eq(c: string, v: unknown)  { return this.op(c, 'eq', v); }
  neq(c: string, v: unknown) { return this.op(c, 'ne', v); }
  gt(c: string, v: unknown)  { return this.op(c, 'gt', v); }
  gte(c: string, v: unknown) { return this.op(c, 'ge', v); }
  lt(c: string, v: unknown)  { return this.op(c, 'lt', v); }
  lte(c: string, v: unknown) { return this.op(c, 'le', v); }
  like(c: string, v: string) { this.filters.push(`contains(${c},${encodeVal(v)})`); return this; }
  order(c: string, opts?: { ascending?: boolean }) {
    this.orderBy = `${c} ${opts?.ascending === false ? 'desc' : 'asc'}`;
    return this;
  }
  limit(n: number) { this.take = n; return this; }

  private buildQuery(): string {
    const q = new URLSearchParams();
    if (this.selects.length) q.set('$select', this.selects.join(','));
    if (this.filters.length) q.set('$filter', this.filters.join(' and '));
    if (this.orderBy) q.set('$orderby', this.orderBy);
    if (this.take != null) q.set('$top', String(this.take));
    return q.toString() ? `?${q}` : '';
  }

  async then<R = QueryResult<T>>(resolve: (v: QueryResult<T>) => R): Promise<R> {
    const r = await this.fetcher(`/data/rest/${this.entity}${this.buildQuery()}`);
    return resolve(await parse<T>(r));
  }

  async insert(row: Partial<T> | Partial<T>[]) {
    const rows = Array.isArray(row) ? row : [row];
    // DAB doesn't accept bulk in v1; loop.
    const out: T[] = [];
    for (const r of rows) {
      const resp = await this.fetcher(`/data/rest/${this.entity}`, { method: 'POST', body: JSON.stringify(r) });
      const parsed = await parse<T>(resp);
      if (parsed.error) return parsed;
      if (parsed.data) out.push(...parsed.data);
    }
    return { data: out, error: null };
  }

  async update(patch: Partial<T>) {
    const resp = await this.fetcher(
      `/data/rest/${this.entity}${this.buildQuery()}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
    return parse<T>(resp);
  }

  async delete() {
    const resp = await this.fetcher(
      `/data/rest/${this.entity}${this.buildQuery()}`,
      { method: 'DELETE' },
    );
    return parse<T>(resp);
  }
}

function encodeVal(v: unknown): string {
  if (v == null) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function parse<T>(r: Response): Promise<QueryResult<T>> {
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).error?.message ?? msg; } catch {}
    return { data: null, error: { message: msg, status: r.status } };
  }
  if (r.status === 204) return { data: [], error: null };
  const body = await r.json();
  // DAB returns { value: [...] } for collections, single object for items
  const data = Array.isArray(body) ? body : body.value ?? (body ? [body] : []);
  return { data, error: null };
}
