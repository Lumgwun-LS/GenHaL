import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { storeDeveloperAccountsTable } from "./store-developer-accounts";
import { storeAppsTable } from "./store-apps";

export interface AiLaunchGeneratedData {
  name?: string;
  tagline?: string;
  description?: string;
  category?: string;
  platform?: string;
  keywords?: string[];
  features?: string[];
  iconUrl?: string;
  screenshots?: string[];
  downloadUrl?: string;
  webUrl?: string;
  currentVersion?: string;
  packageName?: string;
}

export interface AiLaunchExtractedFiles {
  manifest?: Record<string, unknown>;
  iconObjectPath?: string;
  iconUrl?: string;
  screenshotObjectPaths?: string[];
  screenshotUrls?: string[];
  promoObjectPaths?: string[];
}

export const storeAiLaunchSessionsTable = pgTable("store_ai_launch_sessions", {
  id: serial("id").primaryKey(),
  developerId: integer("developer_id").notNull().references(() => storeDeveloperAccountsTable.id, { onDelete: "cascade" }),
  // Status: uploading | processing | ready | failed | submitted
  status: text("status").notNull().default("uploading"),
  errorMessage: text("error_message"),
  extractedFiles: jsonb("extracted_files").$type<AiLaunchExtractedFiles>(),
  aiGenerated: jsonb("ai_generated").$type<AiLaunchGeneratedData>(),
  // Set when developer submits the reviewed listing
  appId: integer("app_id").references(() => storeAppsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
