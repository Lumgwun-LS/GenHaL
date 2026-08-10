---
name: GenHaL Language Corpus & ML Pipeline
description: DB tables, API routes, and Vertex AI integration for the language corpus system.
---

## Tables
- `genhal_language_datasets` — bulk corpus materials (bible/audio/video/text/image); status, approvedForTraining toggle gates training eligibility; migration 0123.
- `genhal_training_runs` — training job records; platformJobId holds Vertex AI resource name (e.g. `projects/P/locations/R/customJobs/ID`).

## Routes (all under `genhal-corpus.ts`, mounted in routes/index.ts)
- `POST /genhal/corpus/upload-url` → presigned PUT URL via ObjectStorageService
- `GET/POST/PATCH/DELETE /genhal/corpus/datasets` — CRUD
- `GET/POST /genhal/corpus/training` — list + launch
- `GET /genhal/corpus/training/:id` — polls Vertex AI live on queued/running jobs
- `POST /genhal/corpus/training/:id/cancel` — calls Vertex AI cancel
- `GET /genhal/corpus/stats`

## Vertex AI integration pattern
- Auth: parse `GCS_SERVICE_ACCOUNT_KEY` JSON → RS256-sign a JWT → exchange for OAuth2 token
- Job creation: `POST https://{REGION}-aiplatform.googleapis.com/v1/projects/{PROJECT}/locations/{REGION}/customJobs`
- Job state polling: `GET https://aiplatform.googleapis.com/v1/{resourceName}`
- Manifest (JSONL) uploaded to GCS bucket before job creation
- If `GOOGLE_CLOUD_PROJECT` env var not set → job is stored as `queued` with a warning; no crash

**Why:** Vertex AI is the managed ML platform chosen by the user; they already have GCS_SERVICE_ACCOUNT_KEY.

**How to apply:** New training job types just add a different `containerUri` env var; the auth + job submission helper is generic.

## Frontend
- Route: `/corpus` (App.tsx) → `pages/corpus/index.tsx`
- Nav: "Corpus & AI" with Database icon in layout.tsx
- Three tabs: Materials (card grid + approval toggles), Upload (multi-step wizard), Training (run cards + launch dialog)
