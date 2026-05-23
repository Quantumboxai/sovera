import {
  PublicClientApplication,
  type Configuration,
  type AccountInfo,
} from '@azure/msal-browser';
import { Auth } from './auth.js';
import { QueryBuilder } from './query.js';
import { Storage } from './storage.js';
import { Realtime, type Channel } from './realtime.js';
import { Functions } from './functions.js';

export interface SoveraOptions {
  /** APIM gateway URL, e.g. https://api.sovera.fr */
  apimUrl: string;
  /** OIDC authority, e.g. https://<tenant>.ciamlogin.com/<tid>/v2.0 */
  authority: string;
  /** SPA client ID (sovera-studio or sovera-sample). */
  clientId: string;
  /** Scopes to request. Defaults to ['api://sovera/access_as_user']. */
  scopes?: string[];
  /** Reply URL. Defaults to window.location.origin. */
  redirectUri?: string;
}

export interface SoveraClient {
  auth: Auth;
  from: <T = any>(entity: string) => QueryBuilder<T>;
  storage: Storage;
  channel: (name: string) => Channel;
  functions: Functions;
  /** Raw fetch with bearer token attached. */
  rawFetch: (path: string, init?: RequestInit) => Promise<Response>;
}

export function createClient(opts: SoveraOptions): SoveraClient {
  const scopes = opts.scopes ?? ['api://sovera/access_as_user'];
  const redirectUri = opts.redirectUri ?? (typeof window !== 'undefined' ? window.location.origin : '');

  const msalConfig: Configuration = {
    auth: {
      clientId: opts.clientId,
      authority: opts.authority,
      redirectUri,
      knownAuthorities: [new URL(opts.authority).host],
    },
    cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false },
  };

  const msal = new PublicClientApplication(msalConfig);
  const initPromise = msal.initialize();

  const getToken = async (): Promise<string> => {
    await initPromise;
    let account: AccountInfo | undefined = msal.getActiveAccount() ?? msal.getAllAccounts()[0];
    if (!account) throw new Error('Not signed in');
    try {
      const r = await msal.acquireTokenSilent({ account, scopes });
      return r.accessToken;
    } catch {
      const r = await msal.acquireTokenPopup({ scopes });
      return r.accessToken;
    }
  };

  const apim = opts.apimUrl.replace(/\/+$/, '');

  const rawFetch = async (path: string, init: RequestInit = {}) => {
    const token = await getToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
    return fetch(`${apim}${path}`, { ...init, headers });
  };

  const auth = new Auth(msal, initPromise, scopes);
  const storage = new Storage(rawFetch);
  const functions = new Functions(rawFetch);
  const realtime = new Realtime(rawFetch);

  return {
    auth,
    from: <T,>(entity: string) => new QueryBuilder<T>(rawFetch, entity),
    storage,
    channel: (name: string) => realtime.channel(name),
    functions,
    rawFetch,
  };
}
