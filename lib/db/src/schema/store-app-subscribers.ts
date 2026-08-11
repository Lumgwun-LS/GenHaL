import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { storeAppsTable } from "./store-apps";

export const storeAppSubscribersTable = pgTable("store_app_download_subscribers", {
  id:           serial("id").primaryKey(),
  appId:        integer("app_id").notNull().references(() => storeAppsTable.id, { onDelete: "cascade" }),
  email:        text("email").notNull(),
  subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
});
