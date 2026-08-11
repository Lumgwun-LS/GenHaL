-- genhal_language_datasets: bulk language corpus materials
CREATE TABLE IF NOT EXISTS genhal_language_datasets (
  id                   SERIAL PRIMARY KEY,
  clerk_user_id        TEXT        NOT NULL,
  language_code        TEXT        NOT NULL,
  community_id         INTEGER,
  type                 TEXT        NOT NULL,
  title                TEXT        NOT NULL,
  description          TEXT,
  file_url             TEXT        NOT NULL,
  file_name            TEXT        NOT NULL,
  file_mime_type       TEXT,
  file_size_bytes      INTEGER,
  duration_seconds     INTEGER,
  page_count           INTEGER,
  word_count           INTEGER,
  status               TEXT        NOT NULL DEFAULT 'pending',
  approved_for_training BOOLEAN    NOT NULL DEFAULT FALSE,
  processing_notes     TEXT,
  metadata             JSONB,
  created_at           TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_genhal_datasets_language  ON genhal_language_datasets (language_code);
CREATE INDEX IF NOT EXISTS idx_genhal_datasets_type      ON genhal_language_datasets (type);
CREATE INDEX IF NOT EXISTS idx_genhal_datasets_status    ON genhal_language_datasets (status);
CREATE INDEX IF NOT EXISTS idx_genhal_datasets_user      ON genhal_language_datasets (clerk_user_id);

-- genhal_training_runs: ML training job records
CREATE TABLE IF NOT EXISTS genhal_training_runs (
  id                      SERIAL PRIMARY KEY,
  clerk_user_id           TEXT        NOT NULL,
  name                    TEXT        NOT NULL,
  language_code           TEXT        NOT NULL,
  model_type              TEXT        NOT NULL,
  platform_type           TEXT        NOT NULL DEFAULT 'vertex_ai',
  platform_job_id         TEXT,
  platform_job_name       TEXT,
  status                  TEXT        NOT NULL DEFAULT 'queued',
  dataset_ids             JSONB       NOT NULL DEFAULT '[]',
  dataset_manifest_uri    TEXT,
  output_model_uri        TEXT,
  error_message           TEXT,
  progress_percent        INTEGER     DEFAULT 0,
  estimated_completion_at TIMESTAMP,
  started_at              TIMESTAMP,
  completed_at            TIMESTAMP,
  config                  JSONB,
  metrics                 JSONB,
  created_at              TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_genhal_runs_language  ON genhal_training_runs (language_code);
CREATE INDEX IF NOT EXISTS idx_genhal_runs_status    ON genhal_training_runs (status);
CREATE INDEX IF NOT EXISTS idx_genhal_runs_user      ON genhal_training_runs (clerk_user_id);
