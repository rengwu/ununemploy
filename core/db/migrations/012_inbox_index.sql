-- Avoid sorting full JSON documents in a temporary B-tree for each inbox snapshot.
CREATE INDEX idx_jobs_first_seen ON jobs(first_seen_at DESC);
-- Bootstrap only needs document choices for saved jobs and existing letters.
CREATE INDEX idx_jobs_saved_documents ON jobs(id)
  WHERE json_extract(document, '$.savedAt') IS NOT NULL;
