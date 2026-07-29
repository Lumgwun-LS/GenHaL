/**
 * Website-to-App Generator
 *
 * Given a vendor and a website URL (or repo URL), this module:
 *  1. Creates a customised Expo WebView wrapper in a temp directory
 *  2. Downloads the vendor's icon as the app icon
 *  3. Runs EAS build (Android APK, internal distribution) via CLI
 *  4. Returns the EAS build ID so a background scheduler can poll for completion
 */

import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { logger } from "./logger";

const TEMPLATE_DIR = path.resolve(__dirname, "../../../../app-generator-template");
const EXPO_TOKEN   = process.env.EXPO_TOKEN ?? "";
const DEV_DOMAIN   = process.env.REPLIT_DEV_DOMAIN ?? "";

// Slugify vendor name into a safe Android package segment
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

/** Download a remote image to a local file path. Falls back to the bundled template icon. */
async function downloadIcon(url: string | null | undefined, dest: string): Promise<void> {
  if (!url) return; // leave template icon in place
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
  } catch {
    // non-fatal — use template icon
  }
}

export interface GenerateAppOptions {
  vendorId:   number;
  vendorName: string;
  websiteUrl: string;
  iconUrl?:   string | null;
  appName?:   string;
}

export interface GenerateAppResult {
  slug:        string;
  packageName: string;
  easBuildId:  string;
  buildDir:    string;
}

