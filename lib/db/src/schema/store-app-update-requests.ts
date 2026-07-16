import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { storeAppsTable } from "./store-apps";
import { storeDeveloperAccountsTable } from "./store-developer-accounts";
import { storeAppRepoLinksTable } from "./store-app-repo-links";

export const storeAppUpdateRequestsTable = pgTable("store_app_update_requests", {
  id: serial("id").primaryKey(),
  appId: integer("app_id")
    .notNull()
    .references(() => storeAppsTable.id, { onDelete: "cascade" }),
  developerId: integer("developer_id")
    .notNull()
    .references(() => storeDeveloperAccountsTable.id, { onDelete: "cascade" }),
  repoLinkId: integer("repo_link_id")
    .references(() => storeAppRepoLinksTable.id, { onDelete: "set null" }),
  platform: text("platform").notNull(),
  repoPath: text("repo_path"),
  commitSha: text("commit_sha"),
  commitMessage: text("commit_message"),
  commitUrl: text("commit_url"),
  commitAuthor: text("commit_author"),
  newVersion: text("new_version"),
  newDownloadUrl: text("new_download_url"),
  newDescription: text("new_description"),
  changesSummary: text("changes_summary"),
  // pending | approved | rejected | cancelled
  status: text("status").default("pending").notNull(),
  adminUserId: text("admin_user_id"),
  adminNote: text("admin_note"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
