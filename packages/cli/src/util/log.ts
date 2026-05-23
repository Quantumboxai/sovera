import pc from 'picocolors';

const brand = (s: string) => pc.bold(pc.magenta(s));

export const log = {
  brand: (msg: string) => console.log(brand('  sovera  ') + ' ' + msg),
  info:  (msg: string) => console.log(pc.cyan('   info   ') + ' ' + msg),
  ok:    (msg: string) => console.log(pc.green('   ok     ') + ' ' + msg),
  warn:  (msg: string) => console.log(pc.yellow('  warn   ') + ' ' + msg),
  err:   (msg: string) => console.log(pc.red('  error  ') + ' ' + msg),
  step:  (n: number, total: number, msg: string) =>
    console.log(pc.dim(`  [${n}/${total}]`) + ' ' + msg),
  hint:  (msg: string) => console.log(pc.dim('          ' + msg)),
  blank: () => console.log(''),
};

export function banner() {
  console.log('');
  console.log(brand('  ███████  ') + pc.dim(' sovereign data, fast.'));
  console.log(pc.magenta('  ▀▀▀▀▀▀▀  ') + pc.dim(' v0.1.0 · HDS/HIPAA-grade on Azure'));
  console.log('');
}
