'use client';

import { useState } from 'react';
import { H1, Card, CardTitle, Badge, Button } from '@/components/ui';
import { Code2, Copy, CheckCircle2, ArrowRight, Bot } from 'lucide-react';
import Link from 'next/link';

const FUNCTIONS_URL = process.env.NEXT_PUBLIC_FUNCTIONS_URL ?? 'https://sovera-fn-h2ssji7afhlr2.azurewebsites.net';

type Lang = 'rest' | 'ts' | 'python' | 'go' | 'dotnet';
const LANGS: { id: Lang; label: string; status: 'shipping' | 'roadmap' }[] = [
  { id: 'rest',   label: 'REST / cURL', status: 'shipping' },
  { id: 'ts',     label: 'TypeScript',  status: 'shipping' },
  { id: 'python', label: 'Python',      status: 'roadmap'  },
  { id: 'go',     label: 'Go',          status: 'roadmap'  },
  { id: 'dotnet', label: '.NET / C#',   status: 'roadmap'  },
];

const SAMPLES: Record<Lang, { install?: string; code: string; note?: string }> = {
  rest: {
    code: `# Pure REST — no client library required. Works from any language.
curl -sS ${FUNCTIONS_URL}/api/sql \\
  -H "authorization: Bearer $SOVERA_KEY" \\
  -H "content-type: application/json" \\
  -d '{"sql":"select id, created_at from app.users limit 10","tenant":"acme"}'

# Semantic search
curl -sS ${FUNCTIONS_URL}/api/search \\
  -H "authorization: Bearer $SOVERA_KEY" \\
  -H "content-type: application/json" \\
  -d '{"query":"refund policy","k":5}'

# List tables
curl -sS ${FUNCTIONS_URL}/api/tables \\
  -H "authorization: Bearer $SOVERA_KEY"`,
  },
  ts: {
    install: '# from a GitHub release tarball (npm publish coming):\nnpm install https://github.com/DavidMalickDieng-wq/sovera/releases/download/client-v0.1.0/sovera-client-0.1.0.tgz',
    code: `import { createClient } from '@sovera/client';

const sovera = createClient({
  url:    process.env.SOVERA_URL!,
  apiKey: process.env.SOVERA_KEY!,   // server-side only — never ship to a browser
});

// Read
const { rows } = await sovera.sql(
  \`select id, full_name from app.users limit 10\`,
  { tenant: 'acme' }
);

// Vector search
const hits = await sovera.search({ query: 'onboarding steps', k: 5 });

// Embed
await sovera.embed({ texts: ['…doc chunk…'], source: 'docs' });`,
    note: 'Shipping today via local file: install or a GitHub release tarball. npm publish under @sovera/* is queued behind org verification.',
  },
  python: { code: '# Roadmap. Use the REST examples or generate a client from the OpenAPI spec\n# at GET /api/openapi.json (planned).', note: 'Not shipped yet. Use REST.' },
  go:     { code: '// Roadmap. Use the REST examples or generate a client from the OpenAPI spec\n// at GET /api/openapi.json (planned).', note: 'Not shipped yet. Use REST.' },
  dotnet: { code: '// Roadmap. Use the REST examples or generate a client from the OpenAPI spec\n// at GET /api/openapi.json (planned).', note: 'Not shipped yet. Use REST.' },
};

