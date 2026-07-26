CREATE TABLE IF NOT EXISTS "business_swot_reports" (
  "id" serial PRIMARY KEY NOT NULL,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "health_score" numeric(5, 2) NOT NULL DEFAULT 0,
  "score_breakdown" jsonb NOT NULL DEFAULT '{}',
  "swot_report" jsonb NOT NULL,
  "snapshot_json" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "business_swot_reports_vendor_id_idx"
  ON "business_swot_reports" ("vendor_id");
