import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
const configPath = path.join(mvpDirectory, 'wrangler.local.jsonc');
const persistPath = path.join(mvpDirectory, '.wrangler', 'state');
const wranglerConfigHome = path.join(mvpDirectory, '.wrangler', 'config');
const snapshotPath = path.join(
  mvpDirectory,
  'data',
  'yuanshan-open-data.snapshot.json',
);
const seedPath = path.join(mvpDirectory, 'data', 'yuanshan-open-data.seed.sql');
const migrationPaths = [
  '0001_p0_core.sql',
  '0002_product_flow.sql',
  '0003_open_data_ingestion.sql',
].map((name) => path.join(mvpDirectory, 'drizzle', name));
const aiRateLimitMigrationPath = path.join(
  mvpDirectory,
  'drizzle',
  '0006_ai_rate_limits.sql',
);
const accountMigrationPath = path.join(
  mvpDirectory,
  'drizzle',
  '0007_auth_accounts.sql',
);
const accountUsernameCheckMigrationPath = path.join(
  mvpDirectory,
  'drizzle',
  '0008_auth_username_binary_check.sql',
);
const accountRevisionMigrationPath = path.join(
  mvpDirectory,
  'drizzle',
  '0009_account_state_revision.sql',
);

for (const requiredPath of [
  wranglerEntry,
  configPath,
  snapshotPath,
  seedPath,
  ...migrationPaths,
  aiRateLimitMigrationPath,
  accountMigrationPath,
  accountUsernameCheckMigrationPath,
  accountRevisionMigrationPath,
]) {
  if (!existsSync(requiredPath)) {
    throw new Error(`Missing required local D1 input: ${requiredPath}`);
  }
}

const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const seedSql = readFileSync(seedPath, 'utf8');
const expectedRunId = snapshot?.meta?.runId;
if (typeof expectedRunId !== 'string' || !expectedRunId) {
  throw new Error('Snapshot is missing meta.runId; run npm run data:refresh.');
}
if (!seedSql.includes(expectedRunId)) {
  throw new Error(
    'Snapshot and seed belong to different import runs; run npm run data:refresh.',
  );
}

const baseArguments = [
  wranglerEntry,
  'd1',
  'execute',
  'DB',
  '--local',
  '--config',
  configPath,
  '--persist-to',
  persistPath,
  '--yes',
];

function runWrangler(
  arguments_,
  { json = false, quiet = false, silent = false } = {},
) {
  const result = spawnSync(
    process.execPath,
    [...baseArguments, ...arguments_, ...(json ? ['--json'] : [])],
    {
      cwd: mvpDirectory,
      encoding: 'utf8',
      env: {
        ...process.env,
        XDG_CONFIG_HOME: wranglerConfigHome,
        WRANGLER_SEND_METRICS: 'false',
      },
      stdio: silent ? ['ignore', 'ignore', 'pipe'] : quiet ? 'pipe' : 'inherit',
      windowsHide: true,
      timeout: 180_000,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (quiet || silent) {
      process.stderr.write(result.stderr || result.stdout || '');
    }
    throw new Error(
      result.signal
        ? `Wrangler was stopped by ${result.signal}.`
        : `Wrangler exited with status ${result.status}.`,
    );
  }
  return result.stdout ?? '';
}

function query(sql) {
  const output = runWrangler(['--command', sql], { json: true, quiet: true });
  const parsed = JSON.parse(output);
  return parsed?.[0]?.results ?? [];
}

const requiredTables = [
  'areas',
  'places',
  'restaurants',
  'opportunities',
  'evidence_assertions',
  'import_runs',
  'import_items',
];
const existingTables = new Set(
  query(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${requiredTables
      .map((name) => `'${name}'`)
      .join(',')})`,
  ).map((row) => row.name),
);

if (existingTables.size > 0 && existingTables.size < requiredTables.length) {
  throw new Error(
    'Local D1 has a partial schema. Back up or remove only mvp/.wrangler/state, then retry.',
  );
}

if (existingTables.size === 0) {
  for (const migrationPath of migrationPaths) {
    process.stdout.write(`Applying ${path.basename(migrationPath)}...\n`);
    runWrangler(['--file', migrationPath], { silent: true });
  }
}

const aiRateLimitTableExists =
  query(
    `SELECT EXISTS(
     SELECT 1 FROM sqlite_master
     WHERE type = 'table' AND name = 'ai_rate_limit_windows'
   ) AS present`,
  )[0]?.present === 1;

if (!aiRateLimitTableExists) {
  process.stdout.write(
    `Applying ${path.basename(aiRateLimitMigrationPath)}...\n`,
  );
  runWrangler(['--file', aiRateLimitMigrationPath], { silent: true });
}

const aiRateLimitColumns = new Set(
  query(`PRAGMA table_info('ai_rate_limit_windows')`).map((row) => row.name),
);
for (const column of [
  'bucket_key',
  'window_started_at',
  'request_count',
  'expires_at',
]) {
  if (!aiRateLimitColumns.has(column)) {
    throw new Error(
      `Local D1 ai_rate_limit_windows is missing required column ${column}.`,
    );
  }
}

const accountTables = ['auth_credentials', 'auth_sessions', 'account_state'];
const existingAccountTables = new Set(
  query(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${accountTables
      .map((name) => `'${name}'`)
      .join(',')})`,
  ).map((row) => row.name),
);
if (existingAccountTables.size === 0) {
  process.stdout.write(`Applying ${path.basename(accountMigrationPath)}...\n`);
  runWrangler(['--file', accountMigrationPath], { silent: true });
} else if (existingAccountTables.size !== accountTables.length) {
  throw new Error('Local D1 has a partial account schema.');
}

