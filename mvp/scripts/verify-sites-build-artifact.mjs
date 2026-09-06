import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const mvpDirectory = path.resolve(scriptDirectory, '..');
const metadataDirectory = path.join(mvpDirectory, 'dist', '.openai');
const migrationsDirectory = path.join(metadataDirectory, 'drizzle');
const hostingPath = path.join(metadataDirectory, 'hosting.json');
const expectedMigrations = [
  '0001_p0_core.sql',
  '0002_product_flow.sql',
  '0003_open_data_ingestion.sql',
  '0004_catalog_seed.sql',
  '0005_ai_rate_limits.sql',
];

if (!existsSync(hostingPath)) throw new Error('Sites hosting.json is missing.');
const hosting = JSON.parse(readFileSync(hostingPath, 'utf8'));
if (hosting.d1 !== 'DB') throw new Error('Sites D1 binding must be DB.');

const migrations = readdirSync(migrationsDirectory).sort();
if (JSON.stringify(migrations) !== JSON.stringify(expectedMigrations)) {
  throw new Error(
    `Unexpected Sites migration artifact: ${JSON.stringify(migrations)}.`,
  );
}
for (const migration of migrations) {
  const size = statSync(path.join(migrationsDirectory, migration)).size;
  if (size > 2_000_000) {
    throw new Error(`Sites migration ${migration} is too large: ${size} bytes.`);
  }
}

console.log(
  JSON.stringify(
    {
      hosting: { project_id: hosting.project_id, d1: hosting.d1 },
      migrations: migrations.map((name) => ({
        name,
        bytes: statSync(path.join(migrationsDirectory, name)).size,
      })),
    },
    null,
    2,
  ),
);
