# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

- **Schema-drift guard**: After adding a migration file in `lib/db/migrations/`, always apply it to the dev database (`pnpm --filter @workspace/db run push-force`) and then verify no drift remains:
  ```
  pnpm --filter @workspace/api-server exec \
    npx tsx src/lib/__tests__/schema-drift-guard.integration.ts
  ```
  The post-merge script (`scripts/post-merge.sh`) runs both steps automatically after every task merge — if the smoke-test exits 1, the merge is blocked until the drift is resolved. Background jobs silently fail on every scheduler tick when a migration is written but not applied, so this check is critical.

- **Twilio Auth Token rotation**: `TWILIO_AUTH_TOKEN` (Replit Secret) must match the Auth Token currently active in the Twilio console. If you ever rotate/roll the token in Twilio (Console → Account → API keys & tokens), update this secret immediately — otherwise every voice status-callback request fails signature validation and gets silently rejected (call statuses stop updating). The API server detects this automatically: a burst of rejected callbacks triggers a Slack alert and a red banner on the Voice Calls tab of the Admin Panel telling you to update the secret.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
