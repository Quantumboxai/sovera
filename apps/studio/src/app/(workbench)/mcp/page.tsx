'use client';

import { useEffect, useState } from 'react';
import { H1, Card, CardTitle, Badge, Button } from '@/components/ui';
import { Plug, Copy, CheckCircle2, ExternalLink, Bot, Shield, Zap } from 'lucide-react';

type Editor = 'claude' | 'cursor' | 'vscode' | 'continue' | 'windsurf' | 'cline';

const FUNCTIONS_URL = process.env.NEXT_PUBLIC_FUNCTIONS_URL ?? 'https://sovera-fn-h2ssji7afhlr2.azurewebsites.net';

const TOOLS = [
  { name: 'sovera_sql',                 desc: 'Run SQL (read-only by default).' },
  { name: 'sovera_tables_list',         desc: 'Inspect tables, columns, row counts.' },
  { name: 'sovera_tenants_list',        desc: 'List tenants in the project.' },
  { name: 'sovera_vector_search',       desc: 'Semantic search over embeddings (RAG-ready).' },
  { name: 'sovera_vector_embed',        desc: 'Index text chunks for later retrieval.' },
  { name: 'sovera_realtime_publish',    desc: 'Publish to a Web PubSub channel.' },
  { name: 'sovera_blob_list',           desc: 'List blobs in a storage container.' },
  { name: 'sovera_logs',                desc: 'Tail recent Functions logs from App Insights.' },
  { name: 'sovera_compliance_status',   desc: 'HDS/GDPR posture, encryption, RBAC summary.' },
];

const EDITORS: { id: Editor; label: string; config: string; path: string }[] = [
  {
    id: 'claude', label: 'Claude Desktop',
    path: '~/Library/Application Support/Claude/claude_desktop_config.json (macOS) · %APPDATA%\\Claude\\claude_desktop_config.json (Windows)',
    config: '',
  },
  { id: 'cursor',   label: 'Cursor',         path: '~/.cursor/mcp.json', config: '' },
  { id: 'vscode',   label: 'VS Code',        path: '.vscode/mcp.json (per-workspace) or User Settings → "MCP: Add Server"', config: '' },
  { id: 'continue', label: 'Continue.dev',   path: '~/.continue/config.json — add to mcpServers section', config: '' },
  { id: 'windsurf', label: 'Windsurf',       path: '~/.codeium/windsurf/mcp_config.json', config: '' },
  { id: 'cline',    label: 'Cline (VS Code)', path: 'VS Code Settings → Cline → MCP Servers', config: '' },
];

function buildConfig(editor: Editor, url: string, key: string, tenant: string, readOnly: boolean): string {
  const env: Record<string, string> = { SOVERA_URL: url, SOVERA_KEY: key };
  if (tenant) env.SOVERA_TENANT = tenant;
  if (readOnly) env.SOVERA_READ_ONLY = '1';
  const sovera = { command: 'npx', args: ['-y', '@sovera/mcp'], env };
  if (editor === 'vscode') {
    return JSON.stringify({ servers: { sovera: { type: 'stdio', ...sovera } } }, null, 2);
  }
  return JSON.stringify({ mcpServers: { sovera } }, null, 2);
}

