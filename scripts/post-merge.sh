#!/bin/bash
set -e

# Post-merge setup: install dependencies and rebuild shared packages.
# Runs automatically after every task merge. Must be idempotent and non-interactive.

pnpm install

# Rebuild the DB package so api-server typecheck picks up schema changes
pnpm --filter @workspace/db run build
