# Deploying Awa Biz Suite to LuukaHost + Google Cloud

This guide moves the entire platform off Replit Deployments onto:
- **LuukaHost cPanel** — static frontends + Node.js API server (already paid)
- **Google Cloud SQL** — PostgreSQL 18 database (already provisioned)

You keep using **Replit only for development**. The monthly deployment bill disappears.

---

## Architecture after migration

```
Browser
  │
  ├── app.awajimaaapp.io  ──→  LuukaHost (static files, Awa Biz Suite)
  ├── store.awajimaaapp.io ──→ LuukaHost (static files, App Store)
  ├── api.awajimaaapp.io  ──→  LuukaHost Node.js App (API server)
  │                                  │
  │                                  └──→ Google Cloud SQL
  │                                       34.35.39.102:5432 / awajimaa-db
  │
  └── media files  ──→  (currently Replit Object Storage; migrate to GCS later)
```

---

## Prerequisites

- [ ] Node.js 20+ installed on your local machine (for building)
- [ ] pnpm installed: `npm install -g pnpm`
- [ ] Access to cPanel at LuukaHost
- [ ] A Google Cloud SQL user `awajimaa-db` with a password you know
- [ ] Domains `app.awajimaaapp.io` and `api.awajimaaapp.io` pointed at your LuukaHost server IP

---

## Step 1 — Run the migrations on Google Cloud SQL

Your Google Cloud SQL instance is empty. Run all Drizzle migrations to create the schema.

```bash
# From the repo root on your local machine or inside Replit terminal:
DATABASE_URL="postgresql://awajimaa-db:YOUR_PASSWORD@34.35.39.102:5432/awajimaa-db?sslmode=require" \
  pnpm --filter @workspace/db run migrate
```

> If `run migrate` isn't in the db package scripts, run the SQL files manually:
> ```bash
> psql "postgresql://awajimaa-db:YOUR_PASSWORD@34.35.39.102:5432/awajimaa-db?sslmode=require" \
>   -f lib/db/migrations/0001_*.sql \
>   -f lib/db/migrations/0002_*.sql
>   # ... repeat for each file in order
> ```

---

## Step 2 — (Optional) Export data from Replit Postgres

If you have production data in Replit's Postgres that you want to keep:

```bash
# In the Replit terminal (access to $DATABASE_URL automatically):
pg_dump "$DATABASE_URL" --no-owner --no-acl -F c -f /tmp/replit_backup.dump

# Then restore into Google Cloud:
pg_restore -d "postgresql://awajimaa-db:YOUR_PASSWORD@34.35.39.102:5432/awajimaa-db?sslmode=require" \
  --no-owner --no-acl /tmp/replit_backup.dump
```

---

## Step 3 — Build all frontends locally

```bash
# From the repo root:
bash scripts/build-prod.sh
```

This produces `dist/public/` inside each artifact folder.

**If you need to change the base paths** (e.g. you want the Biz Suite at `/biz/` instead of `/`), edit `scripts/build-prod.sh` and rerun.

---

## Step 4 — Upload static frontends to cPanel

### Option A: cPanel File Manager (no tools needed)

