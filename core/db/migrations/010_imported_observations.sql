-- Listing evidence belongs to a backed-up job, not to source configuration.
CREATE TABLE imported_observations (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  document TEXT NOT NULL
);
