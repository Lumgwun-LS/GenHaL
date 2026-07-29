import { relations } from "drizzle-orm";
import { storeDeveloperAccountsTable } from "./store-developer-accounts";
import { storeAppsTable } from "./store-apps";
import { storeAppVersionsTable } from "./store-app-versions";
import { storeAppReviewsTable } from "./store-app-reviews";
import { storeUploadTrialsTable } from "./store-upload-trials";

export const storeDeveloperAccountsRelations = relations(storeDeveloperAccountsTable, ({ many }) => ({
  apps:          many(storeAppsTable),
  uploadTrials:  many(storeUploadTrialsTable),
}));

export const storeAppsRelations = relations(storeAppsTable, ({ one, many }) => ({
  developer: one(storeDeveloperAccountsTable, {
    fields: [storeAppsTable.developerId],
    references: [storeDeveloperAccountsTable.id],
  }),
  versions: many(storeAppVersionsTable),
  reviews: many(storeAppReviewsTable),
}));

export const storeAppVersionsRelations = relations(storeAppVersionsTable, ({ one }) => ({
  app: one(storeAppsTable, {
    fields: [storeAppVersionsTable.appId],
    references: [storeAppsTable.id],
  }),
}));

export const storeAppReviewsRelations = relations(storeAppReviewsTable, ({ one }) => ({
  app: one(storeAppsTable, {
    fields: [storeAppReviewsTable.appId],
    references: [storeAppsTable.id],
  }),
}));

export const storeUploadTrialsRelations = relations(storeUploadTrialsTable, ({ one }) => ({
  developer: one(storeDeveloperAccountsTable, {
    fields: [storeUploadTrialsTable.developerId],
    references: [storeDeveloperAccountsTable.id],
  }),
}));
