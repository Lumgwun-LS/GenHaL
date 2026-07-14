ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "source_post_id" integer;
DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_source_post_id_posts_id_fk" FOREIGN KEY ("source_post_id") REFERENCES "public"."posts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
