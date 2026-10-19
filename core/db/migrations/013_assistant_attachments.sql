CREATE TABLE assistant_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT REFERENCES profile_messages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  data BLOB NOT NULL,
  extracted_text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX assistant_attachments_message ON assistant_attachments(message_id);
