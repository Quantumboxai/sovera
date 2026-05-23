import { spawnSync } from 'node:child_process';

export type AzResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Run an `az` CLI command, returning JSON-parsed stdout.
 * The az CLI must be installed and logged-in.
 */
export function az<T = unknown>(args: string[]): AzResult<T> {
  const res = spawnSync('az', [...args, '-o', 'json'], { encoding: 'utf-8', shell: process.platform === 'win32' });
  if (res.status !== 0) {
    return { ok: false, error: (res.stderr || res.stdout || 'az failed').trim() };
  }
  const out = res.stdout.trim();
  try {
    return { ok: true, data: out ? JSON.parse(out) : ({} as T) };
  } catch {
    return { ok: true, data: out as unknown as T };
  }
}

export function azText(args: string[]): AzResult<string> {
  const res = spawnSync('az', args, { encoding: 'utf-8', shell: process.platform === 'win32' });
  if (res.status !== 0) {
    return { ok: false, error: (res.stderr || res.stdout || 'az failed').trim() };
  }
  return { ok: true, data: res.stdout.trim() };
}

export function checkAzInstalled(): boolean {
  const res = spawnSync('az', ['--version'], { encoding: 'utf-8', shell: process.platform === 'win32' });
  return res.status === 0;
}
