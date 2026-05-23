import { promises as fs } from 'node:fs';
import path from 'node:path';
import { log, banner } from '../util/log.js';

export async function dbPush(opts: { dir?: string }) {
  banner();
  log.brand('Push schema migrations');
  log.blank();

  const dir = path.resolve(process.cwd(), opts.dir ?? 'services/db');
  let files: string[];
  try {
    files = (await fs.readdir(dir))
      .filter(f => f.endsWith('.sql'))
      .sort();
  } catch {
    log.err(`Migrations directory not found: ${dir}`);
    process.exitCode = 1; return;
  }

  if (files.length === 0) { log.warn('No .sql files found.'); return; }

  log.info(`Found ${files.length} migration(s) in ${path.relative(process.cwd(), dir)}`);
  files.forEach((f, i) => log.step(i + 1, files.length, f));
  log.blank();
  log.warn('Dry run — wire to psql + your control plane DB to execute.');
  log.hint('Sovera will run each file inside a transaction, recording in dl.migrations.');
  log.blank();
}