export default function McpPage() {
  const [editor, setEditor] = useState<Editor>('claude');
  const [copied, setCopied] = useState<string | null>(null);
  const [keys, setKeys] = useState<Array<{ id: string; name: string; prefix: string; tenant: string | null; scopes: string[] }>>([]);
  const [keyId, setKeyId] = useState('');
  const [tenant, setTenant] = useState('');
  const [readOnly, setReadOnly] = useState(true);

  useEffect(() => {
    fetch('/api/keys', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { keys: [] })
      .then(j => setKeys(Array.isArray(j) ? j : (j.keys ?? [])))
      .catch(() => {});
  }, []);

  const selectedKey = keys.find(k => k.id === keyId);
  const keyPlaceholder = selectedKey ? `${selectedKey.prefix}…` : 'sov_live_xxxxxxxxxxxxxxxxxxxx';
  const effectiveTenant = tenant || (selectedKey?.tenant ?? '');
  const config = buildConfig(editor, FUNCTIONS_URL, keyPlaceholder, effectiveTenant, readOnly);
  const npxCmd = `SOVERA_URL=${FUNCTIONS_URL} SOVERA_KEY=${keyPlaceholder}${effectiveTenant ? ` SOVERA_TENANT=${effectiveTenant}` : ''}${readOnly ? ' SOVERA_READ_ONLY=1' : ''} npx -y @sovera/mcp`;

  const copy = (text: string, k: string) => {
    navigator.clipboard.writeText(text);
    setCopied(k);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-(--color-ink-mute) mb-2">
          <span>Developer</span><span>/</span><span className="text-(--color-ink-dim)">MCP Server</span>
          <span className="ml-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-(--color-violet)/20 text-(--color-violet)">
            <Bot className="h-2.5 w-2.5" /> agent-ready
          </span>
        </div>
        <H1>Model Context Protocol</H1>
        <p className="text-[13px] text-(--color-ink-mute) mt-1 max-w-3xl">
          Connect Claude, Cursor, VS Code Copilot, Lovable, Windsurf, Continue.dev, or any MCP-capable agent directly to this Sovera project. The agent gets typed tools for SQL, vector search, realtime, blob, and logs — your API key, RBAC, RLS, and tenant isolation are enforced server-side.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardTitle>Tools exposed</CardTitle><div className="mt-2 text-2xl font-semibold text-(--color-cyan)">{TOOLS.length}</div><div className="mt-1 text-[11px] text-(--color-ink-mute)">read-mostly · safe defaults</div></Card>
        <Card><CardTitle>Transport</CardTitle><div className="mt-2 text-[13px] font-mono text-(--color-good)">stdio</div><div className="mt-1 text-[11px] text-(--color-ink-mute)">runs locally · zero exfil</div></Card>
        <Card><CardTitle>Auth</CardTitle><div className="mt-2 text-[13px] font-mono text-(--color-ink)">Bearer sov_live_</div><div className="mt-1 text-[11px] text-(--color-ink-mute)">tenant-locked server-side</div></Card>
        <Card><CardTitle>Spec version</CardTitle><div className="mt-2 text-[13px] font-mono text-(--color-violet)">MCP 2025-06-18</div><div className="mt-1 text-[11px] text-(--color-ink-mute)">@modelcontextprotocol/sdk 1.x</div></Card>
      </div>

      <Card>
        <CardTitle className="flex items-center gap-2"><Plug className="h-3.5 w-3.5" /> 1. Configure</CardTitle>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-(--color-ink-mute)">API key</label>
            <select value={keyId} onChange={e => setKeyId(e.target.value)} className="mt-1 w-full bg-black/30 border border-(--color-line) rounded-md px-3 py-2 text-[12px] font-mono text-(--color-ink) outline-none focus:border-(--color-cyan)">
              <option value="">— pick a key (or paste one) —</option>
              {keys.map(k => <option key={k.id} value={k.id}>{k.name} · {k.prefix}…{k.tenant ? ` · ${k.tenant}` : ''}</option>)}
            </select>
            <p className="mt-1 text-[10px] text-(--color-ink-mute)">Server-side keys live in <code className="font-mono">app.api_keys</code> (SHA-256 hashed). Create one on the API Keys page.</p>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-(--color-ink-mute)">Tenant (optional)</label>
            <input value={tenant} onChange={e => setTenant(e.target.value)} placeholder={selectedKey?.tenant ?? 'acme'} className="mt-1 w-full bg-black/30 border border-(--color-line) rounded-md px-3 py-2 text-[12px] font-mono text-(--color-ink) outline-none focus:border-(--color-cyan)" />
            <p className="mt-1 text-[10px] text-(--color-ink-mute)">Falls back to the key&apos;s tenant binding. Ignored when the key is already tenant-locked.</p>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-(--color-ink-mute)">Safety</label>
            <label className="mt-2 flex items-center gap-2 text-[12px] text-(--color-ink) cursor-pointer">
              <input type="checkbox" checked={readOnly} onChange={e => setReadOnly(e.target.checked)} className="accent-(--color-cyan)" />
              <span>Read-only mode (recommended)</span>
            </label>
            <p className="mt-1 text-[10px] text-(--color-ink-mute)">Rejects INSERT/UPDATE/DELETE/DDL · disables <code className="font-mono">embed</code> and <code className="font-mono">publish</code> tools.</p>
          </div>
        </div>
      </Card>

      <Card className="!p-0">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between flex-wrap gap-3">
          <CardTitle><Zap className="h-3.5 w-3.5 inline-block mr-1" /> 2. Drop into your editor</CardTitle>
          <div className="flex flex-wrap gap-1">
            {EDITORS.map(e => (
              <button key={e.id} onClick={() => setEditor(e.id)}
                className={'px-2.5 py-1 text-[11px] rounded-md ' + (editor === e.id ? 'bg-white/[0.05] text-(--color-ink) ring-1 ring-(--color-line-2)' : 'text-(--color-ink-mute) hover:text-(--color-ink)')}>
                {e.label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-5 pb-2 text-[11px] text-(--color-ink-mute)">
          Add to: <code className="font-mono text-(--color-ink-dim)">{EDITORS.find(e => e.id === editor)?.path}</code>
        </div>
        <div className="px-5 pb-5">
          <div className="relative">
            <pre className="text-[12px] font-mono text-(--color-ink-dim) bg-black/40 border border-(--color-line) rounded-md p-4 overflow-x-auto leading-relaxed whitespace-pre">{config}</pre>
            <Button variant="ghost" onClick={() => copy(config, 'cfg')} className="!absolute !top-2 !right-2">
              {copied === 'cfg' ? <><CheckCircle2 className="h-3.5 w-3.5 text-(--color-good)" /> copied</> : <><Copy className="h-3.5 w-3.5" /> copy</>}
            </Button>
          </div>
          <div className="mt-3 text-[11px] text-(--color-ink-mute)">Restart the editor. Ask the agent: <em className="text-(--color-ink-dim)">&ldquo;list my Sovera tables&rdquo;</em> or <em className="text-(--color-ink-dim)">&ldquo;semantic-search my docs for &lsquo;onboarding&rsquo;&rdquo;</em>.</div>
        </div>
      </Card>

      <Card>
        <CardTitle>Or run it standalone</CardTitle>
        <div className="mt-3 flex items-center gap-2">
          <code className="flex-1 font-mono text-[12px] text-(--color-ink) bg-black/30 border border-(--color-line) rounded-md px-3 py-2 overflow-x-auto whitespace-nowrap">{npxCmd}</code>
          <Button variant="ghost" onClick={() => copy(npxCmd, 'npx')}>{copied === 'npx' ? <CheckCircle2 className="h-3.5 w-3.5 text-(--color-good)" /> : <Copy className="h-3.5 w-3.5" />}</Button>
        </div>
        <p className="mt-2 text-[11px] text-(--color-ink-mute)">Speaks MCP over stdio · pipe it into any host that follows the spec.</p>
      </Card>

      <Card className="!p-0">
        <div className="px-5 pt-4 pb-2"><CardTitle>3. Tools the agent will see</CardTitle></div>
        <div className="divide-y divide-(--color-line)">
          {TOOLS.map(t => (
            <div key={t.name} className="px-5 py-2.5 flex items-center gap-3 text-[12px]">
              <Plug className="h-3 w-3 text-(--color-violet)" />
              <code className="font-mono text-(--color-ink) min-w-[200px]">{t.name}</code>
              <span className="text-(--color-ink-mute) flex-1">{t.desc}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle className="flex items-center gap-2"><Shield className="h-3.5 w-3.5 text-(--color-good)" /> Safety model</CardTitle>
        <ul className="mt-2 space-y-1.5 text-[12px] text-(--color-ink-dim) list-disc list-inside">
          <li>The MCP process runs <strong>on the operator&apos;s machine</strong> — no Sovera data ever leaves your subscription.</li>
          <li>API keys are <strong>tenant-locked server-side</strong>: even if the agent passes a different tenant, the Functions backend ignores it.</li>
          <li><code className="font-mono">SOVERA_READ_ONLY=1</code> rejects writes both at the SQL parser layer (regex on statement prefix) and at the tool layer (embed/publish disabled).</li>
          <li>Every tool call lands in <code className="font-mono">app.audit_log</code> with <code className="font-mono">actor=key:&lt;prefix&gt;</code>.</li>
          <li>Scope grants from the API Keys page still apply — an agent with a <Badge tone="cyan">embed:read</Badge> key cannot store new vectors regardless of read-only mode.</li>
        </ul>
        <div className="mt-3 flex items-center gap-3 text-[11px]">
          <a href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer" className="text-(--color-cyan) hover:underline inline-flex items-center gap-1">MCP spec <ExternalLink className="h-3 w-3" /></a>
          <a href="https://github.com/DavidMalickDieng-wq/sovera/tree/main/packages/mcp-server" target="_blank" rel="noreferrer" className="text-(--color-cyan) hover:underline inline-flex items-center gap-1">source on github <ExternalLink className="h-3 w-3" /></a>
        </div>
      </Card>
    </div>
  );
}
