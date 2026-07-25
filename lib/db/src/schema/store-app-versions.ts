import { pgTable, text, serial, timestamp, integer, bigint } from "drizzle-orm/pg-core";
import { storeAppsTable } from "./store-apps";

export const storeAppVersionsTable = pgTable("store_app_versions", {
  id: serial("id").primaryKey(),
  appId: integer("app_id").notNull().references(() => storeAppsTable.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  /** Integer build number — used for unambiguous ordering. Higher = newer. */
  versionCode: integer("version_code"),
  releaseNotes: text("release_notes"),
  fileUrl: text("file_url"),
  fileSize: bigint("file_size", { mode: "number" }),
  minOsVersion: text("min_os_version"),
  uploadedByClerkId: text("uploaded_by_clerk_id"),
  // pending | live | deprecated
  status: text("status").notNull().default("pending"),
  activatedAt: timestamp("activated_at"),
  activatedByClerkId: text("activated_by_clerk_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
