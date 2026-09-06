PRAGMA foreign_keys = ON;

CREATE TABLE source_resources (
  id TEXT NOT NULL PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  landing_url TEXT NOT NULL,
  resource_url TEXT NOT NULL,
  agency TEXT NOT NULL,
  license_name TEXT,
  rights_basis TEXT NOT NULL CHECK (rights_basis IN ('OPEN_LICENSE','OFFICIAL_FACT_EXTRACTION')),
  terms_url TEXT,
  content_scope TEXT NOT NULL,
  format TEXT NOT NULL,
  encoding TEXT,
  fetched_at TEXT NOT NULL,
  last_modified_at TEXT,
  content_hash TEXT NOT NULL,
  UNIQUE (source_id, resource_url),
  CHECK (
    (rights_basis = 'OPEN_LICENSE' AND license_name IS NOT NULL AND terms_url IS NOT NULL)
    OR
    (rights_basis = 'OFFICIAL_FACT_EXTRACTION' AND license_name IS NULL AND terms_url IS NULL)
  )
);

CREATE TABLE import_runs (
  id TEXT NOT NULL PRIMARY KEY,
  area_id TEXT NOT NULL REFERENCES areas(id),
  importer_version TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('RUNNING','COMPLETED','PARTIAL','FAILED')),
  summary_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(summary_json)),
  CHECK (
    (status = 'RUNNING' AND completed_at IS NULL)
    OR
    (status <> 'RUNNING' AND completed_at IS NOT NULL)
  )
);

CREATE TABLE import_items (
  run_id TEXT NOT NULL REFERENCES import_runs(id),
  source_resource_id TEXT NOT NULL REFERENCES source_resources(id),
  external_id TEXT NOT NULL,
  subject_type TEXT CHECK (subject_type IS NULL OR subject_type IN ('AREA','PLACE','MENU_ITEM','OFFER','OPPORTUNITY','REPORT')),
  subject_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('IMPORTED','REJECTED','SKIPPED')),
  reject_reason TEXT,
  distance_m INTEGER CHECK (distance_m IS NULL OR (typeof(distance_m) = 'integer' AND distance_m >= 0)),
  source_snapshot_id TEXT NOT NULL REFERENCES source_snapshots(id),
  PRIMARY KEY (run_id, source_resource_id, external_id),
  CHECK (
    (subject_type IS NULL AND subject_id IS NULL)
    OR
    (subject_type IS NOT NULL AND subject_id IS NOT NULL)
  ),
  CHECK (
    status <> 'IMPORTED'
    OR (subject_type IS NOT NULL AND subject_id IS NOT NULL AND reject_reason IS NULL)
  ),
  CHECK (
    status <> 'REJECTED'
    OR (reject_reason IS NOT NULL AND length(trim(reject_reason)) > 0)
  )
);

CREATE INDEX idx_source_resources_source ON source_resources(source_id, fetched_at);
CREATE INDEX idx_import_runs_area_time ON import_runs(area_id, started_at);
CREATE INDEX idx_import_items_subject ON import_items(subject_type, subject_id, status);
CREATE INDEX idx_import_items_distance ON import_items(status, distance_m);

CREATE TRIGGER trg_import_items_source_match_insert
BEFORE INSERT ON import_items
WHEN NOT EXISTS (
  SELECT 1
  FROM source_resources AS resource
  JOIN source_snapshots AS snapshot ON snapshot.id = NEW.source_snapshot_id
  WHERE resource.id = NEW.source_resource_id
    AND resource.source_id = snapshot.source_id
)
BEGIN
  SELECT RAISE(ABORT, 'import item resource and snapshot sources do not match');
END;

CREATE TRIGGER trg_import_items_source_match_update
BEFORE UPDATE OF source_resource_id, source_snapshot_id ON import_items
WHEN NOT EXISTS (
  SELECT 1
  FROM source_resources AS resource
  JOIN source_snapshots AS snapshot ON snapshot.id = NEW.source_snapshot_id
  WHERE resource.id = NEW.source_resource_id
    AND resource.source_id = snapshot.source_id
)
BEGIN
  SELECT RAISE(ABORT, 'import item resource and snapshot sources do not match');
END;

PRAGMA optimize;
