'use client';

import { useEffect, useRef, useState } from 'react';
import { H1, Card, CardTitle, Badge, Button } from '@/components/ui';
import { ComplianceBadge } from '@/components/compliance-badge';
import { HardDrive, Lock, Plus, Upload, Trash2, RefreshCw, AlertTriangle, FileIcon, ArrowLeft, Download } from 'lucide-react';

type Container = { name: string; lastModified?: string; publicAccess?: string };
type Blob = { name: string; size: number; lastModified?: string; contentType?: string };

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB','MB','GB','TB'];
  let v = n / 1024; let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export default function StoragePage() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [opened, setOpened] = useState<string | null>(null);
  const [blobs, setBlobs] = useState<Blob[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  async function loadContainers() {
    setLoading(true); setErr(null);
    try {
      const r = await fetch('/api/blob/containers', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setContainers(j.containers ?? []);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }

  async function loadBlobs(container: string) {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`/api/blob/${encodeURIComponent(container)}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setBlobs(j.blobs ?? []);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadContainers(); }, []);
  useEffect(() => { if (opened) loadBlobs(opened); else setBlobs([]); }, [opened]);

  async function createContainer() {
    try {
      const r = await fetch('/api/blob/containers', { method: 'POST', body: JSON.stringify({ name: newName }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setShowNew(false); setNewName(''); loadContainers();
    } catch (e) { setErr((e as Error).message); }
  }

  async function upload(file: File) {
    if (!opened) return;
    setUploading(true); setErr(null);
    try {
      const sasRes = await fetch(`/api/blob/${encodeURIComponent(opened)}/sas/upload?name=${encodeURIComponent(file.name)}`);
      const sas = await sasRes.json();
      if (!sasRes.ok) throw new Error(sas.detail ? `${sas.error}: ${sas.detail}` : (sas.error ?? 'sas_failed'));
      const up = await fetch(sas.url, { method: 'PUT', headers: { 'x-ms-blob-type': 'BlockBlob', 'content-type': file.type || 'application/octet-stream' }, body: file });
      if (!up.ok) {
        const txt = await up.text().catch(() => '');
        const code = (txt.match(/<Code>([^<]+)<\/Code>/)?.[1]) ?? `HTTP ${up.status}`;
        throw new Error(`upload failed: ${code}`);
      }
      loadBlobs(opened);
    } catch (e) { setErr((e as Error).message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function download(blob: Blob) {
    if (!opened) return;
    const r = await fetch(`/api/blob/${encodeURIComponent(opened)}/sas/download?name=${encodeURIComponent(blob.name)}`);
    const j = await r.json();
    if (j.url) window.open(j.url, '_blank');
  }

  async function remove(blob: Blob) {
    if (!opened) return;
    if (!confirm(`Delete ${blob.name}?`)) return;
    await fetch(`/api/blob/${encodeURIComponent(opened)}?name=${encodeURIComponent(blob.name)}`, { method: 'DELETE' });
    loadBlobs(opened);
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-(--color-ink-mute) mb-2">
          <span>Project</span><span>/</span>
          <button onClick={() => setOpened(null)} className="hover:text-(--color-ink)">Storage</button>
          {opened && <><span>/</span><span className="text-(--color-ink-dim)">{opened}</span></>}
          <ComplianceBadge code="HDS §5.3.2" label="ZRS · CMK · AES-256" />
          <span className="ml-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-(--color-good)/20 text-(--color-good)">
            <span className="h-1.5 w-1.5 rounded-full bg-(--color-good)" /> live
          </span>
        </div>
        <H1>{opened ? `Blobs in ${opened}` : 'Storage'}</H1>
        <p className="text-[13px] text-(--color-ink-mute) mt-1">
          {opened
            ? 'User-delegation SAS tokens are issued per-request, scoped to this blob and expiring in 10-15 minutes.'
            : 'Blob containers in your Azure Storage account. Upload and download go direct via short-lived SAS URLs.'}
        </p>
      </div>

      {err && <Card className="border-(--color-bad)/40"><div className="flex items-center gap-2 text-[12px] text-(--color-bad)"><AlertTriangle className="h-3.5 w-3.5" /> {err}</div></Card>}

      {!opened && (
        <>
          <div className="flex items-center gap-3">
            <Button onClick={() => setShowNew(!showNew)} variant="brand"><Plus className="h-3.5 w-3.5" /> New container</Button>
            <Button variant="ghost" onClick={loadContainers}><RefreshCw className="h-3.5 w-3.5" /></Button>
          </div>

          {showNew && (
            <Card>
              <CardTitle>Create container</CardTitle>
              <div className="mt-3 flex gap-2">
                <input value={newName} onChange={e => setNewName(e.target.value.toLowerCase())} placeholder="patient-uploads"
                  className="flex-1 bg-black/30 border border-(--color-line) rounded-md px-3 py-2 text-[13px] text-(--color-ink) font-mono outline-none focus:border-(--color-cyan)" />
                <Button variant="brand" onClick={createContainer} disabled={!newName}>Create</Button>
              </div>
              <div className="mt-2 text-[11px] text-(--color-ink-mute)">3-63 chars · lowercase letters, digits, hyphens</div>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {containers.length === 0 && !loading && <Card className="md:col-span-2 lg:col-span-3"><div className="text-center text-[13px] text-(--color-ink-mute) py-8">No containers yet — create one above.</div></Card>}
            {containers.map(c => (
              <Card key={c.name} className="lift cursor-pointer hover:border-(--color-line-2)" onClick={() => setOpened(c.name)}>
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-(--color-violet)/30 to-(--color-cyan)/20 grid place-items-center">
                    <HardDrive className="h-4 w-4 text-(--color-cyan)" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-(--color-ink) font-medium truncate">{c.name}</div>
                    <div className="mt-1 text-[11px] text-(--color-ink-mute) font-mono">{c.lastModified ? new Date(c.lastModified).toLocaleDateString() : '—'}</div>
                  </div>
                  <Badge tone={c.publicAccess === 'none' ? 'good' : 'warn'}><Lock className="h-3 w-3 inline" /> {c.publicAccess ?? 'none'}</Badge>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {opened && (
        <>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => setOpened(null)}><ArrowLeft className="h-3.5 w-3.5" /> Containers</Button>
            <input ref={fileRef} type="file" onChange={e => e.target.files?.[0] && upload(e.target.files[0])} className="hidden" />
            <Button variant="brand" onClick={() => fileRef.current?.click()} disabled={uploading}><Upload className="h-3.5 w-3.5" /> {uploading ? 'Uploading…' : 'Upload file'}</Button>
            <Button variant="ghost" onClick={() => loadBlobs(opened)}><RefreshCw className="h-3.5 w-3.5" /></Button>
          </div>

          <Card className="!p-0">
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <CardTitle>{blobs.length} blob{blobs.length === 1 ? '' : 's'}</CardTitle>
            </div>
            {blobs.length === 0 && !loading ? (
              <div className="px-5 py-8 text-center text-[13px] text-(--color-ink-mute)">Empty container. Upload a file to get started.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-(--color-ink-mute) border-y border-(--color-line)">
                      <th className="text-left px-5 py-2 font-normal">Name</th>
                      <th className="text-left px-5 py-2 font-normal">Size</th>
                      <th className="text-left px-5 py-2 font-normal">Type</th>
                      <th className="text-left px-5 py-2 font-normal">Modified</th>
                      <th className="px-5 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--color-line)">
                    {blobs.map(b => (
                      <tr key={b.name} className="hover:bg-white/[0.02]">
                        <td className="px-5 py-2.5 text-(--color-ink) flex items-center gap-2"><FileIcon className="h-3.5 w-3.5 text-(--color-ink-mute)" />{b.name}</td>
                        <td className="px-5 py-2.5 font-mono text-[12px] text-(--color-ink-mute)">{fmtBytes(b.size)}</td>
                        <td className="px-5 py-2.5 font-mono text-[11px] text-(--color-ink-mute)">{b.contentType ?? '—'}</td>
                        <td className="px-5 py-2.5 font-mono text-[11px] text-(--color-ink-mute)">{b.lastModified ? new Date(b.lastModified).toLocaleString() : '—'}</td>
                        <td className="px-5 py-2.5 text-right flex items-center justify-end gap-2">
                          <button onClick={() => download(b)} className="text-(--color-ink-mute) hover:text-(--color-cyan)"><Download className="h-3.5 w-3.5" /></button>
                          <button onClick={() => remove(b)} className="text-(--color-ink-mute) hover:text-(--color-bad)"><Trash2 className="h-3.5 w-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
