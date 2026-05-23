// Module-level imports register HTTP triggers via @azure/functions `app.http(...)`.
// negotiate/storage modules need extra env vars and are loaded conditionally.
import './tables.js';
import './tenants.js';
import './logs.js';
import './sql.js';
import './seed-demo.js';
import './platform.js';
import './keys.js';
import './rbac.js';
import './compliance.js';
import './realtime.js';
import './rt-ops.js';
import './scopes.js';
import './fn-metrics.js';

if (process.env.WPS_ENDPOINT) {
  await import('./negotiate.js');
}
if (process.env.STORAGE_ACCOUNT) {
  await import('./storage.js');
  await import('./blob.js');
}
if (process.env.AOAI_ENDPOINT) {
  await import('./embed.js');
  await import('./embed-metrics.js');
}
