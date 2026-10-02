CREATE TABLE jev_assessments (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  state TEXT NOT NULL,
  document TEXT,
  error TEXT,
  updated_at TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0
);
CREATE TRIGGER jev_revision_insert AFTER INSERT ON jev_assessments BEGIN UPDATE data_revisions SET version=version+1 WHERE name='jobs'; END;
CREATE TRIGGER jev_revision_update AFTER UPDATE ON jev_assessments BEGIN UPDATE data_revisions SET version=version+1 WHERE name='jobs'; END;
CREATE TRIGGER jev_revision_delete AFTER DELETE ON jev_assessments BEGIN UPDATE data_revisions SET version=version+1 WHERE name='jobs'; END;
