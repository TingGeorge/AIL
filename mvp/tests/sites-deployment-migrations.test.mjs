import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const mvpDirectory = path.resolve(testDirectory, '..');
const migrationPaths = [
  'drizzle/0001_p0_core.sql',
  'drizzle/0002_product_flow.sql',
  'drizzle/0003_open_data_ingestion.sql',
  'sites-drizzle/0004_catalog_seed.sql',
  'drizzle/0006_ai_rate_limits.sql',
  'drizzle/0007_auth_accounts.sql',
  'drizzle/0008_auth_username_binary_check.sql',
].map((relativePath) => path.join(mvpDirectory, relativePath));

test('Sites migrations bootstrap a compact, referentially valid five-category catalog', () => {
  const database = new DatabaseSync(':memory:');
  try {
    for (const migrationPath of migrationPaths) {
      database.exec(readFileSync(migrationPath, 'utf8'));
    }

    const foreignKeyErrors = database.prepare('PRAGMA foreign_key_check').all();
    assert.deepEqual(foreignKeyErrors, []);

    const counts = {
      food: database
        .prepare(
          "SELECT COUNT(*) AS count FROM places WHERE kind = 'RESTAURANT'",
        )
        .get().count,
      dailyGoods: database
        .prepare(
          "SELECT COUNT(*) AS count FROM places p JOIN external_place_refs x ON x.place_id = p.id WHERE p.kind = 'STORE' AND x.provider = 'TAIPEI_PHARMACY'",
        )
        .get().count,
      freeResources: database
        .prepare(
          "SELECT COUNT(*) AS count FROM places WHERE kind = 'PUBLIC_RESOURCE'",
        )
        .get().count,
      transport: database
        .prepare("SELECT COUNT(*) AS count FROM places WHERE kind = 'TRANSIT'")
        .get().count,
      events: database
        .prepare(
          "SELECT COUNT(*) AS count FROM opportunities WHERE category = 'EVENT'",
        )
        .get().count,
    };
    for (const count of Object.values(counts)) assert.ok(count > 0);

    const importRun = database
      .prepare(
        'SELECT status, summary_json FROM import_runs ORDER BY completed_at DESC LIMIT 1',
      )
      .get();
    assert.equal(importRun.status, 'COMPLETED');
    assert.equal(JSON.parse(importRun.summary_json).deploymentSeed, 'curated');
  } finally {
    database.close();
  }
});

test('Sites seed stays below deployment and D1 statement limits', () => {
  const seed = readFileSync(migrationPaths[3], 'utf8');
  assert.ok(Buffer.byteLength(seed) < 2_000_000);
  assert.ok(
    Math.max(...seed.split(/\r?\n/).map((line) => Buffer.byteLength(line))) <
      100_000,
  );
});

test('auth migration appends to a v10 database without changing catalog data', () => {
  const database = new DatabaseSync(':memory:');
  try {
    for (const migrationPath of migrationPaths.slice(0, 5)) {
      database.exec(readFileSync(migrationPath, 'utf8'));
    }
    const catalogCounts = () =>
      database
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM places) AS places,
             (SELECT COUNT(*) FROM opportunities) AS opportunities,
             (SELECT COUNT(*) FROM sources) AS sources`,
        )
        .get();
    const before = catalogCounts();

    for (const migrationPath of migrationPaths.slice(5)) {
      database.exec(readFileSync(migrationPath, 'utf8'));
    }

    assert.deepEqual(catalogCounts(), before);
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('auth_credentials', 'auth_sessions', 'account_state')",
        )
        .get().count,
      3,
    );
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    database.close();
  }
});

test('auth migration enforces normalized credentials, valid JSON, and cascades', () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(readFileSync(migrationPaths[0], 'utf8'));
    database.exec(readFileSync(migrationPaths[5], 'utf8'));
    database.exec(readFileSync(migrationPaths[6], 'utf8'));
    const now = '2026-09-06T00:00:00.000Z';
    database
      .prepare(
        "INSERT INTO users (id, auth_subject, status, created_at, updated_at) VALUES (?, ?, 'ACTIVE', ?, ?)",
      )
      .run('user-audit', 'username:audit_user', now, now);
    database
      .prepare(
        'INSERT INTO auth_credentials (user_id, username, password_hash, password_salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('user-audit', 'audit_user', 'hash', 'salt', now, now);
    database
      .prepare(
        'INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run('session-audit', 'user-audit', 'token-hash', now, now);
    database
      .prepare(
        'INSERT INTO account_state (user_id, state_json, updated_at) VALUES (?, ?, ?)',
      )
      .run('user-audit', '{}', now);

    database
      .prepare(
        "INSERT INTO users (id, auth_subject, status, created_at, updated_at) VALUES (?, ?, 'ACTIVE', ?, ?)",
      )
      .run('user-uppercase', 'username:UPPER', now, now);
    assert.throws(() =>
      database
        .prepare(
          'INSERT INTO auth_credentials (user_id, username, password_hash, password_salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('user-uppercase', 'UPPER', 'hash', 'salt', now, now),
    );
    assert.throws(() =>
      database
        .prepare('UPDATE account_state SET state_json = ? WHERE user_id = ?')
        .run('not-json', 'user-audit'),
    );

    database.prepare('DELETE FROM users WHERE id = ?').run('user-audit');
    for (const table of [
      'auth_credentials',
      'auth_sessions',
      'account_state',
    ]) {
      assert.equal(
        database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
        0,
      );
    }
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    database.close();
  }
});

test('username check migration normalizes existing rows and rejects uppercase', () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(readFileSync(migrationPaths[0], 'utf8'));
    database.exec(readFileSync(migrationPaths[5], 'utf8'));
    const now = '2026-09-06T00:00:00.000Z';
    database
      .prepare(
        "INSERT INTO users (id, auth_subject, status, created_at, updated_at) VALUES (?, ?, 'ACTIVE', ?, ?)",
      )
      .run('user-upgrade', 'username:upgrade_user', now, now);
    database
      .prepare(
        'INSERT INTO auth_credentials (user_id, username, password_hash, password_salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('user-upgrade', 'UPGRADE_USER', 'hash', 'salt', now, now);

    database.exec(readFileSync(migrationPaths[6], 'utf8'));

    assert.equal(
      database
        .prepare(
          'SELECT username FROM auth_credentials WHERE user_id = ?',
        )
        .get('user-upgrade').username,
      'upgrade_user',
    );
    assert.throws(() =>
      database
        .prepare('UPDATE auth_credentials SET username = ? WHERE user_id = ?')
        .run('UPGRADE_USER', 'user-upgrade'),
    );
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    database.close();
  }
});
