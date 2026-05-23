import { WebPubSubClient } from '@azure/web-pubsub-client';

export type ChangeEvent<T = any> = {
  type: 'insert' | 'update' | 'delete';
  table: string;
  tenant_id: string;
  row: T;
  ts: string;
};

export interface Channel {
  on<T = any>(event: 'insert' | 'update' | 'delete' | '*', handler: (e: ChangeEvent<T>) => void): Channel;
  subscribe(): Promise<Channel>;
  unsubscribe(): Promise<void>;
}

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

export class Realtime {
  private clientPromise?: Promise<WebPubSubClient>;

  constructor(private fetcher: Fetcher) {}

  private async getClient(): Promise<WebPubSubClient> {
    if (this.clientPromise) return this.clientPromise;
    this.clientPromise = (async () => {
      const r = await this.fetcher('/realtime/api/negotiate');
      if (!r.ok) throw new Error(`negotiate failed: ${r.status}`);
      const { url } = await r.json();
      const c = new WebPubSubClient({ getClientAccessUrl: async () => url });
      await c.start();
      return c;
    })();
    return this.clientPromise;
  }

  channel(name: string): Channel {
    const handlers = new Map<string, Array<(e: ChangeEvent) => void>>();
    let groupName: string | null = null;
    let group: any;
    const self = this;

    const ch: Channel = {
      on(event, handler) {
        const list = handlers.get(event) ?? [];
        list.push(handler as any);
        handlers.set(event, list);
        return ch;
      },

      async subscribe() {
        const c = await self.getClient();
        // group = `tenant.${tid}` is enforced by negotiate; we just join it.
        // We use `name` as a server-side filter (topic / table).
        groupName = name;
        c.on('group-message', (msg) => {
          const payload = msg.message.data as ChangeEvent;
          if (!payload || payload.table !== name) return;
          for (const h of handlers.get(payload.type) ?? []) h(payload);
          for (const h of handlers.get('*') ?? []) h(payload);
        });
        const tid = (await self.getTenantId(c));
        group = await c.joinGroup(`tenant.${tid}`);
        return ch;
      },

      async unsubscribe() {
        if (!group) return;
        await group.leave();
        group = null;
        groupName = null;
      },
    };
    return ch;
  }

  private async getTenantId(c: WebPubSubClient): Promise<string> {
    // The negotiate response embedded the user info via JWT; the client URL
    // contains the userId but not custom claims, so we ask the backend.
    const r = await this.fetcher('/realtime/api/me');
    if (!r.ok) throw new Error('cannot resolve tenant');
    const j = await r.json();
    return j.tenantId;
  }
}
