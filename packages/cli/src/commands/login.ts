import { log, banner } from '../util/log.js';
import { az, checkAzInstalled } from '../util/azure.js';

export async function loginCommand() {
  banner();
  log.brand('Authenticate to Azure');
  log.blank();

  if (!checkAzInstalled()) {
    log.err('Azure CLI not found. Install from https://aka.ms/azcli');
    process.exitCode = 1; return;
  }

  log.info('Opening browser to log in via `az login` …');
  const r = az<Array<{ id: string; name: string; tenantId: string; user: { name: string } }>>(['login']);
  if (!r.ok) { log.err(r.error); process.exitCode = 1; return; }
  const account = Array.isArray(r.data) && r.data[0];
  if (account) {
    log.ok(`Signed in as ${account.user.name}`);
    log.hint(`Subscription: ${account.name} (${account.id})`);
    log.hint(`Tenant: ${account.tenantId}`);
  } else {
    log.ok('Signed in.');
  }
  log.blank();
}
