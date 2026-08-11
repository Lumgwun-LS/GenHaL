#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Upload the Awajimaa Investor Video to Cloudflare R2
#
# USAGE:
#   bash artifacts/awajimaa-investor-video/scripts/upload-to-r2.sh /path/to/video.mp4
#
# After exporting from the Replit preview pane:
#   1. Download the exported MP4 to your local machine, or place it at any
#      path on this workspace (e.g. /tmp/investor-video.mp4).
#   2. Run this script with that path as the argument.
#   3. The public R2 URL is printed at the end — use it wherever you embed
#      or share the video.
#
# To RE-EXPORT & OVERWRITE (update the video):
#   Just re-record from the preview pane, then run this script again with the
#   new file. R2 overwrites the object at the same key so every existing link
#   to the public URL instantly serves the new version (after CDN cache clears
#   in ~60 s).
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Validate input ────────────────────────────────────────────────────────────
if [[ $# -lt 1 ]]; then
  echo "Usage: bash $0 /path/to/exported-video.mp4"
  exit 1
fi

INPUT_FILE="$1"

if [[ ! -f "$INPUT_FILE" ]]; then
  echo "Error: file not found: $INPUT_FILE"
  exit 1
fi

# ── Validate required secrets ─────────────────────────────────────────────────
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID env var is required}"
: "${R2_BUCKET_NAME:?R2_BUCKET_NAME env var is required}"
: "${S3_ACCESS_KEY_ID:?S3_ACCESS_KEY_ID env var is required}"
: "${S3_ACCESS_KEY_SECRET:?S3_ACCESS_KEY_SECRET env var is required}"
: "${R2_PUBLIC_URL:?R2_PUBLIC_URL env var is required}"

# ── Config ────────────────────────────────────────────────────────────────────
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
R2_KEY="video-artifacts/awajimaa-investor-video.mp4"

echo "─────────────────────────────────────────────────────"
echo "  Uploading: $INPUT_FILE"
echo "  Bucket   : $R2_BUCKET_NAME"
echo "  Key      : $R2_KEY"
echo "─────────────────────────────────────────────────────"

# ── Upload via AWS CLI (S3-compatible) ────────────────────────────────────────
AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$S3_ACCESS_KEY_SECRET" \
aws s3 cp "$INPUT_FILE" \
  "s3://${R2_BUCKET_NAME}/${R2_KEY}" \
  --endpoint-url "$R2_ENDPOINT" \
  --content-type "video/mp4" \
  --no-progress

# ── Done ──────────────────────────────────────────────────────────────────────
PUBLIC_URL="${R2_PUBLIC_URL%/}/${R2_KEY}"
echo ""
echo "✓ Upload complete!"
echo ""
echo "  Public URL:"
echo "  $PUBLIC_URL"
echo ""
echo "  (If you just updated the video, the CDN may serve the old version for"
echo "   up to ~60 seconds while it clears. After that, every link automatically"
echo "   serves the new version — no URL change needed.)"
