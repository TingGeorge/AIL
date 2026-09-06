import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const mvpDirectory = path.resolve(scriptDirectory, '..');
const dataDirectory = path.join(mvpDirectory, 'data');
const drizzleDirectory = path.join(mvpDirectory, 'drizzle');
const databasePath = path.join(dataDirectory, 'yuanshan-open-data.sqlite');
const snapshotPath = path.join(
  dataDirectory,
  'yuanshan-open-data.snapshot.json',
);
const seedPath = path.join(dataDirectory, 'yuanshan-open-data.seed.sql');
const migrationPaths = [
  path.join(drizzleDirectory, '0001_p0_core.sql'),
  path.join(drizzleDirectory, '0002_product_flow.sql'),
  path.join(drizzleDirectory, '0003_open_data_ingestion.sql'),
];
const requiredSourceIds = [
  'src_taipei_restaurant_registry',
  'src_taipei_friendly_stores',
  'src_taipei_markets',
  'src_taipei_pharmacies',
  'src_taipei_drinking_water',
  'src_taipei_free_wifi',
  'src_taipei_cooling_spots',
  'src_taipei_metro_fares',
  'src_taipei_youbike_realtime',
  'src_taipei_culture_events',
  'src_moc_nearby_activities',
  'src_tfam_visit',
  'src_taipei_confucius_visit',
  'src_taipei_expo_week36',
];

for (const requiredPath of [
  databasePath,
  snapshotPath,
  seedPath,
  ...migrationPaths,
]) {
  if (!existsSync(requiredPath)) {
    throw new Error(
      `Missing data artifact: ${requiredPath}. Run npm run data:refresh first.`,
    );
  }
}

const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const seedSql = readFileSync(seedPath, 'utf8');
const count = (database, sql) => database.prepare(sql).get().value;
const quoteIdentifier = (identifier) =>
  `"${String(identifier).replaceAll('"', '""')}"`;
