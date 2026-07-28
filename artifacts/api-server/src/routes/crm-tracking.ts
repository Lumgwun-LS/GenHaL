/**
 * Public CRM tracking endpoints — no auth required.
 *
 * POST /api/public/crm/visit   — tracking pixel from vendor website script
 * POST /api/public/crm/forms/:formId/submit — lead-capture form submission
 * GET  /api/public/r/:shortCode — UTM short-link redirect + click tracking
 */
import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  leadsTable,
  personActivitiesTable,
  leadFormsTable,
  utmLinksTable,
  vendorsTable,
} from "@workspace/db";

const router: IRouter = Router();

/* ─────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────── */

async function upsertPerson(params: {
  vendorId: number;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  visitorToken?: string | null;
  channel: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  referrerUrl?: string | null;
  landingPage?: string | null;
}): Promise<number> {
  const now = new Date();

  // Try to match by email first, then visitor token
  let existing: { id: number } | undefined;

  if (params.email) {
    const rows = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(and(eq(leadsTable.vendorId, params.vendorId), eq(leadsTable.email, params.email)));
    existing = rows[0];
  }

  if (!existing && params.visitorToken) {
    const rows = await db
      .select({ id: leadsTable.id })
      .from(leadsTable)
      .where(
        and(eq(leadsTable.vendorId, params.vendorId), eq(leadsTable.visitorToken, params.visitorToken)),
      );
    existing = rows[0];
  }

  if (existing) {
    // Bump page views + lastSeenAt; fill in any missing contact info
    await db
      .update(leadsTable)
      .set({
        lastSeenAt: now,
        pageViews: sql`${leadsTable.pageViews} + 1`,
        ...(params.email && { email: params.email }),
        ...(params.name && { name: params.name }),
        ...(params.phone && { phone: params.phone }),
      })
      .where(eq(leadsTable.id, existing.id));
    return existing.id;
  }

  // Create new person record
  const [inserted] = await db
    .insert(leadsTable)
    .values({
      vendorId: params.vendorId,
      name: params.name ?? "Anonymous Visitor",
      email: params.email ?? undefined,
      phone: params.phone ?? undefined,
      channel: params.channel,
      source: params.channel,
      visitorToken: params.visitorToken ?? undefined,
      utmSource: params.utmSource ?? undefined,
      utmMedium: params.utmMedium ?? undefined,
      utmCampaign: params.utmCampaign ?? undefined,
      utmContent: params.utmContent ?? undefined,
      referrerUrl: params.referrerUrl ?? undefined,
      landingPage: params.landingPage ?? undefined,
      pageViews: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      status: "new",
    })
    .returning({ id: leadsTable.id });

  return inserted!.id;
}

/* ─────────────────────────────────────────────────────────────
   POST /api/public/crm/visit  — website tracking pixel
───────────────────────────────────────────────────────────── */
router.post("/public/crm/visit", async (req, res): Promise<void> => {
  const { vendorId, visitorToken, page, referrer, utmSource, utmMedium, utmCampaign, utmContent } =
    req.body as Record<string, string | undefined>;

  const vid = parseInt(vendorId ?? "");
  if (isNaN(vid)) { res.status(400).json({ error: "vendorId required" }); return; }

  // Verify vendor exists
  const [vendor] = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(eq(vendorsTable.id, vid));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  const personId = await upsertPerson({
    vendorId: vid,
    visitorToken: visitorToken ?? null,
    channel: "website",
    utmSource: utmSource ?? null,
    utmMedium: utmMedium ?? null,
    utmCampaign: utmCampaign ?? null,
    utmContent: utmContent ?? null,
    referrerUrl: referrer ?? null,
    landingPage: page ?? null,
  });

  await db.insert(personActivitiesTable).values({
    vendorId: vid,
    personId,
    type: "page_view",
    data: {
      page: page ?? null,
      referrer: referrer ?? null,
      utmSource: utmSource ?? null,
      utmMedium: utmMedium ?? null,
      utmCampaign: utmCampaign ?? null,
    },
  });

  res.json({ ok: true });
});

