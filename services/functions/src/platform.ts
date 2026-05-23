// Surfaces deployment facts (region, resource group, function name, plan, db host).
// Read from env vars set on the container app — no Azure REST call needed.
import { app, HttpRequest, HttpResponseInit } from '@azure/functions';

export async function platform(_req: HttpRequest): Promise<HttpResponseInit> {
  const facts = {
    region: process.env.SOVERA_REGION ?? 'francecentral',
    resourceGroup: process.env.SOVERA_RG ?? 'sovera',
    subscription: process.env.SOVERA_SUB ?? '533005c0-8ef0-404d-985a-7ca64041253a',
    functionApp: process.env.WEBSITE_SITE_NAME ?? 'sovera-fn',
    pgHost: process.env.PG_HOST ?? 'unknown',
    pgDb: process.env.PG_DB ?? 'postgres',
    pgUser: process.env.PG_USER ?? 'unknown',
    lawWorkspace: process.env.LAW_WORKSPACE_ID ?? null,
    storageAccount: process.env.STORAGE_ACCOUNT ?? null,
    runtime: process.version,
    plan: process.env.FUNCTIONS_EXTENSION_VERSION ?? 'unknown',
    tenantId: process.env.AZURE_TENANT_ID ?? '533005c0-8ef0-404d-985a-7ca64041253a',
    now: new Date().toISOString(),
  };
  return { status: 200, jsonBody: facts };
}

app.http('platform', {
  route: 'platform',
  methods: ['GET'],
  authLevel: 'function',
  handler: platform,
});
