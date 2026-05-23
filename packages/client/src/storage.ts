type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

export class Storage {
  constructor(private fetcher: Fetcher) {}

  from(bucket: string) {
    return new Bucket(this.fetcher, bucket);
  }
}

export class Bucket {
  constructor(private fetcher: Fetcher, private bucket: string) {}

  /** Get a short-lived SAS URL to upload a blob via PUT. */
  async uploadUrl(path: string): Promise<{ url: string; expiresAt: number }> {
    const full = `${this.bucket}/${path}`.replace(/^\/+/, '');
    const r = await this.fetcher(`/functions/v1/storage/upload-url?path=${encodeURIComponent(full)}`);
    if (!r.ok) throw new Error(`upload-url failed: ${r.status}`);
    return r.json();
  }

  /** Convenience: upload a Blob/File using the SAS URL. */
  async upload(path: string, body: Blob | ArrayBuffer | string, contentType?: string) {
    const { url } = await this.uploadUrl(path);
    const headers: Record<string, string> = { 'x-ms-blob-type': 'BlockBlob' };
    if (contentType) headers['Content-Type'] = contentType;
    const r = await fetch(url, { method: 'PUT', headers, body: body as BodyInit });
    if (!r.ok) throw new Error(`upload failed: ${r.status}`);
    return { path };
  }
}
