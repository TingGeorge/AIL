PRAGMA foreign_keys = ON;

CREATE TABLE ai_rate_limit_windows (
  bucket_key TEXT NOT NULL PRIMARY KEY,
  window_started_at INTEGER NOT NULL CHECK (
    typeof(window_started_at) = 'integer' AND window_started_at >= 0
  ),
  request_count INTEGER NOT NULL CHECK (
    typeof(request_count) = 'integer' AND request_count >= 1
  ),
  expires_at INTEGER NOT NULL CHECK (
    typeof(expires_at) = 'integer' AND expires_at > window_started_at
  ),
  CHECK (length(bucket_key) BETWEEN 16 AND 160)
);

CREATE INDEX idx_ai_rate_limit_windows_expires_at
  ON ai_rate_limit_windows(expires_at);

PRAGMA optimize;
