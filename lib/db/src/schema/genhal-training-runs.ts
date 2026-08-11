import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const genhalTrainingRunsTable = pgTable("genhal_training_runs", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  name: text("name").notNull(),
  languageCode: text("language_code").notNull(),
  modelType: text("model_type").notNull(), // 'asr' | 'lm' | 'tts' | 'full'
  platformType: text("platform_type").notNull().default("vertex_ai"), // vertex_ai | sagemaker | azure_ml
  platformJobId: text("platform_job_id"),       // Vertex AI job resource name
  platformJobName: text("platform_job_name"),   // human-readable display name
  status: text("status").notNull().default("queued"), // queued | running | completed | failed | cancelled
  datasetIds: jsonb("dataset_ids").notNull().default("[]"),
  datasetManifestUri: text("dataset_manifest_uri"), // GCS URI of exported manifest
  outputModelUri: text("output_model_uri"),          // GCS URI of trained model artefacts
  errorMessage: text("error_message"),
  progressPercent: integer("progress_percent").default(0),
  estimatedCompletionAt: timestamp("estimated_completion_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  config: jsonb("config"),     // training hyperparameters / options
  metrics: jsonb("metrics"),   // loss, WER, BLEU, etc. after completion
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