export default function SdkPage() {
  const [active, setActive] = useState<Lang>('rest');
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, k: string) => { navigator.clipboard.writeText(text); setCopied(k); setTimeout(() => setCopied(null), 1500); };

  const current = LANGS.find(l => l.id === active)!;
  const sample = SAMPLES[active];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-(--color-ink-mute) mb-2">
          <span>Developer</span><span>/</span><span className="text-(--color-ink-dim)">SDK Setup</span>
        </div>
        <H1>Connect to Sovera</H1>
        <p className="text-[13px] text-(--color-ink-mute) mt-1 max-w-3xl">
          Sovera is a plain HTTPS API behind your function-key or <code className="font-mono text-(--color-ink)">sov_live_</code> API key — any language that can speak HTTP can use it. A first-party TypeScript client is shipping; Python, Go, and .NET wrappers are on the roadmap (use REST in the meantime).
        </p>
      </div>

      <Card className="!p-0 overflow-hidden border-(--color-violet)/30 bg-gradient-to-br from-(--color-violet)/10 to-(--color-cyan)/5">
        <div className="p-5 flex items-start gap-4">
          <div className="h-10 w-10 rounded-lg bg-(--color-violet)/20 flex items-center justify-center shrink-0">
            <Bot className="h-5 w-5 text-(--color-violet)" />
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-medium text-(--color-ink)">Building an AI agent? Skip the SDK.</div>
            <p className="mt-1 text-[12px] text-(--color-ink-dim) leading-relaxed">
              Sovera ships a <strong>Model Context Protocol</strong> server. Claude Desktop, Cursor, VS Code Copilot, Lovable, Windsurf, Continue.dev, and Cline can read your tables, run SQL, do vector search, and tail logs out of the box — no glue code required.
            </p>
            <Link href="/mcp" className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-(--color-cyan) hover:underline">
              Connect an agent in 30 seconds <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-12 gap-5">
        <Card className="col-span-12 lg:col-span-3 !p-3">
          <div className="px-1.5 py-1 text-[10px] uppercase tracking-wider text-(--color-ink-mute)">Languages</div>
          <ul className="space-y-0.5">
            {LANGS.map(l => (
              <li key={l.id}>
                <button onClick={() => setActive(l.id)}
                  className={'w-full text-left px-2.5 py-2 rounded-md text-[13px] flex items-center justify-between ' + (active === l.id ? 'bg-white/[0.05] text-(--color-ink)' : 'text-(--color-ink-dim) hover:bg-white/[0.03] hover:text-(--color-ink)')}>
                  <span className="flex items-center gap-2"><Code2 className="h-3.5 w-3.5" /> {l.label}</span>
                  <Badge tone={l.status === 'shipping' ? 'good' : 'neutral'}>{l.status}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <div className="col-span-12 lg:col-span-9 space-y-5">
          {sample.install && (
            <Card>
              <CardTitle>Install</CardTitle>
              <div className="mt-3 flex items-start gap-2">
                <pre className="flex-1 font-mono text-[12px] text-(--color-ink) bg-black/30 border border-(--color-line) rounded-md px-3 py-2 whitespace-pre overflow-x-auto">{sample.install}</pre>
                <Button variant="ghost" onClick={() => copy(sample.install!, 'install')}>
                  {copied === 'install' ? <CheckCircle2 className="h-3.5 w-3.5 text-(--color-good)" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </Card>
          )}

          <Card className="!p-0">
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <CardTitle>{current.label} — quick start</CardTitle>
              <Button variant="ghost" onClick={() => copy(sample.code, 'code')}>
                {copied === 'code' ? <><CheckCircle2 className="h-3.5 w-3.5 text-(--color-good)" /> copied</> : <><Copy className="h-3.5 w-3.5" /> copy</>}
              </Button>
            </div>
            <pre className="text-[12px] font-mono text-(--color-ink-dim) p-5 pt-2 overflow-x-auto leading-relaxed whitespace-pre">{sample.code}</pre>
            {sample.note && (
              <div className="px-5 pb-4 -mt-1 text-[11px] text-(--color-ink-mute) italic">{sample.note}</div>
            )}
          </Card>

          <Card>
            <CardTitle>Environment</CardTitle>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
              <Row k="SOVERA_URL" v={FUNCTIONS_URL} />
              <Row k="SOVERA_KEY" v="(create on the API Keys page — sov_live_…)" />
              <Row k="SOVERA_TENANT" v="optional — defaults to the key's bound tenant" />
              <Row k="auth header" v="authorization: Bearer $SOVERA_KEY" />
            </div>
          </Card>

          <Card>
            <CardTitle>Endpoint catalog</CardTitle>
            <ul className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-[12px]">
              <EP m="POST" path="/api/sql" desc="Run SQL (RLS-enforced)" />
              <EP m="GET"  path="/api/tables" desc="List schemas, tables, columns" />
              <EP m="POST" path="/api/search" desc="Vector search (cosine, HNSW)" />
              <EP m="POST" path="/api/embed" desc="Store text embeddings" />
              <EP m="GET"  path="/api/embed/stats" desc="Vector store stats" />
              <EP m="POST" path="/api/realtime/publish" desc="Publish to Web PubSub" />
              <EP m="GET"  path="/api/realtime/{ch}" desc="Subscribe (SSE/WebSocket)" />
              <EP m="GET"  path="/api/blob/{c}" desc="List blobs in a container" />
              <EP m="GET"  path="/api/logs" desc="App Insights logs" />
              <EP m="GET"  path="/api/compliance" desc="HDS/GDPR posture" />
              <EP m="GET"  path="/api/tenants" desc="List tenants" />
              <EP m="GET/POST/DELETE" path="/api/keys" desc="Manage API keys" />
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-(--color-ink-mute)">{k}</div>
      <div className="text-(--color-ink) font-mono mt-0.5 break-all">{v}</div>
    </div>
  );
}

function EP({ m, path, desc }: { m: string; path: string; desc: string }) {
  return (
    <li className="flex items-center gap-2 border border-(--color-line) rounded px-2.5 py-1.5">
      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-(--color-cyan)/15 text-(--color-cyan) min-w-[60px] text-center">{m}</span>
      <code className="font-mono text-(--color-ink) text-[11px]">{path}</code>
      <span className="text-(--color-ink-mute) text-[11px] ml-auto truncate">{desc}</span>
    </li>
  );
}
