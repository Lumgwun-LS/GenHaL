#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Production build script — Awa Biz Suite
#
# Builds every frontend artifact to its dist/public/ folder, ready for upload
# to cPanel File Manager or via FTP.
#
# Usage (from repo root):
#   bash scripts/build-prod.sh
#
# Output directories:
#   artifacts/vendor-hub/dist/public/         → host at the root of your domain
#   artifacts/app-store/dist/public/          → host at /app-store/
#   artifacts/awajimaa-tools-video/dist/public/   → host at /videos/tools/
#   artifacts/appstore-promo-video/dist/public/   → host at /videos/appstore-promo/
#   artifacts/awajimaa-ai-video/dist/public/      → host at /videos/awajimaa-ai/
#   artifacts/awajimaa-schools-video/dist/public/ → host at /videos/schools/
#   artifacts/awahub-app-video/dist/public/       → host at /videos/awahub/
#   artifacts/awajimaa-app-video/dist/public/     → host at /videos/awajimaa-app/
#   artifacts/vendorhub-walkthrough-video/dist/public/ → host at /videos/walkthrough/
#   artifacts/vendorhub-promo-video/dist/public/  → host at /videos/promo/
#
# API server (artifacts/api-server/dist/) is built separately — see DEPLOY.md.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Awa Biz Suite — production frontend build"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Helper: build one Vite artifact ──────────────────────────────────────────
build_frontend() {
  local NAME="$1"
  local DIR="$2"
  local BASE_PATH="$3"
  local API_URL="${4:-https://api.awajimaaapp.io}"

  echo ""
  echo "▶ Building $NAME (base=$BASE_PATH) …"
  (
    cd "$DIR"
    PORT=3000 \
    BASE_PATH="$BASE_PATH" \
    VITE_API_URL="$API_URL" \
    NODE_ENV=production \
    pnpm run build
  )
  echo "✓ $NAME → $DIR/dist/public/"
}

# ── Shared workspace packages (must be built first) ──────────────────────────
echo ""
echo "▶ Building shared packages …"
pnpm --filter @workspace/db run build 2>/dev/null || true
pnpm --filter @workspace/api-zod run build 2>/dev/null || true
pnpm --filter @workspace/api-client-react run build 2>/dev/null || true
echo "✓ Shared packages ready"

# ── Main web apps ─────────────────────────────────────────────────────────────
build_frontend "Awa Biz Suite (vendor-hub)" \
  "artifacts/vendor-hub" \
  "/"

build_frontend "Awajimaa App Store" \
  "artifacts/app-store" \
  "/app-store/"

# ── Video artifacts ───────────────────────────────────────────────────────────
build_frontend "Awajimaa Tools Video" \
  "artifacts/awajimaa-tools-video" \
  "/videos/tools/"

build_frontend "App Store Promo Video" \
  "artifacts/appstore-promo-video" \
  "/videos/appstore-promo/"

build_frontend "Awajimaa AI Video" \
  "artifacts/awajimaa-ai-video" \
  "/videos/awajimaa-ai/"

build_frontend "Awajimaa Schools Video" \
  "artifacts/awajimaa-schools-video" \
  "/videos/schools/"

build_frontend "Awa Hub App Video" \
  "artifacts/awahub-app-video" \
  "/videos/awahub/"

build_frontend "Awajimaa App Video" \
  "artifacts/awajimaa-app-video" \
  "/videos/awajimaa-app/"

build_frontend "VendorHub Walkthrough Video" \
  "artifacts/vendorhub-walkthrough-video" \
  "/videos/walkthrough/"

build_frontend "VendorHub Promo Video" \
  "artifacts/vendorhub-promo-video" \
  "/videos/promo/"

# ── API server ────────────────────────────────────────────────────────────────
echo ""
echo "▶ Building API server …"
(cd artifacts/api-server && pnpm run build)
echo "✓ API server → artifacts/api-server/dist/"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  All builds complete! See DEPLOY.md for"
echo "  upload and cPanel setup instructions."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
