import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { genhalCommunitiesTable } from "./genhal-communities";
import { genhalLanguagesTable } from "./genhal-languages";

/**
 * Heritage Collector — language data contributions.
 * Each row is one recording/submission: a spoken word, sentence, story,
 * interview with an elder, a photographed artifact, or a documented place.
 * These feed the GenHaL language AI training pipeline.
 */
export const genhalLanguageRecordingsTable = pgTable("genhal_language_recordings", {
  id: serial("id").primaryKey(),

  // Contributor
  clerkUserId: text("clerk_user_id").notNull(),
  speakerName: text("speaker_name"),
  speakerAgeGroup: text("speaker_age_group"), // 'youth' | 'adult' | 'elder'

  // Context
  communityId: integer("community_id").references(() => genhalCommunitiesTable.id, { onDelete: "set null" }),
  languageCode: text("language_code").notNull().references(() => genhalLanguagesTable.code),

  // Recording type: word | sentence | story | interview | artifact | place
  type: text("type").notNull(),

  // Payload — only the relevant fields are populated per type
  textContent: text("text_content"),   // the word or sentence being recorded
  audioUrl: text("audio_url"),
  videoUrl: text("video_url"),
  photoUrl: text("photo_url"),
  transcript: text("transcript"),      // manual or auto-generated

  // Geolocation (places + artifacts)
  locationLat: numeric("location_lat"),
  locationLng: numeric("location_lng"),
  locationDescription: text("location_description"),

  // Consent & quality
  consentGiven: boolean("consent_given").default(true).notNull(),
  qualityScore: integer("quality_score"), // 1–5, set by reviewers

  // Pipeline status: pending | approved | rejected
  status: text("status").default("pending").notNull(),

  // Flexible metadata: dialect, recording device, session context, etc.
  metadata: jsonb("metadata"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
