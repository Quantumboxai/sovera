import { promises as fs } from 'node:fs';
import path from 'node:path';
import prompts from 'prompts';
import { log, banner } from '../util/log.js';

export async function initCommand(opts: { yes?: boolean }) {
  banner();
  log.brand('Initialize a new Sovera workspace');
  log.blank();

  const cwd = process.cwd();

  const existing = await fileExists(path.join(cwd, 'sovera.config.json'));
  if (existing && !opts.yes) {
    const { overwrite } = await prompts({
      type: 'confirm', name: 'overwrite',
      message: 'sovera.config.json already exists. Overwrite?',
      initial: false,
    });
    if (!overwrite) { log.warn('Aborted.'); return; }
  }

  const answers = opts.yes
    ? { name: path.basename(cwd), region: 'francecentral', subscription: '' }
    : await prompts([
        { type: 'text',   name: 'name',         message: 'Project name',        initial: path.basename(cwd) },
        { type: 'select', name: 'region',       message: 'Azure region',
          choices: [
            { title: 'France Central (HDS)', value: 'francecentral' },
            { title: 'West Europe',          value: 'westeurope' },
            { title: 'North Europe',         value: 'northeurope' },
          ], initial: 0 },
        { type: 'text',   name: 'subscription', message: 'Azure subscription ID (optional)', initial: '' },
      ]);

  const config = {
    $schema: 'https://sovera.cloud/schema/config.json',
    name: answers.name,
    region: answers.region,
    subscription: answers.subscription || undefined,
    infra: { path: './infra', main: 'main.bicep', params: 'main.bicepparam' },
    tenants: { module: './infra/modules/tenant.bicep', bootstrap: './services/db/tenant-bootstrap.sql' },
  };

  await fs.writeFile(path.join(cwd, 'sovera.config.json'), JSON.stringify(config, null, 2) + '\n', 'utf-8');
  log.ok(`Wrote ${path.relative(cwd, path.join(cwd, 'sovera.config.json'))}`);

  log.blank();
  log.brand('Next steps');
  log.hint('1.  sovera login                 — authenticate to Azure');
  log.hint('2.  sovera db push               — deploy schema migrations');
  log.hint('3.  sovera tenant create acme    — onboard your first customer');
  log.hint('4.  sovera status                — see what you just built');
  log.blank();
}

async function fileExists(p: string) {
  try { await fs.access(p); return true; } catch { return false; }
}
