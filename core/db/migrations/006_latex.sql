CREATE TABLE latex_versions (
  version INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  restored_from INTEGER REFERENCES latex_versions(version)
);
CREATE TABLE latex_builds (
  source_hash TEXT PRIMARY KEY,
  pdf BLOB NOT NULL,
  diagnostics TEXT NOT NULL,
  created_at TEXT NOT NULL
);
