-- Integration Error Tracker: auto-captured API failure log + vendor support reports

CREATE TABLE IF NOT EXISTS "integration_error_logs" (
  "id"            serial PRIMARY KEY,
  "vendor_id"     integer REFERENCES "vendors"("id") ON DELETE CASCADE,
  "platform"      text NOT NULL,
  "error_code"    text,
  "error_message" text NOT NULL,
  "metadata"      jsonb,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "iel_vendor_id_idx"  ON "integration_error_logs" ("vendor_id");
CREATE INDEX IF NOT EXISTS "iel_platform_idx"   ON "integration_error_logs" ("platform");
CREATE INDEX IF NOT EXISTS "iel_created_at_idx" ON "integration_error_logs" ("created_at" DESC);

CREATE TABLE IF NOT EXISTS "integration_support_reports" (
  "id"                       serial PRIMARY KEY,
  "vendor_id"                integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "error_log_id"             integer REFERENCES "integration_error_logs"("id") ON DELETE SET NULL,
  "platform"                 text NOT NULL,
  "description"              text NOT NULL,
  "status"                   text NOT NULL DEFAULT 'open',
  "admin_note"               text,
  "resolved_by_admin_id"     text,
  "resolved_by_admin_name"   text,
  "resolved_at"              timestamptz,
  "vendor_notified_at"       timestamptz,
  "created_at"               timestamptz NOT NULL DEFAULT now(),
  "updated_at"               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "isr_vendor_id_idx" ON "integration_support_reports" ("vendor_id");
CREATE INDEX IF NOT EXISTS "isr_status_idx"    ON "integration_support_reports" ("status");
CREATE INDEX IF NOT EXISTS "isr_platform_idx"  ON "integration_support_reports" ("platform");
