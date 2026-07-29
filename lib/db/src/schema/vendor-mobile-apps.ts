import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";
import { storeAppsTable } from "./store-apps";

export const vendorMobileAppsTable = pgTable("vendor_mobile_apps", {
  id:            serial("id").primaryKey(),
  vendorId:      integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),

  // Source of app content
  source:        text("source").notNull().default("website"), // website | github | gitlab | bitbucket
  websiteUrl:    text("website_url"),   // used when source=website
  repoUrl:       text("repo_url"),      // used when source=github|gitlab|bitbucket
  repoBranch:    text("repo_branch"),

  // Generated app identity
  appName:       text("app_name").notNull(),
  appSlug:       text("app_slug").notNull(),        // e.g. vendor-abc-app
  packageName:   text("package_name").notNull(),    // e.g. com.awajimaa.vendor_abc
  iconUrl:       text("icon_url"),
  splashUrl:     text("splash_url"),

  // EAS build tracking
  easProjectId:  text("eas_project_id"),
  easBuildId:    text("eas_build_id"),
  apkUrl:        text("apk_url"),

  // App Store link (set once published)
  storeAppId:    integer("store_app_id").references(() => storeAppsTable.id, { onDelete: "set null" }),

  // Lifecycle: queued | building | packaging | published | failed
  status:        text("status").notNull().default("queued"),
  errorMessage:  text("error_message"),

  // Polling — background job sets this after checking EAS
  lastCheckedAt: timestamp("last_checked_at"),

  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
});
