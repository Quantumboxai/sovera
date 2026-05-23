// Mock data — replaces live SDK calls until the platform is deployed.
// All values are intentionally illustrative; swap with `useSovera()` queries.

export type Tenant = {
  slug: string;
  name: string;
  tier: 'starter' | 'pro' | 'enterprise';
  region: string;
  status: 'active' | 'paused' | 'provisioning';
  createdAt: string;
  rps: number;
  storageGb: number;
};

export const tenants: Tenant[] = [
  { slug: 'acme',      name: 'Acme Health',          tier: 'enterprise', region: 'FR',  status: 'active',       createdAt: '2026-01-12', rps: 142, storageGb: 412 },
  { slug: 'nimbus',    name: 'Nimbus Clinic Group',  tier: 'pro',        region: 'FR',  status: 'active',       createdAt: '2026-02-03', rps:  31, storageGb:  88 },
  { slug: 'aurora',    name: 'Aurora MedTech',       tier: 'pro',        region: 'FR',  status: 'active',       createdAt: '2026-02-19', rps:  64, storageGb: 121 },
  { slug: 'cypress',   name: 'Cypress Labs',         tier: 'starter',    region: 'FR',  status: 'active',       createdAt: '2026-03-04', rps:   8, storageGb:   3 },
  { slug: 'vega',      name: 'Vega Imaging',         tier: 'enterprise', region: 'FR',  status: 'provisioning', createdAt: '2026-05-19', rps:   0, storageGb:   0 },
];

export type Column = {
  name: string; type: string; nullable: boolean; pk?: boolean; fk?: string; index?: boolean; sensitive?: boolean;
};

export type Table = {
  schema: string;
  name: string;
  rows: number;
  bytes: number;
  rls: 'forced' | 'enabled' | 'off';
  columns: Column[];
  policies: Array<{ name: string; using: string; check?: string }>;
};

export const tables: Table[] = [
  {
    schema: 'app', name: 'patients', rows: 12_842, bytes: 38_421_120, rls: 'forced',
    columns: [
      { name: 'id',         type: 'uuid',        nullable: false, pk: true },
      { name: 'tenant_id',  type: 'uuid',        nullable: false, index: true },
      { name: 'full_name',  type: 'text',        nullable: false, sensitive: true },
      { name: 'dob',        type: 'date',        nullable: true,  sensitive: true },
      { name: 'created_at', type: 'timestamptz', nullable: false },
      { name: 'created_by', type: 'text',        nullable: false },
    ],
    policies: [
      { name: 'p_tenant_isolation', using: 'tenant_id = dl.tenant_id() AND tenant_id = dl.this_tenant()', check: 'tenant_id = dl.this_tenant()' },
    ],
  },
  {
    schema: 'app', name: 'encounters', rows: 84_103, bytes: 122_889_472, rls: 'forced',
    columns: [
      { name: 'id',         type: 'uuid',        nullable: false, pk: true },
      { name: 'tenant_id',  type: 'uuid',        nullable: false, index: true },
      { name: 'patient_id', type: 'uuid',        nullable: false, fk: 'app.patients.id', index: true },
      { name: 'kind',       type: 'text',        nullable: false },
      { name: 'started_at', type: 'timestamptz', nullable: false },
      { name: 'notes',      type: 'text',        nullable: true, sensitive: true },
    ],
    policies: [
      { name: 'p_tenant_isolation', using: 'tenant_id = dl.tenant_id() AND tenant_id = dl.this_tenant()' },
    ],
  },
  {
    schema: 'audit', name: 'events', rows: 1_204_882, bytes: 421_011_104, rls: 'enabled',
    columns: [
      { name: 'id',         type: 'bigserial',   nullable: false, pk: true },
      { name: 'ts',         type: 'timestamptz', nullable: false, index: true },
      { name: 'tenant_id',  type: 'uuid',        nullable: false, index: true },
      { name: 'user_sub',   type: 'text',        nullable: true },
      { name: 'table_name', type: 'text',        nullable: false },
      { name: 'op',         type: 'text',        nullable: false },
      { name: 'row_id',     type: 'uuid',        nullable: true },
      { name: 'diff',       type: 'jsonb',       nullable: true, sensitive: true },
    ],
    policies: [{ name: 'p_read_own_tenant', using: 'tenant_id = dl.tenant_id()' }],
  },
];

