ALTER TABLE source_items ADD COLUMN document TEXT;
ALTER TABLE source_items ADD COLUMN content_hash TEXT;
ALTER TABLE source_items ADD COLUMN first_seen_at TEXT;
ALTER TABLE source_items ADD COLUMN changed_at TEXT;
ALTER TABLE source_items ADD COLUMN missing_at TEXT;
CREATE TABLE source_item_versions (
  source_id TEXT NOT NULL,
  source_item_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  document TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  PRIMARY KEY(source_id, source_item_id, content_hash)
);
