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
        .prepare("SELECT COUNT(*) AS count FROM places WHERE kind = 'RESTAURANT'")
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
        .prepare("SELECT COUNT(*) AS count FROM opportunities WHERE category = 'EVENT'")
        .get().count,
    };
    for (const count of Object.values(counts)) assert.ok(count > 0);

    const importRun = database
      .prepare(
        "SELECT status, summary_json FROM import_runs ORDER BY completed_at DESC LIMIT 1",
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
