import { pgTable, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

/**
 * Stores the in-progress video scene draft for a vendor so that if they
 * accidentally navigate away mid-review (and confirm leaving despite the guard),
 * their edited scene prompts and generated image URLs are not lost. The draft
 * is upserted on every scene state change and deleted after the vendor renders
 * or discards the scenes.
 *
 * One row per vendor (vendorId is the primary key). The `scenes` column is a
 * JSON array of { id, prompt, imageUrl } objects, mirroring the frontend's
 * videoScenes state.
 */
export const draftVideoScenesTable = pgTable("draft_video_scenes", {
  vendorId: integer("vendor_id")
    .primaryKey()
    .references(() => vendorsTable.id, { onDelete: "cascade" }),
  scenes: jsonb("scenes")
    .$type<{ id: number; prompt: string; imageUrl: string }[]>()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DraftVideoScenes = typeof draftVideoScenesTable.$inferSelect;