/* ─────────────────────────────────────────────────────────────
   POST /api/public/crm/forms/:formId/submit — lead capture form
───────────────────────────────────────────────────────────── */
router.post("/public/crm/forms/:formId/submit", async (req, res): Promise<void> => {
  const formId = parseInt(req.params.formId ?? "");
  if (isNaN(formId)) { res.status(400).json({ error: "Invalid formId" }); return; }

  const [form] = await db
    .select()
    .from(leadFormsTable)
    .where(and(eq(leadFormsTable.id, formId), eq(leadFormsTable.status, "active")));
  if (!form) { res.status(404).json({ error: "Form not found or inactive" }); return; }

  const body = req.body as Record<string, string>;

  // Validate required fields
  for (const field of form.fields ?? []) {
    if (field.required && !body[field.name]?.trim()) {
      res.status(400).json({ error: `${field.label} is required` });
      return;
    }
  }

  const name = body["name"] ?? body["full_name"] ?? "Unknown";
  const email = body["email"] ?? undefined;
  const phone = body["phone"] ?? undefined;
  const visitorToken = body["_visitor_token"] ?? undefined;
  const utmSource = body["_utm_source"] ?? undefined;
  const utmMedium = body["_utm_medium"] ?? undefined;
  const utmCampaign = body["_utm_campaign"] ?? undefined;

  const personId = await upsertPerson({
    vendorId: form.vendorId,
    name,
    email: email ?? null,
    phone: phone ?? null,
    visitorToken: visitorToken ?? null,
    channel: "form",
    utmSource: utmSource ?? null,
    utmMedium: utmMedium ?? null,
    utmCampaign: utmCampaign ?? null,
  });

  await db.insert(personActivitiesTable).values({
    vendorId: form.vendorId,
    personId,
    type: "form_submit",
    data: { formId: form.id, formName: form.name, fields: body },
  });

  // Bump submissions count
  await db
    .update(leadFormsTable)
    .set({ submissionsCount: sql`${leadFormsTable.submissionsCount} + 1` })
    .where(eq(leadFormsTable.id, formId));

  res.json({
    ok: true,
    thankYouMessage: form.thankYouMessage ?? "Thank you! We'll be in touch.",
    redirectUrl: form.redirectUrl ?? null,
  });
});

/* ─────────────────────────────────────────────────────────────
   GET /api/public/r/:shortCode — UTM short-link redirect
───────────────────────────────────────────────────────────── */
router.get("/public/r/:shortCode", async (req, res): Promise<void> => {
  const [link] = await db
    .select()
    .from(utmLinksTable)
    .where(eq(utmLinksTable.shortCode, req.params.shortCode ?? ""));

  if (!link) { res.status(404).json({ error: "Link not found" }); return; }

  // Increment click counter (fire-and-forget)
  void db.update(utmLinksTable)
    .set({ clicks: sql`${utmLinksTable.clicks} + 1` })
    .where(eq(utmLinksTable.id, link.id));

  // Record activity
  void (async () => {
    try {
      const personId = await upsertPerson({
        vendorId: link.vendorId,
        channel: "utm_link",
        utmSource: link.utmSource,
        utmMedium: link.utmMedium,
        utmCampaign: link.utmCampaign,
        utmContent: link.utmContent ?? null,
      });
      await db.insert(personActivitiesTable).values({
        vendorId: link.vendorId,
        personId,
        type: "utm_click",
        data: { linkId: link.id, linkName: link.name, utmSource: link.utmSource, utmMedium: link.utmMedium, utmCampaign: link.utmCampaign },
      });
    } catch { /* best-effort */ }
  })();

  // Build redirect URL with UTM params appended
  const dest = new URL(link.destinationUrl);
  dest.searchParams.set("utm_source", link.utmSource);
  dest.searchParams.set("utm_medium", link.utmMedium);
  dest.searchParams.set("utm_campaign", link.utmCampaign);
  if (link.utmContent) dest.searchParams.set("utm_content", link.utmContent);
  if (link.utmTerm) dest.searchParams.set("utm_term", link.utmTerm);

  res.redirect(302, dest.toString());
});

export default router;
