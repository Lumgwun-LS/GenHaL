-- Architect Tools: projects, milestones, drawing revisions, contractor tasks, floor plans
CREATE TABLE IF NOT EXISTS "architect_projects" (
  "id" serial PRIMARY KEY,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "client_name" text,
  "client_email" text,
  "client_phone" text,
  "description" text,
  "project_type" text DEFAULT 'residential',
  "status" text NOT NULL DEFAULT 'planning',
  "budget" text,
  "start_date" timestamp,
  "end_date" timestamp,
  "address" text,
  "city" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "project_milestones" (
  "id" serial PRIMARY KEY,
  "project_id" integer NOT NULL REFERENCES "architect_projects"("id") ON DELETE CASCADE,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "due_date" timestamp,
  "completed_at" timestamp,
  "status" text NOT NULL DEFAULT 'pending',
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "drawing_revisions" (
  "id" serial PRIMARY KEY,
  "project_id" integer REFERENCES "architect_projects"("id") ON DELETE CASCADE,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "drawing_name" text NOT NULL,
  "version" text NOT NULL DEFAULT 'R1',
  "description" text,
  "file_url" text,
  "file_name" text,
  "status" text NOT NULL DEFAULT 'draft',
  "reviewer_notes" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "contractor_tasks" (
  "id" serial PRIMARY KEY,
  "project_id" integer REFERENCES "architect_projects"("id") ON DELETE CASCADE,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "contractor_name" text NOT NULL,
  "contractor_email" text,
  "contractor_phone" text,
  "task_name" text NOT NULL,
  "description" text,
  "start_date" timestamp,
  "end_date" timestamp,
  "status" text NOT NULL DEFAULT 'not_started',
  "cost" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "floor_plans" (
  "id" serial PRIMARY KEY,
  "project_id" integer REFERENCES "architect_projects"("id") ON DELETE CASCADE,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "data" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
