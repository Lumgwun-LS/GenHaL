import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { storeAppsTable } from "./store-apps";

export const storeAppSubscribersTable = pgTable("store_app_download_subscribers", {
  id:           serial("id").primaryKey(),
  appId:        integer("app_id").notNull().references(() => storeAppsTable.id, { onDelete: "cascade" }),
  email:        text("email").notNull(),
  subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
}, (t) => [unique("store_app_download_subscribers_app_id_email_key").on(t.appId, t.email)]);
