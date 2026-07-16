import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { storeAppsTable } from "./store-apps";

export const storeAppVersionsTable = pgTable("store_app_versions", {
  id: serial("id").primaryKey(),
  appId: integer("app_id").notNull().references(() => storeAppsTable.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  releaseNotes: text("release_notes"),
  fileUrl: text("file_url"),
  // pending | live | deprecated
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
