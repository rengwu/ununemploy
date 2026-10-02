CREATE TABLE board_queue (
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  document TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  discovered_at TEXT NOT NULL,
  seen_at TEXT NOT NULL,
  checked_at TEXT,
  retry_at TEXT,
  error TEXT,
  PRIMARY KEY (source_id, url)
);
CREATE INDEX board_queue_due ON board_queue(source_id, state, retry_at, discovered_at);
