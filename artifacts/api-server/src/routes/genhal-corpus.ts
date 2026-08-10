/**
 * GenHaL Language Corpus & ML Training Pipeline
 * Manages bulk uploads, dataset curation, and Vertex AI training jobs.
 */
import { Router } from "express";
import { requireAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { genhalLanguageDatasetsTable, genhalTrainingRunsTable } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import crypto from "node:crypto";

const router = Router();
const storage = new ObjectStorageService();

// ─── Vertex AI helpers ─────────────────────────────────────────────────────────

async function getGCPAccessToken(): Promise<string | null> {
  const raw = process.env.GCS_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw);
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })).toString("base64url");
    const sigInput = `${header}.${payload}`;
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(sigInput);
    const sig = sign.sign(sa.private_key, "base64url");
    const jwt = `${sigInput}.${sig}`;

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    const data = await res.json() as any;
    return data.access_token ?? null;
  } catch (e) {
    logger.error(e, "GCP auth token error");
    return null;
  }
}

async function createVertexAIJob(opts: {
  token: string;
  project: string;
  region: string;
  jobName: string;
  languageCode: string;
  modelType: string;
  manifestUri: string;
  containerUri: string;
  config: Record<string, any>;
}): Promise<{ jobId: string; resourceName: string } | null> {
  const url = `https://${opts.region}-aiplatform.googleapis.com/v1/projects/${opts.project}/locations/${opts.region}/customJobs`;
  const body = {
    displayName: opts.jobName,
    jobSpec: {
      workerPoolSpecs: [{
        machineSpec: { machineType: "n1-standard-8", acceleratorType: "NVIDIA_TESLA_T4", acceleratorCount: 1 },
        replicaCount: 1,
        containerSpec: {
          imageUri: opts.containerUri,
          args: [
            `--language=${opts.languageCode}`,
            `--model_type=${opts.modelType}`,
            `--manifest_uri=${opts.manifestUri}`,
            `--output_dir=gs://${process.env.R2_BUCKET_NAME ?? "genhal-models"}/${opts.languageCode}/${opts.modelType}/`,
            ...Object.entries(opts.config).map(([k, v]) => `--${k}=${v}`),
          ],
        },
      }],
    },
    labels: { language: opts.languageCode, model_type: opts.modelType, platform: "genhal" },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      logger.error({ err }, "Vertex AI create job error");
      return null;
    }
    const data = await res.json() as any;
    return { jobId: data.name, resourceName: data.name };
  } catch (e) {
    logger.error(e, "Vertex AI fetch error");
    return null;
  }
}

