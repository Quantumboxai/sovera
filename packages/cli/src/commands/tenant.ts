import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { log, banner } from '../util/log.js';

export async function tenantCreate(slug: string, opts: { tier?: string; rg?: string }) {
  banner();
  log.brand(`Onboard tenant: ${slug}`);
  log.blank();

  if (!/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(slug)) {
    log.err('Slug must be lowercase alphanumeric (hyphens allowed), 3-32 chars.');
    process.exitCode = 1; return;
  }

  const tier = opts.tier ?? 'starter';
  if (!['starter', 'pro', 'enterprise'].includes(tier)) {
    log.err(`Invalid tier "${tier}" — choose starter | pro | enterprise.`);
    process.exitCode = 1; return;
  }

  const script = path.resolve(process.cwd(), 'scripts/tenant-onboard.ps1');
  log.info(`Tier:           ${tier}`);
  log.info(`Resource group: ${opts.rg ?? '<from sovera.config.json>'}`);
  log.info(`Script:         ${path.relative(process.cwd(), script)}`);
  log.blank();
  log.step(1, 4, 'Discover existing RG resources (KV, APIM, WPS, Postgres)');
  log.step(2, 4, 'Deploy infra/modules/tenant.bicep with tenant.bicepparam');
  log.step(3, 4, 'Run services/db/tenant-bootstrap.sql against new database');
  log.step(4, 4, 'Store APIM subscription key + DB cred in Key Vault');
  log.blank();

  // Delegate to PowerShell — keeps a single source of truth.
  const res = spawnSync('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-Slug', slug, '-Tier', tier, ...(opts.rg ? ['-ResourceGroup', opts.rg] : []),
  ], { stdio: 'inherit', shell: false });

  if (res.status !== 0) {
    log.err('Onboarding failed. Re-run with VERBOSE=1 or fix above errors.');
    process.exitCode = res.status ?? 1;
    return;
  }
  log.ok(`Tenant ${slug} is live.`);
  log.hint(`Try: sovera status`);
}
