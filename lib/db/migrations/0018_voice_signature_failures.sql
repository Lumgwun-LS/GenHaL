CREATE TABLE IF NOT EXISTS "voice_signature_failures" (
  "id" serial PRIMARY KEY NOT NULL,
  "reason" text NOT NULL,
  "call_sid" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
