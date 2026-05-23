// Quick MCP smoke test — spawns the server, lists tools, calls sovera_tables_list,
// then sovera_sql with a trivial SELECT, then sovera_compliance_status.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const FUNC_KEY = readFileSync('c:/users/david/doculink/.func-key', 'utf-8').trim();
const URL_ = 'https://sovera-fn-h2ssji7afhlr2.azurewebsites.net';

// The function key works on routes with authLevel=function via ?code= or x-functions-key
// but our auth.ts also accepts it as Bearer. We'll use it as SOVERA_KEY for now.
const env = {
  ...process.env,
  SOVERA_URL: URL_,
  SOVERA_KEY: FUNC_KEY,
  SOVERA_READ_ONLY: '1',
};

const child = spawn(process.execPath, ['c:/users/david/doculink/packages/mcp-server/dist/index.js'], { env, stdio: ['pipe', 'pipe', 'pipe'] });

let buf = '';
const replies = [];
child.stdout.on('data', d => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) { try { replies.push(JSON.parse(line)); } catch { /* ignore */ } }
  }
});
child.stderr.on('data', d => process.stderr.write('[srv] ' + d.toString()));

function send(obj) {
  child.stdin.write(JSON.stringify(obj) + '\n');
}
function waitFor(id, timeout = 30000) {
  return new Promise((res, rej) => {
    const start = Date.now();
    const t = setInterval(() => {
      const r = replies.find(x => x.id === id);
      if (r) { clearInterval(t); res(r); }
      else if (Date.now() - start > timeout) { clearInterval(t); rej(new Error('timeout id=' + id)); }
    }, 100);
  });
}

(async () => {
  // initialize
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } } });
  const init = await waitFor(1);
  console.log('init OK:', init.result?.serverInfo);

  send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

  // list tools
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const list = await waitFor(2);
  console.log('tools:', list.result.tools.length, '→', list.result.tools.map(t => t.name).join(', '));

  // call compliance
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'sovera_compliance_status', arguments: {} } });
  const comp = await waitFor(3);
  console.log('compliance OK:', String(comp.result?.content?.[0]?.text || '').slice(0, 200));

  // call sql (read-only — SELECT 1)
  send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'sovera_sql', arguments: { sql: 'select 1 as ok' } } });
  const sqlRes = await waitFor(4);
  console.log('sql OK:', String(sqlRes.result?.content?.[0]?.text || '').slice(0, 200));

  // try a write — should be rejected by read-only guard
  send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'sovera_sql', arguments: { sql: 'delete from foo' } } });
  const writeRes = await waitFor(5);
  console.log('write blocked:', writeRes.result?.isError === true ? 'YES ✓' : 'NO ✗', '→', String(writeRes.result?.content?.[0]?.text || '').slice(0, 120));

  child.kill();
  process.exit(0);
})().catch(e => { console.error('FAIL:', e); child.kill(); process.exit(1); });
