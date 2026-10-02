CREATE TABLE profile_messages (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  turn_id TEXT,
  kind TEXT NOT NULL DEFAULT 'chat'
);
CREATE TABLE profile_turns (
  id TEXT PRIMARY KEY,
  user_message_id TEXT NOT NULL UNIQUE REFERENCES profile_messages(id),
  state TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  result_revision INTEGER,
  usage TEXT
);
CREATE UNIQUE INDEX profile_one_active_turn ON profile_turns((1)) WHERE state IN ('queued','running');
CREATE TABLE profile_changes (
  revision INTEGER PRIMARY KEY REFERENCES profile_versions(revision),
  previous_revision INTEGER NOT NULL,
  message_id TEXT REFERENCES profile_messages(id),
  document TEXT NOT NULL,
  created_at TEXT NOT NULL
);
