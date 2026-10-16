CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  owner_sub TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 8388608),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  analysis_json TEXT CHECK (analysis_json IS NULL OR json_valid(analysis_json))
);
CREATE INDEX IF NOT EXISTS images_owner_created ON images(owner_sub, created_at DESC, id DESC);
