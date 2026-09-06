ALTER TABLE account_state
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0);
