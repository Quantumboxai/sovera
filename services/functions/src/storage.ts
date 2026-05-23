import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';

/**
 * Issue a short-lived user-delegation SAS for a blob in the tenant's container.
 * The container name is `tenant-${tid}` and is created lazily.
 */
const account = process.env.STORAGE_ACCOUNT!;
const blobService = new BlobServiceClient(
  `https://${account}.blob.core.windows.net`,
  new DefaultAzureCredential(),
);

async function ensureContainer(name: string) {
  const c = blobService.getContainerClient(name);
  await c.createIfNotExists();
  return c;
}

export async function uploadUrl(req: HttpRequest): Promise<HttpResponseInit> {
  const tid = req.headers.get('x-tenant-id');
  const sub = req.headers.get('x-user-sub');
  if (!tid || !sub) return { status: 401, jsonBody: { error: 'Missing identity' } };

  const path = new URL(req.url).searchParams.get('path');
  if (!path || path.includes('..')) return { status: 400, jsonBody: { error: 'bad path' } };

  const container = await ensureContainer(`tenant-${tid}`);
  const blob = container.getBlobClient(path);

  const start = new Date(Date.now() - 60_000);
  const expiry = new Date(Date.now() + 10 * 60_000);

  const udk = await blobService.getUserDelegationKey(start, expiry);
  const { generateBlobSASQueryParameters, BlobSASPermissions } = await import('@azure/storage-blob');
  const sas = generateBlobSASQueryParameters(
    {
      containerName: container.containerName,
      blobName: path,
      permissions: BlobSASPermissions.parse('cw'),
      startsOn: start,
      expiresOn: expiry,
      protocol: 'https' as any,
    },
    udk,
    account,
  ).toString();

  return { status: 200, jsonBody: { url: `${blob.url}?${sas}`, expiresAt: expiry.getTime() } };
}

app.http('upload-url', {
  route: 'storage/upload-url',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: uploadUrl,
});
