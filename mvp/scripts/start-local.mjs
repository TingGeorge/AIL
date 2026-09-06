import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const mvpDirectory = path.resolve(scriptsDirectory, '..');
const wranglerEntry = path.join(
  mvpDirectory,
  'node_modules',
  'wrangler',
  'bin',
  'wrangler.js',
);
const wranglerConfigHome = path.join(
  mvpDirectory,
  '.wrangler',
  'config',
);
const arguments_ = [
  wranglerEntry,
  'dev',
  '--config',
  path.join(mvpDirectory, 'dist', 'server', 'wrangler.json'),
  '--persist-to',
  path.join(mvpDirectory, '.wrangler', 'state'),
];
if (process.env.PORT) arguments_.push('--port', process.env.PORT);

const child = spawn(process.execPath, arguments_, {
  cwd: mvpDirectory,
  env: {
    ...process.env,
    XDG_CONFIG_HOME: wranglerConfigHome,
    WRANGLER_SEND_METRICS: 'false',
  },
  stdio: 'inherit',
  windowsHide: true,
});

child.on('error', (error) => {
  console.error(`Unable to start the local Worker: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Local Worker stopped by ${signal}.`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
