import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Platform Partners — external platforms (e.g. awajimaaschools.com) that register
 * in the Awa Biz Suite marketplace. Once registered, vendors can discover and
 * connect to them from the Marketplace tab. Admins manage registration.
 *
 * API spec source can be:
 *   url    — a publicly hosted OpenAPI JSON/YAML URL, polled on-demand
 *   git    — a GitHub or GitLab repo; auto-synced via webhook on push
 *   upload — a manually uploaded spec file stored as raw YAML/JSON text
 */
export const platformPartnersTable = pgTable("platform_partners", {
  id:               serial("id").primaryKey(),
  // Identity
  name:             text("name").notNull(),
  slug:             text("slug").notNull().unique(),            // URL-safe, used in /docs/:slug
  description:      text("description"),
  logoUrl:          text("logo_url"),
  websiteUrl:       text("website_url"),
  contactEmail:     text("contact_email").notNull(),
  pricingTier:      text("pricing_tier").notNull().default("free"), // free|starter|pro

  // API configuration
  baseUrl:          text("base_url"),                          // e.g. https://api.awajimaaschools.com
  gatewayOptIn:     boolean("gateway_opt_in").notNull().default(false), // route calls via awajimaaai.com

  // Spec source
  specSourceType:   text("spec_source_type").notNull().default("url"), // url|git|upload
  specUrl:          text("spec_url"),                          // for type=url
  specRawContent:   text("spec_raw_content"),                  // for type=upload (stored YAML/JSON)

  // Git connect (GitHub or GitLab)
  gitProvider:      text("git_provider"),                      // github|gitlab
  gitRepo:          text("git_repo"),                          // owner/repo
  gitBranch:        text("git_branch").notNull().default("main"),
  gitSpecPath:      text("git_spec_path"),                     // e.g. docs/openapi.yaml
  gitInstallToken:  text("git_install_token"),                 // OAuth access token (stored encrypted)
  gitWebhookSecret: text("git_webhook_secret"),                // HMAC secret for push webhook verification

  // Generated documentation
  docContent:       text("doc_content"),                       // AI-generated JSON (stringified DocPortal)
  docGeneratedAt:   timestamp("doc_generated_at", { withTimezone: true }),
  docVersion:       integer("doc_version").notNull().default(0),
  docChangelog:     text("doc_changelog"),                     // AI-written diff summary of last spec update

  // Connected Business — vendor who owns this profile (null = admin-created, non-vendor entry)
  vendorId:         integer("vendor_id"),        // FK → vendors.id (set null on delete)

  // Self-service application fields
  applicationStatus: text("application_status").notNull().default("admin_created"), // admin_created | pending | approved | rejected | vendor_connected
  applicantName:    text("applicant_name"),     // person who submitted the registration
  rejectionReason:  text("rejection_reason"),   // set when admin rejects

  // Status
  enabled:          boolean("enabled").notNull().default(false),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlatformPartner = typeof platformPartnersTable.$inferSelect;

export const insertPlatformPartnerSchema = createInsertSchema(platformPartnersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  docContent: true,
  docGeneratedAt: true,
  docVersion: true,
  docChangelog: true,
});

export const PlatformPartnerInput = insertPlatformPartnerSchema;
export type PlatformPartnerInput = z.infer<typeof PlatformPartnerInput>;
