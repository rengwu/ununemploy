CREATE TABLE cover_letter_versions (id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), version INTEGER NOT NULL, document TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(job_id,version));
CREATE INDEX idx_cover_letters_job ON cover_letter_versions(job_id, version DESC);
CREATE TRIGGER cover_letters_revision_insert AFTER INSERT ON cover_letter_versions BEGIN UPDATE data_revisions SET version=version+1 WHERE name='jobs'; END;
CREATE TRIGGER cover_letters_revision_update AFTER UPDATE ON cover_letter_versions BEGIN UPDATE data_revisions SET version=version+1 WHERE name='jobs'; END;
CREATE TRIGGER cover_letters_revision_delete AFTER DELETE ON cover_letter_versions BEGIN UPDATE data_revisions SET version=version+1 WHERE name='jobs'; END;
