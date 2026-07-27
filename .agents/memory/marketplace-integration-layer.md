---
name: Marketplace Integration Layer
description: Vendor API keys, OAuth 2.0 server, webhooks, and developer portal — all the pieces needed for Zapier/HubSpot/Make/CRM marketplace listings
---

## Overview
Built on top of the existing `/external/*` feature routes (partner JWT auth). Three new auth mechanisms now work alongside the old JWT sessions.

## New DB Tables (migrations applied)
- `vendor_api_keys` — vendor-generated `awa_sk_*` keys; SHA-256 hashed; scopes[]; lastUsedAt updated on each use
- `oauth_clients` — registered third-party OAuth apps (admin-provisioned, not self-service)
- `oauth_tokens` — dual-purpose: authorization_code (10 min, single-use, usedAt sentinel) + access_token (30 day, `oat_*` prefix)
- `vendor_webhook_endpoints` — HTTPS endpoints per vendor; HMAC-SHA256 signing secret shown once

## Token Prefixes in requireExternalAuth
Middleware now branches on prefix before doing any DB lookup:
- `awa_sk_` → vendor API key (vendor_api_keys table, update lastUsedAt in background)
- `oat_`    → OAuth access token (oauth_tokens table)
- anything else → legacy JWT (awajimaa partner / mobile-app)

**Why:** Single middleware handles all three without breaking existing JWT callers.

## OAuth 2.0 Routes (mounted BEFORE requireAuth)
- `GET /.well-known/oauth-authorization-server` — RFC 8414 discovery (Zapier/HubSpot use this)
- `GET /api/oauth/client-info` — public; consent screen fetches this
- `POST /api/oauth/authorize` — Clerk-authenticated; vendor approves/denies
- `POST /api/oauth/token` — public; third-party backend exchanges code for `oat_` token
- `POST /api/oauth/revoke` — public; RFC 7009 (always 200)

## Developer Routes (Clerk-authenticated, mounted after requireAuth)
- `GET/POST/DELETE /api/developer/api-keys` — max 10 active keys; raw key returned once on create
- `GET/POST/PATCH/DELETE /api/developer/webhooks` — max 10; raw signing secret returned once
- `POST /api/developer/webhooks/:id/test` — fires test payload, verifies HMAC signature
- `GET /api/developer/meta` — returns available scopes + webhook event types

## Frontend
- `/developers` — public developer portal (no auth required), shows API Key + OAuth quickstart, endpoint reference, webhook signing guide, marketplace listing guide for Zapier/Make/HubSpot/Salesforce/Power Automate/n8n
- `/oauth/authorize` — OAuth consent screen (public route; renders Clerk `<SignIn>` with `forceRedirectUrl` if user not signed in)
- Account page → Developer & Integrations card — tabbed (API Keys / Webhooks), shows create/revoke/test UIs with "shown once" banner for raw key/secret

## How to apply
- To add a new API key scope: add to AVAILABLE_SCOPES in developer.ts AND to SCOPE_DESCRIPTIONS
- To add a new webhook event type: add to SUPPORTED_EVENTS in developer.ts AND to developers.tsx display list
- OAuth clients must be provisioned by admin (no self-service registration yet) — contact developers@awajimaaapp.io flow documented on portal
