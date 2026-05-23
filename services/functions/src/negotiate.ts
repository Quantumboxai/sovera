import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { WebPubSubServiceClient, AzureKeyCredential } from '@azure/web-pubsub';
import { DefaultAzureCredential } from '@azure/identity';

/**
 * Negotiate a Web PubSub client URL for the calling user.
 *
 * APIM has already validated the JWT and stamped X-User-Sub + X-Tenant-Id.
 * We bind the WebSocket to a per-tenant group so a client can only see
 * realtime events for their own tenant.
 */
const endpoint = process.env.WPS_ENDPOINT!;   // e.g. https://sovera-wps-xxx.webpubsub.azure.com
const hub = process.env.WPS_HUB ?? 'realtime';

const client = new WebPubSubServiceClient(endpoint, new DefaultAzureCredential(), hub);

export async function negotiate(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const sub = req.headers.get('x-user-sub');
  const tid = req.headers.get('x-tenant-id');

  if (!sub || !tid) {
    return { status: 401, jsonBody: { error: 'Missing identity headers' } };
  }

  const token = await client.getClientAccessToken({
    userId: sub,
    roles: [
      `webpubsub.joinLeaveGroup.tenant.${tid}`,
      `webpubsub.sendToGroup.tenant.${tid}`,
    ],
    groups: [`tenant.${tid}`],
    expirationTimeInMinutes: 60,
  });

  return {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
    jsonBody: { url: token.url, expiresAt: Date.now() + 60 * 60 * 1000 },
  };
}

app.http('negotiate', {
  route: 'negotiate',
  methods: ['GET'],
  authLevel: 'anonymous', // APIM is the gate
  handler: negotiate,
});
