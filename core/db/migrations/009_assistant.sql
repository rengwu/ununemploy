ALTER TABLE profile_turns ADD COLUMN engine TEXT NOT NULL DEFAULT 'profile';
ALTER TABLE profile_turns ADD COLUMN context TEXT NOT NULL DEFAULT '{}';
ALTER TABLE profile_turns ADD COLUMN activity TEXT;
ALTER TABLE profile_turns ADD COLUMN receipts TEXT NOT NULL DEFAULT '[]';
CREATE TABLE assistant_steps (
  turn_id TEXT NOT NULL REFERENCES profile_turns(id),
  sequence INTEGER NOT NULL,
  tool TEXT NOT NULL,
  arguments TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(turn_id, sequence)
);