export type LogEvent = {
  ts: string;
  level: 'info' | 'warn' | 'error';
  source: 'apim' | 'dab' | 'functions' | 'postgres' | 'sentinel' | 'wps';
  tenant?: string;
  msg: string;
};

export const logs: LogEvent[] = [
  { ts: '12:42:18.211', level: 'info',  source: 'apim',      tenant: 'acme',    msg: 'GET /data/rest/Patient 200 in 38ms (sub=eaa3…f1)' },
  { ts: '12:42:18.044', level: 'info',  source: 'dab',       tenant: 'acme',    msg: 'SET app.claims.tid = 7c2…b1 (RLS pinned)' },
  { ts: '12:42:17.901', level: 'info',  source: 'apim',      tenant: 'nimbus',  msg: 'POST /functions/v1/storage 200 in 71ms' },
  { ts: '12:42:17.788', level: 'warn',  source: 'postgres',  tenant: 'aurora',  msg: 'sovera: tenant claim missing — rejected (assert_tenant)' },
  { ts: '12:42:17.612', level: 'info',  source: 'wps',       tenant: 'acme',    msg: 'broadcast tenant.acme → 142 clients (28KB)' },
  { ts: '12:42:17.502', level: 'info',  source: 'functions', tenant: 'acme',    msg: 'negotiate → wss://sovera-wps-…/client/hubs/realtime' },
  { ts: '12:42:17.330', level: 'error', source: 'sentinel',                       msg: 'Rule "Storage shared-key usage" — 0 hits in 24h ✓' },
];

export const complianceFlags = [
  { code: 'HDS-5.2.3',    label: 'Per-tenant isolation enforced',  ok: true },
  { code: 'HDS-5.1.2',    label: 'CMK active on every store',      ok: true },
  { code: 'HIPAA-§164.312', label: 'TLS 1.2 / audit / unique IDs',  ok: true },
  { code: 'ISO-8.3',      label: 'Access via Entra groups only',   ok: true },
];

export type RealtimeChannel = {
  name: string; tenant: string; clients: number; msgPerMin: number;
};

export const channels: RealtimeChannel[] = [
  { name: 'app.patients',   tenant: 'acme',    clients: 142, msgPerMin: 312 },
  { name: 'app.encounters', tenant: 'acme',    clients:  88, msgPerMin: 174 },
  { name: 'app.patients',   tenant: 'nimbus',  clients:  24, msgPerMin:  48 },
];

export type Bucket = { name: string; tenant: string; objects: number; bytes: number; immutable: boolean };
export const buckets: Bucket[] = [
  { name: 'tnt-acme',    tenant: 'acme',    objects: 28_140, bytes: 384_290_000_000, immutable: true },
  { name: 'tnt-nimbus',  tenant: 'nimbus',  objects:  4_820, bytes:  82_111_000_000, immutable: true },
  { name: 'tnt-aurora',  tenant: 'aurora',  objects:  9_002, bytes: 117_330_000_000, immutable: true },
  { name: 'audit',       tenant: '*',       objects: 12_044, bytes:  18_220_000_000, immutable: true },
];

export const fmtBytes = (n: number) => {
  if (n > 1e12) return (n / 1e12).toFixed(2) + ' TB';
  if (n > 1e9)  return (n / 1e9).toFixed(2)  + ' GB';
  if (n > 1e6)  return (n / 1e6).toFixed(1)  + ' MB';
  if (n > 1e3)  return (n / 1e3).toFixed(1)  + ' KB';
  return n + ' B';
};