1. Open **cPanel → File Manager**
2. Navigate to `public_html/` (or the subdomain's document root)
3. Upload the **contents** of `artifacts/vendor-hub/dist/public/` to the document root
4. Create a subfolder `app-store/` and upload the **contents** of `artifacts/app-store/dist/public/` into it
5. Repeat for video artifacts using the paths in `scripts/build-prod.sh`

### Option B: FTP/SFTP (faster for large uploads)

```bash
# Using rsync over SSH (replace user@yourhost with your cPanel SSH details):
rsync -avz artifacts/vendor-hub/dist/public/       user@yourhost:~/public_html/
rsync -avz artifacts/app-store/dist/public/        user@yourhost:~/public_html/app-store/
rsync -avz artifacts/awajimaa-tools-video/dist/public/  user@yourhost:~/public_html/videos/tools/
# ... repeat for other video artifacts
```

### Subdomain document roots

If you create subdomains (recommended):

| Subdomain | cPanel Document Root | Build output |
|---|---|---|
| `app.awajimaaapp.io` | `~/app.awajimaaapp.io/` | `artifacts/vendor-hub/dist/public/` |
| `store.awajimaaapp.io` | `~/store.awajimaaapp.io/` | `artifacts/app-store/dist/public/` |

Set `BASE_PATH=/` in `scripts/build-prod.sh` for subdomain-hosted apps (no subfolder path needed).

### SPA routing (important!)

React apps use client-side routing. Add a `.htaccess` file to each frontend's document root so deep links work:

```apache
# public_html/.htaccess  (or each subdomain root)
Options -MultiViews
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [QSA,L]
```

---

## Step 5 — Deploy the API server on cPanel Node.js

### 5a. Upload API server files

Upload the entire `artifacts/api-server/` folder to a location outside `public_html`, for example `~/nodeapps/api-server/`:

```
~/nodeapps/api-server/
  dist/           ← compiled output (from pnpm run build)
  node_modules/   ← install these on the server (see below)
  package.json
  server.js       ← cPanel startup file
```

> **Tip:** Upload everything, then run `npm install --production` via cPanel's Terminal to install node_modules on the server (avoids uploading 300MB of files).

### 5b. Create the Node.js Application in cPanel

1. **cPanel → Node.js Applications → Create Application**
2. Fill in:
   - **Node.js version:** 20.x or 22.x
   - **Application mode:** Production
   - **Application root:** `/home/YOUR_CPANEL_USER/nodeapps/api-server`
   - **Application URL:** `api.awajimaaapp.io` (or the subdomain you set up)
   - **Application startup file:** `server.js`
3. Click **Create**

### 5c. Set environment variables

In the same Node.js Application screen, add these environment variables one by one. Copy values from **Replit → Secrets** for each one:

```
NODE_ENV                     = production
DATABASE_URL                 = postgresql://awajimaa-db:YOUR_PASSWORD@34.35.39.102:5432/awajimaa-db?sslmode=require
CLERK_PUBLISHABLE_KEY        = (from Replit Secrets)
CLERK_SECRET_KEY             = (from Replit Secrets)
SESSION_SECRET               = (from Replit Secrets)
STRIPE_SECRET_KEY            = (from Replit Secrets)
STRIPE_PUBLISHABLE_KEY       = (from Replit Secrets)
STRIPE_WEBHOOK_SECRET        = (from Replit Secrets)
PAYSTACK_SECRET_KEY          = (from Replit Secrets)
PAYSTACK_WEBHOOK_SECRET      = (from Replit Secrets)
PAYPAL_CLIENT_ID             = (from Replit Secrets)
PAYPAL_CLIENT_SECRET         = (from Replit Secrets)
SQUAD_SECRET_KEY             = (from Replit Secrets)
INTERSWITCH_CLIENT_ID        = (from Replit Secrets)
INTERSWITCH_SECRET_KEY       = (from Replit Secrets)
INTERSWITCH_MERCHANT_CODE    = (from Replit Secrets)
INTERSWITCH_PAY_ITEM_ID      = (from Replit Secrets)
INTERSWITCH_ENV              = (from Replit Secrets)
PAYMENT_CREDS_ENCRYPTION_KEY = (64-char hex — run: openssl rand -hex 32)
SMTP_HOST                    = (from Replit Secrets)
SMTP_PORT                    = (from Replit Secrets)
SMTP_USER                    = (from Replit Secrets)
SMTP_PASS                    = (from Replit Secrets)
SMTP_FROM                    = (from Replit Secrets)
TWILIO_AUTH_TOKEN            = (from Replit Secrets)
META_APP_ID                  = (from Replit Secrets)
META_APP_SECRET              = (from Replit Secrets)
LINKEDIN_CLIENT_ID           = (from Replit Secrets)
LINKEDIN_CLIENT_SECRET       = (from Replit Secrets)
X_CLIENT_ID                  = (from Replit Secrets)
X_CLIENT_SECRET              = (from Replit Secrets)
SLACK_LIVE_API_KEY           = (from Replit Secrets)
EXPO_TOKEN                   = (from Replit Secrets)
GITHUB_ACTIONS_TOKEN         = (from Replit Secrets)
GITHUB_ANDROID_REPO_OWNER    = (from Replit Secrets)
GITHUB_ANDROID_REPO_NAME     = (from Replit Secrets)
MOBILE_APP_CALLBACK_SECRET   = (from Replit Secrets)
PICATIC_API_KEY              = (from Replit Secrets)
ALLOWED_ORIGINS              = https://app.awajimaaapp.io,https://store.awajimaaapp.io,https://awajimaaapp.io
```

The full list with descriptions is in `artifacts/api-server/.env.cpanel.example`.

### 5d. Install dependencies on the server

Via cPanel Terminal (or SSH):

```bash
cd ~/nodeapps/api-server
npm install --production
```

### 5e. Start the application

Click **Run NPM Install** then **Restart** in the Node.js Application screen.

Check the app logs in cPanel for any startup errors.

---

## Step 6 — Update Stripe & Paystack webhook URLs

After the API is live, update your webhook endpoints in:

- **Stripe Dashboard** → Developers → Webhooks → change endpoint to `https://api.awajimaaapp.io/api/payments/webhooks`
- **Paystack Dashboard** → Settings → API Keys & Webhooks → change to `https://api.awajimaaapp.io/api/payments/webhooks`

---

## Step 7 — Update Clerk allowed origins

In **Clerk Dashboard → your application → Domains**, add:
- `https://app.awajimaaapp.io`
- `https://store.awajimaaapp.io`
- `https://api.awajimaaapp.io`

---

## Step 8 — Smoke test

```bash
# API health check
curl https://api.awajimaaapp.io/api/health

# Frontend loads
open https://app.awajimaaapp.io
open https://store.awajimaaapp.io
```

---

## After it's all working

1. **Stop Replit Deployments** for all artifacts — go to each artifact's deployment settings in Replit and unpublish/stop the deployment.
2. Keep the **Replit workspace** (Core plan) for development — you still build here.
3. The Replit Postgres stays active for development. Production uses Google Cloud SQL.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Frontend shows blank page on deep links | Missing `.htaccess` SPA redirect | Add the `.htaccess` from Step 4 |
| API returns CORS error | Frontend origin not in `ALLOWED_ORIGINS` | Add the domain to `ALLOWED_ORIGINS` env var in cPanel |
| `relation does not exist` DB errors | Migrations not run on Google Cloud | Re-run Step 1 |
| API won't start (PORT error) | Passenger not setting PORT | Check cPanel app is in "Production" mode, not stopped |
| 502 Bad Gateway | App crashed at startup | Check cPanel Node.js app error logs |
| Clerk auth fails | Domain not added to Clerk | Add domain in Clerk Dashboard (Step 7) |