export async function generateVendorApp(opts: GenerateAppOptions): Promise<GenerateAppResult> {
  const { vendorId, vendorName, websiteUrl, iconUrl } = opts;
  const appName    = (opts.appName ?? vendorName).slice(0, 30);
  const slug       = toAppSlug(vendorName, vendorId);
  const packageName = toPackageName(slug);
  const scheme     = slug.replace(/_/g, "");

  // ── 1. Create temp working directory ──────────────────────────────────────
  const buildDir = path.join(os.tmpdir(), `vendor-app-${vendorId}-${Date.now()}`);
  fs.mkdirSync(buildDir, { recursive: true });
  fs.mkdirSync(path.join(buildDir, "app"),    { recursive: true });
  fs.mkdirSync(path.join(buildDir, "assets"), { recursive: true });

  // ── 2. Copy template source files ─────────────────────────────────────────
  const filesToCopy = [
    ["app/_layout.tsx",   "app/_layout.tsx"],
    ["app/index.tsx",     "app/index.tsx"],
    ["tsconfig.json",     "tsconfig.json"],
    ["eas.json",          "eas.json"],
  ];
  for (const [src, dst] of filesToCopy) {
    fs.copyFileSync(
      path.join(TEMPLATE_DIR, src),
      path.join(buildDir, dst),
    );
  }

  // Copy template icon as fallback
  const templateIcon = path.join(TEMPLATE_DIR, "assets", "icon.png");
  if (fs.existsSync(templateIcon)) {
    fs.copyFileSync(templateIcon, path.join(buildDir, "assets", "icon.png"));
    fs.copyFileSync(templateIcon, path.join(buildDir, "assets", "splash.png"));
  }

  // ── 3. Download vendor icon ────────────────────────────────────────────────
  await downloadIcon(iconUrl, path.join(buildDir, "assets", "icon.png"));
  await downloadIcon(iconUrl, path.join(buildDir, "assets", "splash.png"));

  // ── 4. Write customised app.json ──────────────────────────────────────────
  const appJson = {
    expo: {
      name:        appName,
      slug,
      version:     "1.0.0",
      orientation: "portrait",
      icon:        "./assets/icon.png",
      scheme,
      userInterfaceStyle: "automatic",
      splash: {
        image:       "./assets/splash.png",
        resizeMode:  "contain",
        backgroundColor: "#ffffff",
      },
      ios:     { supportsTablet: true, bundleIdentifier: packageName },
      android: {
        package: packageName,
        adaptiveIcon: {
          foregroundImage:  "./assets/icon.png",
          backgroundColor: "#ffffff",
        },
        permissions: ["android.permission.INTERNET"],
      },
      web:     { favicon: "./assets/icon.png" },
      plugins: ["expo-router"],
      extra: {
        websiteUrl,
        vendorName: appName,
        router: { origin: false },
      },
    },
  };
  fs.writeFileSync(
    path.join(buildDir, "app.json"),
    JSON.stringify(appJson, null, 2),
  );

  // ── 5. Write package.json ─────────────────────────────────────────────────
  const pkgJson = JSON.parse(
    fs.readFileSync(path.join(TEMPLATE_DIR, "package.json"), "utf8"),
  );
  pkgJson.name = slug;
  fs.writeFileSync(
    path.join(buildDir, "package.json"),
    JSON.stringify(pkgJson, null, 2),
  );

  // ── 6. Install dependencies ────────────────────────────────────────────────
  logger.info({ buildDir, slug }, "[app-generator] Installing dependencies");
  const installResult = spawnSync("npm", ["install", "--legacy-peer-deps", "--prefer-offline"], {
    cwd: buildDir,
    env: { ...process.env, EXPO_TOKEN },
    timeout: 3 * 60 * 1000,
    stdio: "pipe",
  });
  if (installResult.status !== 0) {
    const err = installResult.stderr?.toString() ?? "npm install failed";
    throw new Error(`Dependency install failed: ${err.slice(0, 500)}`);
  }

  // ── 7. Kick off EAS build ──────────────────────────────────────────────────
  logger.info({ slug }, "[app-generator] Starting EAS build");
  const buildResult = spawnSync(
    "eas",
    ["build", "--platform", "android", "--profile", "preview", "--non-interactive", "--no-wait"],
    {
      cwd: buildDir,
      env: { ...process.env, EXPO_TOKEN },
      timeout: 5 * 60 * 1000,
      stdio: "pipe",
    },
  );

  const stdout = buildResult.stdout?.toString() ?? "";
  const stderr = buildResult.stderr?.toString() ?? "";
  const combined = stdout + stderr;

  logger.info({ slug, stdout: stdout.slice(0, 500) }, "[app-generator] EAS build output");

  // Extract build ID from EAS output: "See logs: https://expo.dev/.../builds/{buildId}"
  const match = combined.match(/builds\/([a-f0-9-]{36})/);
  if (!match) {
    throw new Error(`EAS build did not return a build ID.\nOutput: ${combined.slice(0, 800)}`);
  }

  const easBuildId = match[1];
  logger.info({ slug, easBuildId }, "[app-generator] EAS build queued");

  return { slug, packageName, easBuildId, buildDir };
}

/** Poll EAS for a finished build and return the APK download URL, or null if still in progress. */
export async function checkEasBuildStatus(easBuildId: string): Promise<{
  status: "finished" | "in_progress" | "failed";
  apkUrl?: string;
  errorMessage?: string;
}> {
  try {
    const result = spawnSync(
      "eas",
      ["build:view", easBuildId, "--json"],
      {
        env: { ...process.env, EXPO_TOKEN },
        timeout: 30_000,
        stdio: "pipe",
      },
    );
    const raw = result.stdout?.toString() ?? "";
    const start = raw.indexOf("{");
    if (start === -1) return { status: "in_progress" };

    const build = JSON.parse(raw.slice(start));
    const s: string = build.status ?? "";

    if (s === "FINISHED") {
      return { status: "finished", apkUrl: build.artifacts?.buildUrl ?? undefined };
    }
    if (s === "ERRORED" || s === "CANCELED") {
      return { status: "failed", errorMessage: `EAS build ${s.toLowerCase()}` };
    }
    return { status: "in_progress" };
  } catch (err) {
    logger.warn({ err, easBuildId }, "[app-generator] checkEasBuildStatus error");
    return { status: "in_progress" };
  }
}
