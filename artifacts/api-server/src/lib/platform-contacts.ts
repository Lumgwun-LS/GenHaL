/**
 * Helpers for the platform-wide contact registry.
 *
 * Call these whenever a person's email first enters the system (via support
 * form, order checkout, CRM lead capture, newsletter sign-up, etc.) so the
 * platform always has a single unified audience for newsletters and analytics.
 */
import { db, platformContactsTable, leadsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

/**
 * Find or create a platform contact row by email.
 * On conflict, updates name/phone if better values are now available.
 * Returns the platform contact ID.
 */
export async function upsertPlatformContact(
  email: string,
  opts?: { name?: string; phone?: string },
): Promise<number> {
  const normalised = email.toLowerCase().trim();

  const [result] = await db
    .insert(platformContactsTable)
    .values({
      email: normalised,
      name: opts?.name?.trim() || null,
      phone: opts?.phone?.trim() || null,
    })
    .onConflictDoUpdate({
      target: platformContactsTable.email,
      set: {
        // Only overwrite with a non-empty value — never blank out existing info
        name: sql`CASE WHEN ${platformContactsTable.name} IS NULL AND EXCLUDED.name IS NOT NULL THEN EXCLUDED.name ELSE ${platformContactsTable.name} END`,
        phone: sql`CASE WHEN ${platformContactsTable.phone} IS NULL AND EXCLUDED.phone IS NOT NULL THEN EXCLUDED.phone ELSE ${platformContactsTable.phone} END`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: platformContactsTable.id });

  return result!.id;
}

/**
 * Find or create a CRM lead for this vendor, keyed by email.
 * If the lead already exists, bumps lastSeenAt but does not overwrite
 * fields the vendor may have manually edited.
 * Returns the lead ID.
 */
export async function upsertVendorLead(
  vendorId: number,
  email: string,
  opts?: {
    name?: string;
    phone?: string;
    channel?: string;
    source?: string;
  },
): Promise<number> {
  const normalised = email.toLowerCase().trim();

  const [existing] = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(and(eq(leadsTable.vendorId, vendorId), eq(leadsTable.email, normalised)));

  if (existing) {
    await db
      .update(leadsTable)
      .set({ lastSeenAt: new Date(), updatedAt: new Date() })
      .where(eq(leadsTable.id, existing.id));
    return existing.id;
  }

  const [created] = await db
    .insert(leadsTable)
    .values({
      vendorId,
      email: normalised,
      name: opts?.name?.trim() || normalised,
      phone: opts?.phone?.trim() || null,
      channel: opts?.channel ?? "support",
      source: opts?.source ?? "support_ticket",
      status: "new",
      newsLetterOptIn: true,
    })
    .returning({ id: leadsTable.id });

  return created!.id;
}

/**
 * Check whether a person is already a known contact of a vendor — i.e. they
 * have an existing CRM lead record.  Used by the support form to distinguish
 * "existing customer" (pre-filled, no extra signup step) from "new visitor"
 * (must provide name + phone before submitting a ticket).
 */
export async function findVendorLead(
  vendorId: number,
  email: string,
): Promise<{ id: number; name: string } | null> {
  const normalised = email.toLowerCase().trim();
  const [lead] = await db
    .select({ id: leadsTable.id, name: leadsTable.name })
    .from(leadsTable)
    .where(and(eq(leadsTable.vendorId, vendorId), eq(leadsTable.email, normalised)));
  return lead ?? null;
}
