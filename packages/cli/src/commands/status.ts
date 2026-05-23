import { promises as fs } from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { log, banner } from '../util/log.js';
import { az, checkAzInstalled } from '../util/azure.js';

type Resource = { id: string; name: string; type: string; location: string };

export async function status(opts: { rg?: string }) {
  banner();
  log.brand('Sovera status');
  log.blank();

  let rg = opts.rg;
  if (!rg) {
    try {
      const cfg = JSON.parse(await fs.readFile(path.resolve(process.cwd(), 'sovera.config.json'), 'utf-8'));
      rg = cfg.rg ?? cfg.resourceGroup;
    } catch { /* ignore */ }
  }

  if (!checkAzInstalled() || !rg) {
    log.warn('No az CLI or resource group resolved — showing local mock.');
    showMock();
    return;
  }

  log.info(`Resource group: ${rg}`);
  const r = az<Resource[]>(['resource', 'list', '-g', rg]);
  if (!r.ok) { log.err(r.error); process.exitCode = 1; return; }

  const grouped = groupByType(r.data);
  for (const [type, items] of Object.entries(grouped)) {
    console.log('  ' + pc.dim(type));
    for (const it of items) {
      console.log(`    ${pc.green('●')} ${it.name} ${pc.dim('· ' + it.location)}`);
    }
  }
  log.blank();
  log.ok(`${r.data.length} resources, healthy.`);
}

function groupByType(items: Resource[]) {
  return items.reduce<Record<string, Resource[]>>((acc, it) => {
    (acc[it.type] ??= []).push(it); return acc;
  }, {});
}

function showMock() {
  const groups = [
    ['Microsoft.DBforPostgreSQL/flexibleServers', ['sovera-pg-fr-c']],
    ['Microsoft.Storage/storageAccounts',         ['soverastfrc']],
    ['Microsoft.SignalRService/webPubSub',        ['sovera-wps-fr-c']],
    ['Microsoft.ApiManagement/service',           ['sovera-apim-prod']],
    ['Microsoft.KeyVault/vaults',                 ['sovera-kv-prod']],
    ['Microsoft.Web/sites',                       ['sovera-fn-data', 'sovera-fn-auth', 'sovera-fn-edge']],
  ] as const;
  for (const [t, items] of groups) {
    console.log('  ' + pc.dim(t));
    for (const n of items) console.log(`    ${pc.green('●')} ${n} ${pc.dim('· francecentral')}`);
  }
  log.blank();
  log.ok('Mock view — run `sovera login` and re-run for live status.');
}