const getDatabaseDigest = (database) => {
  const digest = createHash('sha256');
  const tableNames = database
    .prepare(
      `SELECT name
       FROM sqlite_schema
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all()
    .map((row) => row.name);

  for (const tableName of tableNames) {
    const quotedTable = quoteIdentifier(tableName);
    const columns = database
      .prepare(`PRAGMA table_info(${quotedTable})`)
      .all()
      .map((column) => column.name);
    const orderBy = columns.map(quoteIdentifier).join(', ');
    digest.update(`${tableName}\0${columns.join('\0')}\0`);
    for (const row of database
      .prepare(`SELECT * FROM ${quotedTable} ORDER BY ${orderBy}`)
      .iterate()) {
      digest.update(`${JSON.stringify(row)}\0`);
    }
  }

  return digest.digest('hex');
};
const getCounts = (database) => ({
  places: count(database, 'SELECT count(*) AS value FROM places'),
  restaurants: count(database, 'SELECT count(*) AS value FROM restaurants'),
  publicResources: count(
    database,
    "SELECT count(*) AS value FROM places WHERE kind = 'PUBLIC_RESOURCE'",
  ),
  transit: count(
    database,
    "SELECT count(*) AS value FROM places WHERE kind = 'TRANSIT'",
  ),
  opportunities: count(database, 'SELECT count(*) AS value FROM opportunities'),
  evidenceAssertions: count(
    database,
    'SELECT count(*) AS value FROM evidence_assertions',
  ),
  sourceResources: count(
    database,
    'SELECT count(*) AS value FROM source_resources',
  ),
  rejectedImports: count(
    database,
    "SELECT count(*) AS value FROM import_items WHERE status = 'REJECTED'",
  ),
});

const database = new DatabaseSync(databasePath, { readOnly: true });
const seedDatabase = new DatabaseSync(':memory:');

try {
  for (const migrationPath of migrationPaths) {
    seedDatabase.exec(readFileSync(migrationPath, 'utf8'));
  }
  seedDatabase.exec(seedSql);

  const integrity = database
    .prepare('PRAGMA integrity_check')
    .get()?.integrity_check;
  const foreignKeyErrors = database.prepare('PRAGMA foreign_key_check').all();
  const seedIntegrity = seedDatabase
    .prepare('PRAGMA integrity_check')
    .get()?.integrity_check;
  const seedForeignKeyErrors = seedDatabase
    .prepare('PRAGMA foreign_key_check')
    .all();
  const latestRun = database
    .prepare(
      `SELECT id, status, started_at, completed_at, summary_json
       FROM import_runs
       ORDER BY started_at DESC
       LIMIT 1`,
    )
    .get();
  const latestSummary = latestRun ? JSON.parse(latestRun.summary_json) : null;
  const counts = getCounts(database);
  const seedCounts = getCounts(seedDatabase);
  const databaseDigest = getDatabaseDigest(database);
  const seedDatabaseDigest = getDatabaseDigest(seedDatabase);
  const area = database
    .prepare(
      `SELECT name, center_lat_e6, center_lng_e6, radius_m, timezone
       FROM areas
       WHERE id = 'area_yuanshan_station_2km'`,
    )
    .get();
  const sourceIds = database
    .prepare('SELECT source_id FROM source_resources ORDER BY source_id')
    .all()
    .map((row) => row.source_id);
  const missingSourceIds = requiredSourceIds.filter(
    (sourceId) => !sourceIds.includes(sourceId),
  );
  const outOfRadius = count(
    database,
    `SELECT count(*) AS value
     FROM import_items
     WHERE status = 'IMPORTED'
       AND subject_type = 'PLACE'
       AND distance_m IS NOT NULL
       AND distance_m > 2000`,
  );
  const unexpectedNullGeofence = count(
    database,
    `SELECT count(*) AS value
     FROM import_items item
     JOIN source_resources resource ON resource.id = item.source_resource_id
     WHERE item.status = 'IMPORTED'
       AND item.subject_type = 'PLACE'
       AND item.distance_m IS NULL
       AND resource.source_id NOT IN (
         'src_tfam_visit',
         'src_taipei_confucius_visit',
         'src_taipei_expo_week36'
       )`,
  );
  const assertedRestaurantStatuses = count(
    database,
    "SELECT count(*) AS value FROM places WHERE kind = 'RESTAURANT' AND status <> 'UNKNOWN'",
  );
  const inventedCommercialFacts = {
    menuItems: count(database, 'SELECT count(*) AS value FROM menu_items'),
    offers: count(database, 'SELECT count(*) AS value FROM offers'),
  };
  const cultureIntegrityViolations = count(
    database,
    `SELECT count(*) AS value
     FROM opportunities opportunity
     LEFT JOIN places place ON place.id = opportunity.place_id
     WHERE opportunity.source_id = 'src_taipei_culture_events'
       AND (
         opportunity.verification_status = 'OFFICIAL_CONFIRMED'
         OR julianday(opportunity.ends_at) - julianday(opportunity.starts_at) > 370
         OR CAST(substr(opportunity.starts_at, 12, 2) AS INTEGER) < 6
         OR (length(place.address_text) <= 8 AND place.address_text LIKE '%區')
         OR place.name LIKE '%Javits%'
         OR opportunity.name LIKE '%Armory Show%'
         OR opportunity.name LIKE '%郵票特展%'
       )`,
  );
  const cultureConflicts = count(
    database,
    `SELECT count(*) AS value
     FROM opportunities
     WHERE source_id = 'src_taipei_culture_events'
       AND verification_status = 'CONFLICTED'`,
  );
  const cultureNearbyVerificationViolations = count(
    database,
    `SELECT count(*) AS value
     FROM opportunities
     WHERE source_id = 'src_moc_nearby_activities'
       AND verification_status NOT IN ('UNVERIFIED', 'CONFLICTED')`,
  );
  const cultureNearbyFreeInferenceViolations = count(
    database,
    `SELECT count(*) AS value
     FROM opportunities opportunity
     WHERE opportunity.source_id = 'src_moc_nearby_activities'
       AND opportunity.direct_cost_twd = 0
       AND NOT EXISTS (
         SELECT 1
         FROM evidence_assertions evidence
         WHERE evidence.subject_type = 'OPPORTUNITY'
           AND evidence.subject_id = opportunity.id
           AND evidence.field_key = 'schedule_location_and_ticket'
           AND (
             evidence.claimed_value_json LIKE '%免費%'
             OR evidence.claimed_value_json LIKE '%免票%'
             OR evidence.claimed_value_json LIKE '%自由入場%'
             OR evidence.claimed_value_json LIKE '%0元%'
           )
       )`,
  );
  const cultureNearbyMissingOccurrenceEvidence = count(
    database,
    `SELECT count(*) AS value
     FROM opportunities opportunity
     WHERE opportunity.source_id = 'src_moc_nearby_activities'
       AND NOT EXISTS (
         SELECT 1
         FROM evidence_assertions evidence
         WHERE evidence.subject_type = 'OPPORTUNITY'
           AND evidence.subject_id = opportunity.id
           AND evidence.field_key = 'schedule_location_and_ticket'
       )`,
  );
  const coolingWebsiteLeaks = count(
    database,
    `SELECT count(*) AS value
     FROM places place
     JOIN external_place_refs ref ON ref.place_id = place.id
     WHERE ref.provider = 'TAIPEI_COOLING_SPOT'
       AND place.website_url IS NOT NULL`,
  );
  const metroPlaceAttributionLeaks = count(
    database,
    "SELECT count(*) AS value FROM external_place_refs WHERE provider = 'TAIPEI_METRO'",
  );
  const realtimeAttributeLeaks = count(
    database,
    `SELECT count(*) AS value
     FROM evidence_assertions evidence
     JOIN source_snapshots snapshot_row ON snapshot_row.id = evidence.source_snapshot_id
     WHERE snapshot_row.source_id = 'src_taipei_youbike_realtime'
       AND evidence.field_key = 'source_attributes'
       AND (
         evidence.claimed_value_json LIKE '%availableRentBikes%'
         OR evidence.claimed_value_json LIKE '%availableReturnBikes%'
       )`,
  );
  const youBikeStatusLeaks = count(
    database,
    `SELECT count(*) AS value
     FROM places place
     JOIN external_place_refs ref ON ref.place_id = place.id
     WHERE ref.provider = 'TAIPEI_YOUBIKE'
       AND place.status <> 'UNKNOWN'`,
  );
  const friendlyStoreClassificationLeaks = count(
    database,
    `SELECT count(*) AS value
     FROM external_place_refs
     WHERE provider = 'TAIPEI_FRIENDLY_STORE'`,
  );
  const invalidDailyGoodsProviders = count(
    database,
    `SELECT count(*) AS value
     FROM places place
     LEFT JOIN external_place_refs ref ON ref.place_id = place.id
     WHERE place.kind = 'STORE'
       AND (ref.provider IS NULL OR ref.provider NOT IN ('TAIPEI_PHARMACY', 'TAIPEI_MARKET'))`,
  );
  const eventOpportunitiesMissingCoordinates = count(
    database,
    `SELECT count(*) AS value
     FROM opportunities opportunity
     LEFT JOIN places place ON place.id = opportunity.place_id
     WHERE opportunity.category = 'EVENT'
       AND (place.id IS NULL OR place.lat_e6 IS NULL OR place.lng_e6 IS NULL)`,
  );
  const realtimeEvidence = database
    .prepare(
      `SELECT
         count(*) AS total,
         sum(CASE WHEN valid_until IS NOT NULL THEN 1 ELSE 0 END) AS with_expiry,
         sum(CASE WHEN julianday(valid_until) > julianday('now') THEN 1 ELSE 0 END) AS fresh_now,
         min(valid_until) AS oldest_valid_until,
         max(valid_until) AS newest_valid_until
       FROM evidence_assertions
       WHERE field_key = 'realtime_availability'`,
    )
    .get();
  const rightsViolations = count(
    database,
    `SELECT count(*) AS value
     FROM source_resources
     WHERE (
       source_id IN ('src_tfam_visit', 'src_taipei_confucius_visit', 'src_taipei_expo_week36')
       AND (license_name IS NOT NULL OR rights_basis <> 'OFFICIAL_FACT_EXTRACTION')
     ) OR (
       source_id NOT IN ('src_tfam_visit', 'src_taipei_confucius_visit', 'src_taipei_expo_week36')
       AND (license_name IS NULL OR rights_basis <> 'OPEN_LICENSE')
     )`,
  );

  const allowPartial = process.env.ALLOW_PARTIAL_IMPORT === '1';
  const failures = [];
  if (integrity !== 'ok') failures.push(`integrity_check=${integrity}`);
  if (foreignKeyErrors.length > 0)
    failures.push(`foreign_key_errors=${foreignKeyErrors.length}`);
  if (seedIntegrity !== 'ok')
    failures.push(`seed_integrity_check=${seedIntegrity}`);
  if (seedForeignKeyErrors.length > 0) {
    failures.push(`seed_foreign_key_errors=${seedForeignKeyErrors.length}`);
  }
  if (!latestRun || (latestRun.status !== 'COMPLETED' && !allowPartial)) {
    failures.push(`latest_import_status=${latestRun?.status ?? 'missing'}`);
  }
  if (!area || area.radius_m !== 2000)
    failures.push('Yuanshan 2 km area is missing or invalid');
  if (missingSourceIds.length > 0)
    failures.push(`missing_sources=${missingSourceIds.join(',')}`);
  if (
    /\bBEGIN(?:\s+IMMEDIATE|\s+TRANSACTION)?\s*;/i.test(seedSql) ||
    /\bCOMMIT\s*;/i.test(seedSql)
  ) {
    failures.push('seed_contains_explicit_transaction');
  }
  if (outOfRadius > 0) failures.push(`places_outside_radius=${outOfRadius}`);
  if (unexpectedNullGeofence > 0) {
    failures.push(`unexpected_null_geofence=${unexpectedNullGeofence}`);
  }
  if (assertedRestaurantStatuses > 0) {
    failures.push(
      `restaurant_statuses_asserted_without_live_source=${assertedRestaurantStatuses}`,
    );
  }
  if (
    inventedCommercialFacts.menuItems > 0 ||
    inventedCommercialFacts.offers > 0
  ) {
    failures.push(
      `unverified_commercial_facts=${JSON.stringify(inventedCommercialFacts)}`,
    );
  }
  if (cultureIntegrityViolations > 0) {
    failures.push(`culture_integrity_violations=${cultureIntegrityViolations}`);
  }
  if (cultureNearbyVerificationViolations > 0) {
    failures.push(
      `culture_nearby_verification_violations=${cultureNearbyVerificationViolations}`,
    );
  }
  if (cultureNearbyFreeInferenceViolations > 0) {
    failures.push(
      `culture_nearby_free_inference_violations=${cultureNearbyFreeInferenceViolations}`,
    );
  }
  if (cultureNearbyMissingOccurrenceEvidence > 0) {
    failures.push(
      `culture_nearby_missing_occurrence_evidence=${cultureNearbyMissingOccurrenceEvidence}`,
    );
  }
  if (coolingWebsiteLeaks > 0)
    failures.push(`cooling_website_leaks=${coolingWebsiteLeaks}`);
  if (metroPlaceAttributionLeaks > 0) {
    failures.push(
      `metro_place_attribution_leaks=${metroPlaceAttributionLeaks}`,
    );
  }
  if (realtimeAttributeLeaks > 0) {
    failures.push(`realtime_attribute_leaks=${realtimeAttributeLeaks}`);
  }
  if (youBikeStatusLeaks > 0)
    failures.push(`youbike_status_leaks=${youBikeStatusLeaks}`);
  if (friendlyStoreClassificationLeaks > 0) {
    failures.push(
      `friendly_store_classification_leaks=${friendlyStoreClassificationLeaks}`,
    );
  }
  if (invalidDailyGoodsProviders > 0) {
    failures.push(`invalid_daily_goods_providers=${invalidDailyGoodsProviders}`);
  }
  if (eventOpportunitiesMissingCoordinates > 0) {
    failures.push(
      `event_opportunities_missing_coordinates=${eventOpportunitiesMissingCoordinates}`,
    );
  }
  if (realtimeEvidence.total !== realtimeEvidence.with_expiry) {
    failures.push('realtime_evidence_without_expiry');
  }
  if (rightsViolations > 0)
    failures.push(`rights_violations=${rightsViolations}`);
  if (
    counts.places < 20 ||
    counts.restaurants < 7 ||
    counts.publicResources < 7 ||
    counts.transit < 1 ||
    counts.sourceResources !== requiredSourceIds.length
  ) {
    failures.push(`counts_below_minimum=${JSON.stringify(counts)}`);
  }
  if (JSON.stringify(counts) !== JSON.stringify(seedCounts)) {
    failures.push('generated_database_and_seed_counts_do_not_match');
  }
  if (databaseDigest !== seedDatabaseDigest) {
    failures.push('generated_database_and_seed_content_do_not_match');
  }
  if (
    snapshot.meta?.runId !== latestRun?.id ||
    snapshot.meta?.counts?.places !== counts.places ||
    snapshot.meta?.counts?.opportunities !== counts.opportunities ||
    snapshot.meta?.counts?.evidenceAssertions !== counts.evidenceAssertions ||
    latestSummary?.counts?.places !== counts.places
  ) {
    failures.push('snapshot_database_or_import_summary_do_not_match');
  }
  if (
    snapshot.sources?.length !== requiredSourceIds.length ||
    snapshot.sources.some((source) => !source.contentHash || !source.fetchedAt)
  ) {
    failures.push('snapshot_source_manifest_is_incomplete');
  }

  if (failures.length > 0) {
    throw new Error(
      `Yuanshan database verification failed: ${failures.join('; ')}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        databasePath,
        integrity,
        foreignKeyErrors: 0,
        seedRebuild: {
          integrity: seedIntegrity,
          foreignKeyErrors: 0,
          countsMatch: true,
          contentDigestMatches: true,
        },
        latestImport: {
          id: latestRun.id,
          status: latestRun.status,
          startedAt: latestRun.started_at,
          completedAt: latestRun.completed_at,
        },
        area,
        counts,
        freshness: {
          youBikeRealtimeAssertions: realtimeEvidence.total,
          freshNow: realtimeEvidence.fresh_now,
          oldestValidUntil: realtimeEvidence.oldest_valid_until,
          newestValidUntil: realtimeEvidence.newest_valid_until,
        },
        safeguards: {
          importedPlacesOutsideRadius: outOfRadius,
          unexpectedNullGeofence,
          restaurantStatusesKeptUnknown: assertedRestaurantStatuses === 0,
          unverifiedMenuItems: inventedCommercialFacts.menuItems,
          unverifiedOffers: inventedCommercialFacts.offers,
          cultureIntegrityViolations,
          cultureConflicts,
          cultureNearbyVerificationViolations,
          cultureNearbyFreeInferenceViolations,
          cultureNearbyMissingOccurrenceEvidence,
          coolingWebsiteLeaks,
          metroPlaceAttributionLeaks,
          realtimeAttributeLeaks,
          youBikeStatusLeaks,
          friendlyStoreClassificationLeaks,
          invalidDailyGoodsProviders,
          eventOpportunitiesMissingCoordinates,
          rightsViolations,
        },
      },
      null,
      2,
    ),
  );
} finally {
  database.close();
  seedDatabase.close();
}
