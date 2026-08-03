/**
 * Website-to-App Generator — GitHub Actions backend
 *
 * Triggers the build-apk.yml workflow on the configured Android template repo
 * via workflow_dispatch. Returns the GitHub Actions run ID so the background
 * scheduler can poll for completion.
 *
 * Required env vars:
 *   GITHUB_ACTIONS_TOKEN        — PAT with repo + workflow scopes
 *   GITHUB_ANDROID_REPO_OWNER   — GitHub org / user that owns the template repo
 *   GITHUB_ANDROID_REPO_NAME    — repo name e.g. awajimaa-android-template
 *   MOBILE_APP_CALLBACK_SECRET  — shared secret sent as X-Callback-Secret
 */

import { logger } from "./logger";

const GH_API = "https://api.github.com";
const WORKFLOW_FILE = "build-apk.yml";

// ── helpers ──────────────────────────────────────────────────────────────────

export function toAppSlug(name: string, vendorId: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
  return `${base}_${vendorId}`;
}

export function toPackageName(slug: string): string {
  return `com.awajimaa.${slug.replace(/-/g, "_")}`;
}

function ghHeaders(): Record<string, string> {
  const token = process.env.GITHUB_ACTIONS_TOKEN ?? "";
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

function repoBase(): string {
  const owner = process.env.GITHUB_ANDROID_REPO_OWNER ?? "";
  const repo  = process.env.GITHUB_ANDROID_REPO_NAME  ?? "";
  if (!owner || !repo) throw new Error("GITHUB_ANDROID_REPO_OWNER / GITHUB_ANDROID_REPO_NAME not set");
  return `${GH_API}/repos/${owner}/${repo}`;
}

function callbackBase(): string {
  const domain =
    process.env.PUBLIC_APP_DOMAIN ??
    process.env.REPLIT_DEV_DOMAIN;
  if (!domain) throw new Error("No public domain set (PUBLIC_APP_DOMAIN / REPLIT_DEV_DOMAIN)");
  return `https://${domain}/api`;
}

// ── public API ───────────────────────────────────────────────────────────────

export interface GenerateAppOptions {
  recordId:   number;
  vendorId:   number;
  vendorName: string;
  websiteUrl: string;
  iconUrl?:   string | null;
  appName?:   string;
}

export interface GenerateAppResult {
  slug:        string;
  packageName: string;
  /** GitHub Actions run ID (stored in easBuildId column) */
  runId: string;
}

/**
 * Dispatches the build-apk workflow on GitHub Actions.
 * Returns within ~5 seconds with the run ID; the actual build takes 15-20 min.
 */
export async function generateVendorApp(opts: GenerateAppOptions): Promise<GenerateAppResult> {
  const { recordId, vendorId, vendorName, websiteUrl, iconUrl } = opts;
  const appName    = (opts.appName ?? vendorName).slice(0, 30);
  const slug       = toAppSlug(vendorName, vendorId);
  const packageName = toPackageName(slug);
  const base       = repoBase();
  const secret     = process.env.MOBILE_APP_CALLBACK_SECRET ?? "";
  const callback   = callbackBase();

  // ── Dispatch workflow_dispatch ─────────────────────────────────────────────
  logger.info({ slug, recordId }, "[app-generator] Dispatching GitHub Actions build");

  // Capture before dispatch so we can filter runs created >= this time (race-condition fix)
  const dispatchTime = new Date();

  const dispatchRes = await fetch(`${base}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
    method:  "POST",
    headers: ghHeaders(),
    body: JSON.stringify({
      ref: "main",
      inputs: {
        record_id:       String(recordId),
        app_name:        appName,
        package_name:    packageName,
        website_url:     websiteUrl,
        icon_url:        iconUrl ?? "",
        callback_url:    callback,
        callback_secret: secret,
      },
    }),
  });

  if (!dispatchRes.ok) {
    const body = await dispatchRes.text().catch(() => "");
    throw new Error(
      `GitHub Actions dispatch failed (${dispatchRes.status}): ${body.slice(0, 400)}\n` +
      "Check GITHUB_ACTIONS_TOKEN, GITHUB_ANDROID_REPO_OWNER, GITHUB_ANDROID_REPO_NAME.",
    );
  }

  // ── Reliably resolve our run ID ────────────────────────────────────────────
  //
  // Strategy: filter runs by created_at >= (dispatchTime - buffer), then pick
  // the newest non-completed candidate. This avoids the race where two nearly
  // simultaneous dispatches each pick up the other's run via a naive "latest" query.
  //
  // We capture dispatchedAfter *before* the fetch (with a 3 s clock-skew buffer)
  // so that any run registered by GitHub after our POST is included.
  const dispatchedAfter = new Date(dispatchTime.getTime() - 3_000);
  // GitHub search filter format: ">=ISO_DATE"
  const createdFilter = encodeURIComponent(`>=${dispatchedAfter.toISOString().replace(/\.\d+Z$/, "Z")}`);

  let runId = "pending";

  // Poll up to 6 times × 5 s = 30 s. GitHub can take several seconds to register a queued run.
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise<void>((r) => setTimeout(r, 5_000));

    const runsRes = await fetch(
      `${base}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=10&event=workflow_dispatch&created=${createdFilter}`,
      { headers: ghHeaders() },
    );

    if (!runsRes.ok) {
      logger.warn({ status: runsRes.status, attempt }, "[app-generator] Run-list fetch failed (will retry)");
      continue;
    }

    const runsData = await runsRes.json() as {
      workflow_runs?: Array<{ id: number; status: string; created_at: string }>;
    };

    // Prefer runs that are still in flight (queued / in_progress / waiting)
    const candidates = (runsData.workflow_runs ?? []).filter(
      (r) => r.status !== "completed",
    );

    if (candidates.length > 0) {
      // Most recently created = ours (dispatched just now)
      candidates.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      runId = String(candidates[0].id);
      break;
    }

    logger.debug({ attempt }, "[app-generator] No in-flight run yet — retrying");
  }

  if (runId === "pending") {
    // Non-fatal — the build-scheduler will still detect the run via its own periodic poll
    logger.warn({ slug, recordId }, "[app-generator] Could not resolve GitHub run ID after 30 s; storing 'pending'");
  }

  logger.info({ slug, recordId, runId }, "[app-generator] GitHub Actions run queued");
  return { slug, packageName, runId };
}

// ── Status polling (used by scheduler) ───────────────────────────────────────

export async function checkGitHubRunStatus(runId: string): Promise<{
  status: "in_progress" | "finished" | "failed";
  errorMessage?: string;
}> {
  if (!runId || runId === "pending") return { status: "in_progress" };

  try {
    const res = await fetch(`${repoBase()}/actions/runs/${runId}`, { headers: ghHeaders() });
    if (!res.ok) {
      logger.warn({ runId, status: res.status }, "[app-generator] GitHub run status fetch failed");
      return { status: "in_progress" };
    }
    const data = await res.json() as { status: string; conclusion: string | null };

    if (data.status === "completed") {
      if (data.conclusion === "success") return { status: "finished" };
      return {
        status: "failed",
        errorMessage: `GitHub Actions run ${runId} ended with conclusion: ${data.conclusion}`,
      };
    }
    // queued / in_progress / waiting / etc.
    return { status: "in_progress" };
  } catch (err) {
    logger.warn({ err, runId }, "[app-generator] checkGitHubRunStatus error");
    return { status: "in_progress" };
  }
}
