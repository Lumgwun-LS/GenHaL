ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "is_recurring" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "recurring_frequency" text;
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "next_occurrence_date" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "recurring_parent_id" integer;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recurring_parent_id_expenses_id_fk" FOREIGN KEY ("recurring_parent_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
