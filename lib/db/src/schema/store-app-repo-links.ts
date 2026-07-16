import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { storeAppsTable } from "./store-apps";
import { storeLinkedAccountsTable } from "./store-linked-accounts";

export const storeAppRepoLinksTable = pgTable("store_app_repo_links", {
  id: serial("id").primaryKey(),
  appId: integer("app_id")
    .notNull()
    .references(() => storeAppsTable.id, { onDelete: "cascade" }),
  linkedAccountId: integer("linked_account_id")
    .notNull()
    .references(() => storeLinkedAccountsTable.id, { onDelete: "cascade" }),
  repoPath: text("repo_path").notNull(), // "owner/repo" or platform-specific ID
  branch: text("branch").default("main"),
  deploymentUrl: text("deployment_url"), // for Heroku/Netlify/Vercel live URL
  lastCommitSha: text("last_commit_sha"),
  lastCommitMessage: text("last_commit_message"),
  lastCommitAuthor: text("last_commit_author"),
  lastCommitUrl: text("last_commit_url"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
