import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { log, banner } from '../util/log.js';

export async function functionsDeploy(opts: { app?: string; dir?: string }) {
  banner();
  log.brand('Deploy Azure Functions');
  log.blank();

  const dir = path.resolve(process.cwd(), opts.dir ?? 'services/functions');
  let apps: string[];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    apps = entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    log.err(`Functions directory not found: ${dir}`);
    process.exitCode = 1; return;
  }

  const targets = opts.app ? apps.filter(a => a === opts.app) : apps;
  if (targets.length === 0) {
    log.err(opts.app ? `App "${opts.app}" not found in ${dir}.` : 'No function apps found.');
    process.exitCode = 1; return;
  }

  for (let i = 0; i < targets.length; i++) {
    const app = targets[i];
    log.step(i + 1, targets.length, `Publishing ${app}`);
    const appDir = path.join(dir, app);
    const r = spawnSync('func', ['azure', 'functionapp', 'publish', app, '--javascript'], {
      stdio: 'inherit', cwd: appDir, shell: process.platform === 'win32',
    });
    if (r.status !== 0) {
      log.err(`Publish failed for ${app}. Is the function app provisioned? (sovera status)`);
      process.exitCode = r.status ?? 1;
      return;
    }
    log.ok(`${app} deployed`);
  }
  log.blank();
}
