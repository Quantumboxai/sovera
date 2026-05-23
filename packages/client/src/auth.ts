import type { PublicClientApplication } from '@azure/msal-browser';

export class Auth {
  constructor(
    private msal: PublicClientApplication,
    private ready: Promise<void>,
    private scopes: string[],
  ) {}

  async signIn() {
    await this.ready;
    const r = await this.msal.loginPopup({ scopes: this.scopes });
    this.msal.setActiveAccount(r.account);
    return r.account;
  }

  async signOut() {
    await this.ready;
    const account = this.msal.getActiveAccount() ?? undefined;
    await this.msal.logoutPopup({ account });
  }

  async getUser() {
    await this.ready;
    return this.msal.getActiveAccount() ?? this.msal.getAllAccounts()[0] ?? null;
  }

  /** Subscribe to sign-in/out events. */
  onAuthStateChange(cb: (event: 'SIGNED_IN' | 'SIGNED_OUT', user: unknown) => void) {
    const id = this.msal.addEventCallback((e) => {
      if (e.eventType === 'msal:loginSuccess') cb('SIGNED_IN', e.payload);
      if (e.eventType === 'msal:logoutSuccess') cb('SIGNED_OUT', null);
    });
    return () => { if (id) this.msal.removeEventCallback(id); };
  }
}
