// Real Blob storage: list containers, list blobs, generate user-delegation SAS for upload/download.
// Uses Function App UAI via DefaultAzureCredential.
import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { DefaultAzureCredential } from '@azure/identity';
import {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  ContainerSASPermissions,
  generateAccountSASQueryParameters,
  SASProtocol,
} from '@azure/storage-blob';
import { guard, actorOf } from './auth.js';
import { audit } from './bootstrap.js';

const ACCOUNT = process.env.STORAGE_ACCOUNT!;
const URL = `https://${ACCOUNT}.blob.core.windows.net`;

const credential = new DefaultAzureCredential();
const blobSvc = new BlobServiceClient(URL, credential);

async function userDelegationKey() {
  const start = new Date(); start.setMinutes(start.getMinutes() - 5);
  const expiry = new Date(start.getTime() + 60 * 60 * 1000); // 1h
  return blobSvc.getUserDelegationKey(start, expiry);
}

async function listContainers(req: HttpRequest): Promise<HttpResponseInit> {
  const g = await guard(req, 'blob:read'); if (!g.ok) return g.response;
  const out: Array<{ name: string; lastModified?: string; publicAccess?: string }> = [];
  for await (const c of blobSvc.listContainers({ includeMetadata: false })) {
    out.push({ name: c.name, lastModified: c.properties.lastModified?.toISOString(), publicAccess: c.properties.publicAccess ?? 'none' });
  }
  return { status: 200, jsonBody: { account: ACCOUNT, containers: out } };
}

async function createContainer(req: HttpRequest): Promise<HttpResponseInit> {
  const g = await guard(req, 'blob:write'); if (!g.ok) return g.response;
  const principal = g.principal;
  let body: { name?: string };
  try { body = (await req.json()) as { name?: string }; } catch { return { status: 400, jsonBody: { error: 'invalid_json' } }; }
  const name = (body.name ?? '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(name)) return { status: 400, jsonBody: { error: 'invalid_name', detail: '3-63 chars, lowercase letters/digits/hyphens' } };
  const c = blobSvc.getContainerClient(name);
  const r = await c.createIfNotExists();
  const actor = actorOf(principal);
  await audit(actor, 'storage.container.create', name, true);
  return { status: 201, jsonBody: { ok: true, name, created: r.succeeded } };
}

async function listBlobs(req: HttpRequest): Promise<HttpResponseInit> {
  const g = await guard(req, 'blob:read'); if (!g.ok) return g.response;
  const container = req.params.container;
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(container ?? '')) return { status: 400, jsonBody: { error: 'invalid_container' } };
  const prefix = req.query.get('prefix') ?? undefined;
  const c = blobSvc.getContainerClient(container);
  const blobs: Array<{ name: string; size: number; lastModified?: string; contentType?: string }> = [];
  for await (const b of c.listBlobsFlat({ prefix })) {
    blobs.push({
      name: b.name,
      size: b.properties.contentLength ?? 0,
      lastModified: b.properties.lastModified?.toISOString(),
      contentType: b.properties.contentType,
    });
    if (blobs.length >= 500) break;
  }
  return { status: 200, jsonBody: { container, count: blobs.length, blobs } };
}

async function sasForUpload(req: HttpRequest): Promise<HttpResponseInit> {
  const g = await guard(req, 'blob:write'); if (!g.ok) return g.response;
  const principal = g.principal;
  const container = req.params.container;
  const name = req.query.get('name');
  if (!container || !name) return { status: 400, jsonBody: { error: 'container_and_name_required' } };
  // Azure blob name rules: 1–1024 chars, any UTF-8 except backslash and control chars.
  if (name.length < 1 || name.length > 1024 || /[\x00-\x1f\x7f\\]/.test(name)) {
    return { status: 400, jsonBody: { error: 'invalid_blob_name', detail: '1–1024 chars, no control chars or backslash', name } };
  }

  const key = await userDelegationKey();
  const expiresOn = new Date(Date.now() + 15 * 60 * 1000); // 15 min
  const sas = generateBlobSASQueryParameters({
    containerName: container,
    blobName: name,
    permissions: BlobSASPermissions.parse('cw'), // create + write
    startsOn: new Date(Date.now() - 60_000),
    expiresOn,
    protocol: SASProtocol.Https,
  }, key, ACCOUNT).toString();

  const url = `${URL}/${container}/${encodeURIComponent(name).replace(/%2F/g, '/')}?${sas}`;
  const actor = actorOf(principal);
  await audit(actor, 'storage.sas.upload', `${container}/${name}`, true);
  return { status: 200, jsonBody: { ok: true, url, expiresOn: expiresOn.toISOString() } };
}

async function sasForDownload(req: HttpRequest): Promise<HttpResponseInit> {
  const g = await guard(req, 'blob:read'); if (!g.ok) return g.response;
  const container = req.params.container;
  const name = req.query.get('name');
  if (!container || !name) return { status: 400, jsonBody: { error: 'container_and_name_required' } };

  const key = await userDelegationKey();
  const expiresOn = new Date(Date.now() + 10 * 60 * 1000); // 10 min
  const sas = generateBlobSASQueryParameters({
    containerName: container,
    blobName: name,
    permissions: BlobSASPermissions.parse('r'),
    startsOn: new Date(Date.now() - 60_000),
    expiresOn,
    protocol: SASProtocol.Https,
  }, key, ACCOUNT).toString();

  const url = `${URL}/${container}/${encodeURIComponent(name).replace(/%2F/g, '/')}?${sas}`;
  return { status: 200, jsonBody: { ok: true, url, expiresOn: expiresOn.toISOString() } };
}

async function deleteBlob(req: HttpRequest): Promise<HttpResponseInit> {
  const g = await guard(req, 'blob:write'); if (!g.ok) return g.response;
  const principal = g.principal;
  const container = req.params.container;
  const name = req.query.get('name');
  if (!container || !name) return { status: 400, jsonBody: { error: 'container_and_name_required' } };
  const r = await blobSvc.getContainerClient(container).deleteBlob(name);
  const actor = actorOf(principal);
  await audit(actor, 'storage.blob.delete', `${container}/${name}`, true);
  return { status: 200, jsonBody: { ok: true, requestId: r.requestId } };
}

app.http('blob-containers-list',   { route: 'blob/containers',                 methods: ['GET'],    authLevel: 'function', handler: listContainers });
app.http('blob-containers-create', { route: 'blob/containers',                 methods: ['POST'],   authLevel: 'function', handler: createContainer });
app.http('blob-list',              { route: 'blob/{container}',                methods: ['GET'],    authLevel: 'function', handler: listBlobs });
app.http('blob-sas-upload',        { route: 'blob/{container}/sas/upload',     methods: ['GET'],    authLevel: 'function', handler: sasForUpload });
app.http('blob-sas-download',      { route: 'blob/{container}/sas/download',   methods: ['GET'],    authLevel: 'function', handler: sasForDownload });
app.http('blob-delete',            { route: 'blob/{container}',                methods: ['DELETE'], authLevel: 'function', handler: deleteBlob });
