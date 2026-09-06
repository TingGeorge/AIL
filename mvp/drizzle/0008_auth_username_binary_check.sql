PRAGMA foreign_keys = ON;

CREATE TABLE auth_credentials_next (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (
    length(username) BETWEEN 3 AND 30
    AND username COLLATE BINARY = lower(username)
  ),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO auth_credentials_next (
  user_id,
  username,
  password_hash,
  password_salt,
  created_at,
  updated_at
)
SELECT
  user_id,
  lower(username),
  password_hash,
  password_salt,
  created_at,
  updated_at
FROM auth_credentials;

DROP TABLE auth_credentials;
ALTER TABLE auth_credentials_next RENAME TO auth_credentials;
