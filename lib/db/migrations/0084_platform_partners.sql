CREATE TABLE "platform_partners" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "description" text,
  "logo_url" text,
  "website_url" text,
  "contact_email" text NOT NULL,
  "pricing_tier" text NOT NULL DEFAULT 'free',
  "base_url" text,
  "gateway_opt_in" boolean NOT NULL DEFAULT false,
  "spec_source_type" text NOT NULL DEFAULT 'url',
  "spec_url" text,
  "spec_raw_content" text,
  "git_provider" text,
  "git_repo" text,
  "git_branch" text NOT NULL DEFAULT 'main',
  "git_spec_path" text,
  "git_install_token" text,
  "git_webhook_secret" text,
  "doc_content" text,
  "doc_generated_at" timestamptz,
  "doc_version" integer NOT NULL DEFAULT 0,
  "doc_changelog" text,
  "enabled" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "vendor_platform_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "partner_id" integer NOT NULL REFERENCES "platform_partners"("id") ON DELETE CASCADE,
  "auth_type" text NOT NULL DEFAULT 'api_key',
  "credential" text,
  "status" text NOT NULL DEFAULT 'active',
  "last_seen_at" timestamptz,
  "last_error" text,
  "connected_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "vendor_platform_connections_vendor_partner_idx"
  ON "vendor_platform_connections"("vendor_id", "partner_id");