const accountCredentialsSql =
  query(
    `SELECT sql FROM sqlite_master
     WHERE type = 'table' AND name = 'auth_credentials'`,
  )[0]?.sql ?? '';
if (!accountCredentialsSql.includes('username COLLATE BINARY = lower(username)')) {
  process.stdout.write(
    `Applying ${path.basename(accountUsernameCheckMigrationPath)}...\n`,
  );
  runWrangler(['--file', accountUsernameCheckMigrationPath], { silent: true });
}

const upgradedCredentialsSql =
  query(
    `SELECT sql FROM sqlite_master
     WHERE type = 'table' AND name = 'auth_credentials'`,
  )[0]?.sql ?? '';
if (!upgradedCredentialsSql.includes('username COLLATE BINARY = lower(username)')) {
  throw new Error('Local D1 auth_credentials is missing the binary lowercase check.');
}

let accountStateColumns = new Set(
  query(`PRAGMA table_info('account_state')`).map((row) => row.name),
);
if (!accountStateColumns.has('revision')) {
  process.stdout.write(
    `Applying ${path.basename(accountRevisionMigrationPath)}...\n`,
  );
  runWrangler(['--file', accountRevisionMigrationPath], { silent: true });
  accountStateColumns = new Set(
    query(`PRAGMA table_info('account_state')`).map((row) => row.name),
  );
}
if (!accountStateColumns.has('revision')) {
  throw new Error('Local D1 account_state is missing the revision column.');
}

const expectedCounts = snapshot?.meta?.counts;

function stateForRun(runId) {
  const escapedId = runId.replaceAll("'", "''");
  return query(
    `SELECT
       EXISTS(
         SELECT 1 FROM import_runs
         WHERE id = '${escapedId}' AND status = 'COMPLETED'
       ) AS completed,
       (SELECT COUNT(DISTINCT subject_id)
        FROM import_items
        WHERE run_id = '${escapedId}'
          AND subject_type = 'PLACE'
          AND status = 'IMPORTED') AS places,
       (SELECT COUNT(DISTINCT subject_id)
        FROM import_items
        WHERE run_id = '${escapedId}'
          AND subject_type = 'OPPORTUNITY'
          AND status = 'IMPORTED') AS opportunities,
       (SELECT COUNT(DISTINCT item.subject_id)
        FROM import_items item
        JOIN restaurants restaurant ON restaurant.place_id = item.subject_id
        WHERE item.run_id = '${escapedId}'
          AND item.subject_type = 'PLACE'
          AND item.status = 'IMPORTED') AS restaurants,
       (SELECT COUNT(*)
        FROM import_items item
        LEFT JOIN places place
          ON item.subject_type = 'PLACE' AND place.id = item.subject_id
        LEFT JOIN opportunities opportunity
          ON item.subject_type = 'OPPORTUNITY'
          AND opportunity.id = item.subject_id
        WHERE item.run_id = '${escapedId}'
          AND item.status = 'IMPORTED'
          AND (
            (item.subject_type = 'PLACE' AND place.id IS NULL)
            OR (
              item.subject_type = 'OPPORTUNITY'
              AND opportunity.id IS NULL
            )
          )) AS orphanedSubjects`,
  )[0];
}

function stateIsReady(state) {
  return (
    state?.completed === 1 &&
    state.orphanedSubjects === 0 &&
    ['places', 'restaurants', 'opportunities'].every(
      (key) => state[key] === expectedCounts?.[key],
    )
  );
}

const existingState =
  existingTables.size === requiredTables.length
    ? stateForRun(expectedRunId)
    : null;

if (!stateIsReady(existingState)) {
  process.stdout.write(`Syncing official data run ${expectedRunId}...\n`);
  runWrangler(['--file', seedPath], { silent: true });
} else {
  process.stdout.write(`Local D1 already has data run ${expectedRunId}.\n`);
}

const state = stateIsReady(existingState)
  ? existingState
  : stateForRun(expectedRunId);
if (!state || state.completed !== 1) {
  throw new Error(`Local D1 did not complete expected run ${expectedRunId}.`);
}
for (const key of ['places', 'restaurants', 'opportunities']) {
  if (state[key] !== expectedCounts?.[key]) {
    throw new Error(
      `Local D1 ${key} count ${state[key]} does not match snapshot ${expectedCounts?.[key]}.`,
    );
  }
}
if (state.orphanedSubjects !== 0) {
  throw new Error(
    `Local D1 has ${state.orphanedSubjects} imported subjects without matching records.`,
  );
}
const counts = {
  places: state.places,
  opportunities: state.opportunities,
  restaurants: state.restaurants,
};
process.stdout.write(
  `${JSON.stringify({ ok: true, runId: expectedRunId, counts })}\n`,
);
