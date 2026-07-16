import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { storeDeveloperAccountsTable } from "./store-developer-accounts";

export const storeLinkedAccountsTable = pgTable("store_linked_accounts", {
  id: serial("id").primaryKey(),
  developerId: integer("developer_id")
    .notNull()
    .references(() => storeDeveloperAccountsTable.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // github | gitlab | gitbucket | bitbucket | heroku | netlify | vercel | render
  username: text("username"),
  displayName: text("display_name"),
  accessToken: text("access_token").notNull(), // AES-256-GCM encrypted
  instanceUrl: text("instance_url"), // for self-hosted GitLab / Gitbucket
  avatarUrl: text("avatar_url"),
  verified: boolean("verified").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
