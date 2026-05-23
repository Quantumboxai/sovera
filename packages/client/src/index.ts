/**
 * @sovera/client — Supabase-flavored SDK for the all-Azure Sovera BaaS.
 *
 *   const dl = createClient({ apimUrl, authority, clientId, scopes });
 *   await dl.auth.signIn();
 *   const { data, error } = await dl.from('patients').select().eq('clinic_id', id);
 *   dl.channel('patients').on('insert', (e) => ...).subscribe();
 *   const { url } = await dl.storage.from('reports').uploadUrl('a.pdf');
 */
export { createClient } from './client.js';
export type { SoveraClient, SoveraOptions } from './client.js';
export type { Query, QueryResult } from './query.js';
export type { Channel, ChangeEvent } from './realtime.js';
