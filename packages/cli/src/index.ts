#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { loginCommand } from './commands/login.js';
import { dbPush } from './commands/db.js';
import { tenantCreate } from './commands/tenant.js';
import { functionsDeploy } from './commands/functions.js';
import { status } from './commands/status.js';

const program = new Command()
  .name('sovera')
  .description('Sovera — sovereign data backend for the EU. CLI.')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize a new Sovera workspace')
  .option('-y, --yes', 'accept all defaults')
  .action(initCommand);

program
  .command('login')
  .description('Authenticate to Azure via az CLI')
  .action(loginCommand);

const db = program.command('db').description('Database operations');
db.command('push')
  .description('Apply pending SQL migrations to the control plane DB')
  .option('-d, --dir <path>', 'migrations directory', 'services/db')
  .action(dbPush);

const tenant = program.command('tenant').description('Manage customer tenants');
tenant.command('create <slug>')
  .description('Onboard a new tenant (deploys infra/modules/tenant.bicep + runs tenant-bootstrap.sql)')
  .option('-t, --tier <tier>', 'starter | pro | enterprise', 'starter')
  .option('-g, --rg <name>',    'resource group (override sovera.config.json)')
  .action(tenantCreate);

const fns = program.command('functions').description('Azure Functions operations');
fns.command('deploy')
  .description('Publish all functions apps (or a single one with --app)')
  .option('-a, --app <name>', 'single app name')
  .option('-d, --dir <path>', 'functions root', 'services/functions')
  .action(functionsDeploy);

program
  .command('status')
  .description('Show resources in your Sovera resource group')
  .option('-g, --rg <name>', 'resource group (override sovera.config.json)')
  .action(status);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