async function getVertexAIJobStatus(token: string, resourceName: string): Promise<{
  state: string; progressPercent?: number; error?: string;
} | null> {
  try {
    const res = await fetch(`https://aiplatform.googleapis.com/v1/${resourceName}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    return {
      state: data.state ?? "JOB_STATE_UNSPECIFIED",
      progressPercent: data.modelDeploymentMonitoringJob?.nextScheduleTime ? undefined : undefined,
      error: data.error?.message,
    };
  } catch { return null; }
}

// Vertex AI state → our status
function vertexStateToStatus(state: string): string {
  const map: Record<string, string> = {
    JOB_STATE_QUEUED: "queued", JOB_STATE_PENDING: "queued",
    JOB_STATE_RUNNING: "running", JOB_STATE_SUCCEEDED: "completed",
    JOB_STATE_FAILED: "failed", JOB_STATE_CANCELLING: "running",
    JOB_STATE_CANCELLED: "cancelled",
  };
  return map[state] ?? "queued";
}

// ─── Presigned upload URL ──────────────────────────────────────────────────────

router.post("/genhal/corpus/upload-url", requireAuth(), async (req, res) => {
  const { languageCode, type, fileName, mimeType } = req.body;
  if (!languageCode || !type || !fileName) return res.status(400).json({ error: "languageCode, type, fileName required" });

  const ext  = fileName.split(".").pop() ?? "bin";
  const key  = `genhal/corpus/${languageCode}/${type}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  try {
    const { uploadUrl, publicUrl } = await storage.getUploadUrl(key, mimeType ?? "application/octet-stream");
    res.json({ uploadUrl, fileUrl: publicUrl, key });
  } catch (err) {
    logger.error(err, "corpus/upload-url error");
    res.status(500).json({ error: "Failed to create upload URL" });
  }
});

// ─── Dataset CRUD ──────────────────────────────────────────────────────────────

router.get("/genhal/corpus/datasets", requireAuth(), async (req, res) => {
  const { languageCode, type, status, approved } = req.query as Record<string, string>;
  try {
    const conditions = [];
    if (languageCode) conditions.push(eq(genhalLanguageDatasetsTable.languageCode, languageCode));
    if (type)         conditions.push(eq(genhalLanguageDatasetsTable.type, type));
    if (status)       conditions.push(eq(genhalLanguageDatasetsTable.status, status));
    if (approved === "true")  conditions.push(eq(genhalLanguageDatasetsTable.approvedForTraining, true));
    if (approved === "false") conditions.push(eq(genhalLanguageDatasetsTable.approvedForTraining, false));

    const rows = await db
      .select()
      .from(genhalLanguageDatasetsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(genhalLanguageDatasetsTable.createdAt))
      .limit(200);

    res.json(rows);
  } catch (err) {
    logger.error(err, "corpus/datasets GET error");
    res.status(500).json({ error: "Failed to fetch datasets" });
  }
});

router.post("/genhal/corpus/datasets", requireAuth(), async (req, res) => {
  const userId = req.auth?.userId;
  const body = req.body;
  if (!body.languageCode || !body.type || !body.title || !body.fileUrl || !body.fileName)
    return res.status(400).json({ error: "languageCode, type, title, fileUrl, fileName required" });

  try {
    const [row] = await db.insert(genhalLanguageDatasetsTable).values({
      clerkUserId: userId!,
      languageCode: body.languageCode,
      communityId: body.communityId ? Number(body.communityId) : null,
      type: body.type,
      title: body.title,
      description: body.description ?? null,
      fileUrl: body.fileUrl,
      fileName: body.fileName,
      fileMimeType: body.fileMimeType ?? null,
      fileSizeBytes: body.fileSizeBytes ? Number(body.fileSizeBytes) : null,
      durationSeconds: body.durationSeconds ? Number(body.durationSeconds) : null,
      pageCount: body.pageCount ? Number(body.pageCount) : null,
      wordCount: body.wordCount ? Number(body.wordCount) : null,
      status: "ready",
      metadata: body.metadata ?? null,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    logger.error(err, "corpus/datasets POST error");
    res.status(500).json({ error: "Failed to register dataset" });
  }
});

router.patch("/genhal/corpus/datasets/:id", requireAuth(), async (req, res) => {
  const id = Number(req.params.id);
  const { status, approvedForTraining, title, description, processingNotes } = req.body;
  try {
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (status !== undefined)              updates.status = status;
    if (approvedForTraining !== undefined) updates.approvedForTraining = Boolean(approvedForTraining);
    if (title !== undefined)               updates.title = title;
    if (description !== undefined)         updates.description = description;
    if (processingNotes !== undefined)     updates.processingNotes = processingNotes;

    const [row] = await db.update(genhalLanguageDatasetsTable)
      .set(updates)
      .where(eq(genhalLanguageDatasetsTable.id, id))
      .returning();
    res.json(row);
  } catch (err) {
    logger.error(err, "corpus/datasets PATCH error");
    res.status(500).json({ error: "Failed to update dataset" });
  }
});

router.delete("/genhal/corpus/datasets/:id", requireAuth(), async (req, res) => {
  const id = Number(req.params.id);
  try {
    await db.delete(genhalLanguageDatasetsTable).where(eq(genhalLanguageDatasetsTable.id, id));
    res.status(204).send();
  } catch (err) {
    logger.error(err, "corpus/datasets DELETE error");
    res.status(500).json({ error: "Failed to delete dataset" });
  }
});

// ─── Training runs ────────────────────────────────────────────────────────────

router.get("/genhal/corpus/training", requireAuth(), async (req, res) => {
  const { languageCode, status } = req.query as Record<string, string>;
  try {
    const conditions = [];
    if (languageCode) conditions.push(eq(genhalTrainingRunsTable.languageCode, languageCode));
    if (status)       conditions.push(eq(genhalTrainingRunsTable.status, status));
    const rows = await db.select().from(genhalTrainingRunsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(genhalTrainingRunsTable.createdAt))
      .limit(100);
    res.json(rows);
  } catch (err) {
    logger.error(err, "corpus/training GET error");
    res.status(500).json({ error: "Failed to fetch training runs" });
  }
});

router.get("/genhal/corpus/training/:id", requireAuth(), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const [run] = await db.select().from(genhalTrainingRunsTable)
      .where(eq(genhalTrainingRunsTable.id, id));
    if (!run) return res.status(404).json({ error: "Not found" });

    // Poll live status from Vertex AI if running
    if (run.platformJobId && ["queued", "running"].includes(run.status)) {
      const token = await getGCPAccessToken();
      if (token) {
        const liveStatus = await getVertexAIJobStatus(token, run.platformJobId);
        if (liveStatus) {
          const newStatus = vertexStateToStatus(liveStatus.state);
          const updates: Record<string, any> = { status: newStatus, updatedAt: new Date() };
          if (liveStatus.error) updates.errorMessage = liveStatus.error;
          if (newStatus === "completed") updates.completedAt = new Date();
          if (newStatus === "running" && !run.startedAt) updates.startedAt = new Date();
          await db.update(genhalTrainingRunsTable).set(updates).where(eq(genhalTrainingRunsTable.id, id));
          return res.json({ ...run, ...updates });
        }
      }
    }
    res.json(run);
  } catch (err) {
    logger.error(err, "corpus/training/:id GET error");
    res.status(500).json({ error: "Failed to fetch training run" });
  }
});

router.post("/genhal/corpus/training", requireAuth(), async (req, res) => {
  const userId = req.auth?.userId;
  const { name, languageCode, modelType, datasetIds, platformType, config } = req.body;

  if (!languageCode || !modelType || !datasetIds?.length || !name)
    return res.status(400).json({ error: "name, languageCode, modelType, datasetIds required" });

  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const region  = process.env.VERTEX_AI_REGION ?? "us-central1";
  const containerUri = process.env.VERTEX_AI_TRAINING_IMAGE ?? "us-docker.pkg.dev/vertex-ai/training/pytorch-gpu.2-0:latest";

  try {
    // Fetch approved datasets
    const datasets = await db.select().from(genhalLanguageDatasetsTable)
      .where(and(
        inArray(genhalLanguageDatasetsTable.id, datasetIds.map(Number)),
        eq(genhalLanguageDatasetsTable.approvedForTraining, true),
      ));

    if (!datasets.length)
      return res.status(400).json({ error: "No approved datasets found for the given IDs" });

    // Build manifest
    const manifest = {
      languageCode,
      modelType,
      exportedAt: new Date().toISOString(),
      items: datasets.map(d => ({
        id: d.id, type: d.type, title: d.title,
        fileUrl: d.fileUrl, fileName: d.fileName, fileMimeType: d.fileMimeType,
        fileSizeBytes: d.fileSizeBytes, durationSeconds: d.durationSeconds,
        wordCount: d.wordCount,
      })),
    };

    // Insert run record first (queued)
    const [run] = await db.insert(genhalTrainingRunsTable).values({
      clerkUserId: userId!,
      name,
      languageCode,
      modelType,
      platformType: platformType ?? "vertex_ai",
      status: "queued",
      datasetIds: datasetIds.map(Number),
      config: config ?? {},
    }).returning();

    // If Vertex AI is configured, submit the job
    if (project) {
      const token = await getGCPAccessToken();
      if (token) {
        // Upload manifest to GCS
        const manifestKey = `genhal/manifests/${languageCode}/${modelType}/${run.id}.json`;
        const sa = JSON.parse(process.env.GCS_SERVICE_ACCOUNT_KEY!);
        const bucket = process.env.GCS_BUCKET_NAME ?? sa.project_id;
        const gcsUploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(manifestKey)}`;

        try {
          await fetch(gcsUploadUrl, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(manifest),
          });
        } catch (e) {
          logger.warn(e, "Failed to upload manifest to GCS, continuing without it");
        }

        const manifestUri = `gs://${bucket}/${manifestKey}`;
        const jobName = `genhal-${languageCode}-${modelType}-${run.id}`;
        const job = await createVertexAIJob({
          token, project, region, jobName,
          languageCode, modelType,
          manifestUri,
          containerUri,
          config: config ?? {},
        });

        if (job) {
          await db.update(genhalTrainingRunsTable).set({
            platformJobId: job.jobId,
            platformJobName: jobName,
            datasetManifestUri: manifestUri,
            status: "running",
            startedAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(genhalTrainingRunsTable.id, run.id));
          return res.status(201).json({ ...run, platformJobId: job.jobId, status: "running" });
        } else {
          await db.update(genhalTrainingRunsTable).set({
            status: "failed",
            errorMessage: "Failed to submit Vertex AI job. Check GOOGLE_CLOUD_PROJECT and GCS_SERVICE_ACCOUNT_KEY.",
            updatedAt: new Date(),
          }).where(eq(genhalTrainingRunsTable.id, run.id));
          return res.status(201).json({ ...run, status: "failed", errorMessage: "Vertex AI submission failed" });
        }
      }
    }

    // No GCP project configured — job stays queued with manifest data
    const manifestJson = JSON.stringify(manifest, null, 2);
    await db.update(genhalTrainingRunsTable).set({
      processingNotes: "GOOGLE_CLOUD_PROJECT not configured. Job queued locally.",
      updatedAt: new Date(),
    } as any).where(eq(genhalTrainingRunsTable.id, run.id));

    res.status(201).json({
      ...run,
      _warning: "Vertex AI not configured. Set GOOGLE_CLOUD_PROJECT and VERTEX_AI_REGION to submit jobs automatically.",
      manifest,
    });
  } catch (err) {
    logger.error(err, "corpus/training POST error");
    res.status(500).json({ error: "Failed to create training run" });
  }
});

router.post("/genhal/corpus/training/:id/cancel", requireAuth(), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const [run] = await db.select().from(genhalTrainingRunsTable)
      .where(eq(genhalTrainingRunsTable.id, id));
    if (!run) return res.status(404).json({ error: "Not found" });

    if (run.platformJobId) {
      const token = await getGCPAccessToken();
      if (token) {
        await fetch(`https://aiplatform.googleapis.com/v1/${run.platformJobId}:cancel`, {
          method: "POST", headers: { Authorization: `Bearer ${token}` },
        });
      }
    }

    const [updated] = await db.update(genhalTrainingRunsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(genhalTrainingRunsTable.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    logger.error(err, "corpus/training cancel error");
    res.status(500).json({ error: "Failed to cancel" });
  }
});

// ─── Stats ────────────────────────────────────────────────────────────────────

router.get("/genhal/corpus/stats", requireAuth(), async (_req, res) => {
  try {
    const [totalMaterials] = await db.select({ c: sql<number>`count(*)::int` }).from(genhalLanguageDatasetsTable);
    const [approved]       = await db.select({ c: sql<number>`count(*)::int` }).from(genhalLanguageDatasetsTable).where(eq(genhalLanguageDatasetsTable.approvedForTraining, true));
    const [totalRuns]      = await db.select({ c: sql<number>`count(*)::int` }).from(genhalTrainingRunsTable);
    const [completedRuns]  = await db.select({ c: sql<number>`count(*)::int` }).from(genhalTrainingRunsTable).where(eq(genhalTrainingRunsTable.status, "completed"));

    const byType = await db
      .select({ type: genhalLanguageDatasetsTable.type, c: sql<number>`count(*)::int` })
      .from(genhalLanguageDatasetsTable)
      .groupBy(genhalLanguageDatasetsTable.type);

    const vertexConfigured = !!(process.env.GOOGLE_CLOUD_PROJECT);

    res.json({
      totalMaterials: totalMaterials.c,
      approvedMaterials: approved.c,
      totalRuns: totalRuns.c,
      completedRuns: completedRuns.c,
      byType: Object.fromEntries(byType.map(r => [r.type, r.c])),
      vertexConfigured,
      gcpProject: process.env.GOOGLE_CLOUD_PROJECT ?? null,
      vertexRegion: process.env.VERTEX_AI_REGION ?? "us-central1",
    });
  } catch (err) {
    logger.error(err, "corpus/stats error");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
