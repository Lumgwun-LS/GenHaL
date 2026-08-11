/**
 * GenHaL email notifications — all templates and dispatch helpers.
 *
 * Triggers:
 *  • Kingdom / Family created     → welcome to creator, alert to admins
 *  • Ownership claim filed        → security alert to current owner, alert to admins
 *  • Ownership claim status change→ notify claimant; on "approved" also notify former owner
 *  • Succession claim filed       → alert to family head, alert to admins
 *  • Succession claim approved    → welcome to new head, alert to admins
 *
 * All sends are best-effort (never throw — a failed email must not break the API response).
 */
import { clerkClient } from "@clerk/express";
import { sendEmail } from "./mailer";
import { logger } from "./logger";

const GENHAL_URL = "https://genhal.awajimaa.com";
const BRAND = "GenHaL";
const ACCENT = "#b45309"; // amber-700

// ─── helpers ────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function clerkEmail(clerkUserId: string): Promise<string | null> {
  try {
    const u = await clerkClient.users.getUser(clerkUserId);
    return u.primaryEmailAddress?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? null;
  } catch {
    return null;
  }
}

function adminClerkIds(): string[] {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);
}

async function adminEmails(): Promise<string[]> {
  const ids = adminClerkIds();
  const emails = await Promise.all(ids.map(clerkEmail));
  return emails.filter((e): e is string => e !== null);
}

function wrap(body: string, actionUrl?: string, actionLabel?: string): string {
  const btn = actionUrl
    ? `<div style="text-align:center;margin:24px 0">
         <a href="${esc(actionUrl)}" style="background:${ACCENT};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 26px;border-radius:8px;display:inline-block">${esc(actionLabel ?? "Open GenHaL")}</a>
       </div>`
    : "";
  return `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#fafaf9;font-family:Georgia,serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e7e5e4">
  <div style="background:${ACCENT};padding:20px 28px">
    <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:0.02em">${BRAND} — Genealogy · Heritage · Language</span>
  </div>
  <div style="padding:28px 28px 8px">${body}</div>
  ${btn}
  <div style="padding:16px 28px 24px;border-top:1px solid #f0ede8;margin-top:8px;font-size:11px;color:#a8a29e;text-align:center">
    © ${new Date().getFullYear()} Awajimaa | <a href="${GENHAL_URL}" style="color:${ACCENT};text-decoration:none">genhal.awajimaa.com</a>
  </div>
</div></body></html>`;
}

async function trySend(to: string, subject: string, html: string) {
  try { await sendEmail({ to, subject, html }); }
  catch (err) { logger.warn({ err, to, subject }, "[genhal-emails] send failed (best-effort)"); }
}

// ─── 1. Welcome — Kingdom created ───────────────────────────────────────────

export async function sendKingdomWelcomeEmail(opts: {
  creatorClerkUserId: string;
  kingdomName: string;
  kingdomId: number;
  rulerTitle: string;
}) {
  const { creatorClerkUserId, kingdomName, kingdomId, rulerTitle } = opts;
  const [creatorEmail, admins] = await Promise.all([
    clerkEmail(creatorClerkUserId),
    adminEmails(),
  ]);
  const url = `${GENHAL_URL}/kingdoms/${kingdomId}`;

  if (creatorEmail) {
    await trySend(
      creatorEmail,
      `🏛️ Your kingdom "${kingdomName}" has been registered on ${BRAND}`,
      wrap(
        `<h2 style="color:#44403c;margin:0 0 12px">Welcome to ${BRAND}!</h2>
         <p style="color:#57534e;line-height:1.7">Your kingdom <strong>${esc(kingdomName)}</strong> is now live on GenHaL. You can start building your lineage, uploading heritage documents, and inviting members of the royal council.</p>
         <p style="color:#57534e;line-height:1.7">As the <em>${esc(rulerTitle)}</em> seat-holder, you are the account owner and can manage all settings, vault documents, and membership from your dashboard.</p>`,
        url,
        "Open Your Kingdom"
      )
    );
  }

  for (const adminEmail of admins) {
    await trySend(
      adminEmail,
      `[GenHaL Admin] New kingdom registered: ${kingdomName}`,
      wrap(
        `<h2 style="color:#44403c;margin:0 0 12px">New Kingdom Registered</h2>
         <p style="color:#57534e;line-height:1.7">A new kingdom account has just been created on ${BRAND}.</p>
         <table style="border-collapse:collapse;width:100%;margin:12px 0;font-size:13px">
           <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">Kingdom</td><td style="padding:6px 12px">${esc(kingdomName)}</td></tr>
           <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">Ruler Title</td><td style="padding:6px 12px">${esc(rulerTitle)}</td></tr>
           <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">Clerk ID</td><td style="padding:6px 12px">${esc(creatorClerkUserId)}</td></tr>
         </table>`,
        url,
        "View Kingdom"
      )
    );
  }
}

// ─── 2. Welcome — Family created ────────────────────────────────────────────

export async function sendFamilyWelcomeEmail(opts: {
  creatorClerkUserId: string;
  familyName: string;
  familyId: number;
}) {
  const { creatorClerkUserId, familyName, familyId } = opts;
  const [creatorEmail, admins] = await Promise.all([
    clerkEmail(creatorClerkUserId),
    adminEmails(),
  ]);
  const url = `${GENHAL_URL}/families/${familyId}`;

  if (creatorEmail) {
    await trySend(
      creatorEmail,
      `🏠 Your family account "${familyName}" is live on ${BRAND}`,
      wrap(
        `<h2 style="color:#44403c;margin:0 0 12px">Welcome to ${BRAND}!</h2>
         <p style="color:#57534e;line-height:1.7">Your family account <strong>${esc(familyName)}</strong> has been successfully registered. You are the Family Head and account owner.</p>
         <p style="color:#57534e;line-height:1.7">You can now upload heritage documents to the Vault, designate a Next of Kin for succession, invite family members, and set up your family bank accounts.</p>`,
        url,
        "Open Your Family Account"
      )
    );
  }

  for (const adminEmail of admins) {
    await trySend(
      adminEmail,
      `[GenHaL Admin] New family account registered: ${familyName}`,
      wrap(
        `<h2 style="color:#44403c;margin:0 0 12px">New Family Account Registered</h2>
         <p style="color:#57534e;line-height:1.7">A new family account has been created on ${BRAND}.</p>
         <table style="border-collapse:collapse;width:100%;margin:12px 0;font-size:13px">
           <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">Family</td><td style="padding:6px 12px">${esc(familyName)}</td></tr>
           <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">Clerk ID</td><td style="padding:6px 12px">${esc(creatorClerkUserId)}</td></tr>
         </table>`,
        url,
        "View Family Account"
      )
    );
  }
}

// ─── 3. Ownership claim filed ────────────────────────────────────────────────

export async function sendClaimFiledEmails(opts: {
  unitType: string;          // "kingdom" | "family" | "compound"
  unitId: number;
  unitName: string;
  ownerClerkUserId: string;  // current owner — receives security alert
  claimantName: string;
  claimantEmail: string;
  position: string;
  claimId: number;
}) {
  const { unitType, unitId, unitName, ownerClerkUserId, claimantName, claimantEmail, position, claimId } = opts;
  const [ownerEmail, admins] = await Promise.all([
    clerkEmail(ownerClerkUserId),
    adminEmails(),
  ]);
  const unitLabel = unitType.charAt(0).toUpperCase() + unitType.slice(1);
  const unitUrl   = unitType === "family"
    ? `${GENHAL_URL}/families/${unitId}`
    : `${GENHAL_URL}/kingdoms/${unitId}`;

  // Alert the current owner
  if (ownerEmail) {
    await trySend(
      ownerEmail,
      `⚠️ Ownership claim filed against your ${unitLabel} "${unitName}" on ${BRAND}`,
      wrap(
        `<h2 style="color:#b91c1c;margin:0 0 12px">Security Notice — Ownership Claim Received</h2>
         <p style="color:#57534e;line-height:1.7">Someone has filed an ownership claim against your ${unitLabel} account <strong>${esc(unitName)}</strong> on ${BRAND}. This is a notification for your awareness — no action has been taken yet.</p>
         <table style="border-collapse:collapse;width:100%;margin:12px 0;font-size:13px">
           <tr><td style="padding:6px 12px;background:#fef2f2;font-weight:600">Claimant</td><td style="padding:6px 12px">${esc(claimantName)}</td></tr>
           <tr><td style="padding:6px 12px;background:#fef2f2;font-weight:600">Claimant Email</td><td style="padding:6px 12px">${esc(claimantEmail)}</td></tr>
           <tr><td style="padding:6px 12px;background:#fef2f2;font-weight:600">Position Claimed</td><td style="padding:6px 12px">${esc(position)}</td></tr>
           <tr><td style="padding:6px 12px;background:#fef2f2;font-weight:600">Claim Reference</td><td style="padding:6px 12px">#${claimId}</td></tr>
         </table>
         <p style="color:#57534e;line-height:1.7">Our admin team will review the evidence provided. You will be notified of the outcome. If you believe this claim is fraudulent, please reply to this email immediately.</p>`,
        unitUrl,
        `View Your ${unitLabel}`
      )
    );
  }

  // Alert admins
  for (const adminEmail of admins) {
    await trySend(
      adminEmail,
      `[GenHaL Admin] New ownership claim #${claimId} — ${unitLabel}: ${unitName}`,
      wrap(
        `<h2 style="color:#44403c;margin:0 0 12px">New Ownership Claim Filed</h2>
         <p style="color:#57534e;line-height:1.7">A new ownership claim requires your review.</p>
         <table style="border-collapse:collapse;width:100%;margin:12px 0;font-size:13px">
           <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">Claim ID</td><td style="padding:6px 12px">#${claimId}</td></tr>
           <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">Unit Type</td><td style="padding:6px 12px">${esc(unitLabel)}</td></tr>
           <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">Unit Name</td><td style="padding:6px 12px">${esc(unitName)}</td></tr>
           <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">Position</td><td style="padding:6px 12px">${esc(position)}</td></tr>
           <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">Claimant</td><td style="padding:6px 12px">${esc(claimantName)} (${esc(claimantEmail)})</td></tr>
           <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">Current Owner ID</td><td style="padding:6px 12px">${esc(ownerClerkUserId)}</td></tr>
         </table>`,
        `${GENHAL_URL}/kingdoms/${unitId}`,
        "Review Claim"
      )
    );
  }
}

// ─── 4. Ownership claim status changed ──────────────────────────────────────

export async function sendClaimStatusEmails(opts: {
  status: string;
  claimantClerkUserId: string;
  claimantEmail: string;
  claimantName: string;
  unitType: string;
  unitId: number;
  unitName: string;
  position: string;
  adminNotes?: string;
  claimId: number;
  formerOwnerClerkUserId?: string;  // only set when approved
}) {
  const {
    status, claimantClerkUserId, claimantEmail, claimantName,
    unitType, unitId, unitName, position, adminNotes, claimId, formerOwnerClerkUserId
  } = opts;
  const unitLabel = unitType.charAt(0).toUpperCase() + unitType.slice(1);
  const unitUrl = unitType === "family"
    ? `${GENHAL_URL}/families/${unitId}`
    : `${GENHAL_URL}/kingdoms/${unitId}`;
  const admins = await adminEmails();

  if (status === "approved") {
    // Email new owner (claimant)
    await trySend(
      claimantEmail,
      `✅ Ownership of "${unitName}" has been transferred to you on ${BRAND}`,
      wrap(
        `<h2 style="color:#15803d;margin:0 0 12px">Congratulations — Ownership Transferred</h2>
         <p style="color:#57534e;line-height:1.7">Your ownership claim for <strong>${esc(unitName)}</strong> (${esc(position)}) has been <strong style="color:#15803d">approved</strong> by the ${BRAND} admin team.</p>
         <p style="color:#57534e;line-height:1.7">You are now the account owner. You can manage all settings, vault documents, members, and subscriptions from your dashboard.</p>
         ${adminNotes ? `<p style="color:#57534e;font-style:italic;border-left:3px solid ${ACCENT};padding-left:12px;margin:16px 0">Admin note: ${esc(adminNotes)}</p>` : ""}`,
        unitUrl,
        `Open ${unitLabel} Dashboard`
      )
    );

    // Email former owner
    if (formerOwnerClerkUserId) {
      const formerEmail = await clerkEmail(formerOwnerClerkUserId);
      if (formerEmail) {
        await trySend(
          formerEmail,
          `🔔 Ownership of "${unitName}" has been transferred on ${BRAND}`,
          wrap(
            `<h2 style="color:#b45309;margin:0 0 12px">Ownership Transfer Notice</h2>
             <p style="color:#57534e;line-height:1.7">Following a review of the ownership claim filed against your ${unitLabel} account <strong>${esc(unitName)}</strong>, the ${BRAND} admin team has approved the transfer of account ownership to <strong>${esc(claimantName)}</strong>.</p>
             <p style="color:#57534e;line-height:1.7">If you believe this decision was made in error, please contact the ${BRAND} admin team immediately by replying to this email.</p>
             ${adminNotes ? `<p style="color:#57534e;font-style:italic;border-left:3px solid #b91c1c;padding-left:12px;margin:16px 0">Admin note: ${esc(adminNotes)}</p>` : ""}`
          )
        );
      }
    }

    // Notify admins
    for (const adminEmail of admins) {
      await trySend(
        adminEmail,
        `[GenHaL Admin] Claim #${claimId} approved — ownership transferred to ${claimantName}`,
        wrap(
          `<h2 style="color:#44403c;margin:0 0 12px">Ownership Claim Approved</h2>
           <table style="border-collapse:collapse;width:100%;font-size:13px">
             <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">Claim ID</td><td style="padding:6px 12px">#${claimId}</td></tr>
             <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">${unitLabel}</td><td style="padding:6px 12px">${esc(unitName)}</td></tr>
             <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">New Owner</td><td style="padding:6px 12px">${esc(claimantName)} (${esc(claimantEmail)})</td></tr>
             <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">Former Owner Clerk ID</td><td style="padding:6px 12px">${formerOwnerClerkUserId ? esc(formerOwnerClerkUserId) : "N/A"}</td></tr>
           </table>`,
          unitUrl, "View Account"
        )
      );
    }

  } else if (status === "rejected") {
    await trySend(
      claimantEmail,
      `Your ownership claim for "${unitName}" was not approved — ${BRAND}`,
      wrap(
        `<h2 style="color:#b91c1c;margin:0 0 12px">Claim Not Approved</h2>
         <p style="color:#57534e;line-height:1.7">After reviewing your ownership claim for <strong>${esc(unitName)}</strong> (${esc(position)}), the ${BRAND} admin team has determined it does not meet the criteria for ownership transfer at this time.</p>
         ${adminNotes ? `<p style="color:#57534e;font-style:italic;border-left:3px solid #b91c1c;padding-left:12px;margin:16px 0">Reason: ${esc(adminNotes)}</p>` : ""}
         <p style="color:#57534e;line-height:1.7">If you have additional evidence or believe this decision was made in error, you may file a new claim with supporting documentation.</p>`
      )
    );

  } else if (status === "under_review") {
    await trySend(
      claimantEmail,
      `Your ownership claim for "${unitName}" is under review — ${BRAND}`,
      wrap(
        `<h2 style="color:#0369a1;margin:0 0 12px">Claim Under Review</h2>
         <p style="color:#57534e;line-height:1.7">Your ownership claim for <strong>${esc(unitName)}</strong> (${esc(position)}) is now being actively reviewed by our admin team. This process typically takes 3–7 business days.</p>
         <p style="color:#57534e;line-height:1.7">You will receive a follow-up email once a decision has been made. You do not need to take any further action at this time.</p>`
      )
    );
  }
}

// ─── 5. Succession claim filed ───────────────────────────────────────────────

export async function sendSuccessionClaimFiledEmails(opts: {
  familyId: number;
  familyName: string;
  familyHeadClerkUserId: string;
  claimerName: string;
  claimerEmail: string;
  relationshipToOwner: string;
  claimId: number;
}) {
  const { familyId, familyName, familyHeadClerkUserId, claimerName, claimerEmail, relationshipToOwner, claimId } = opts;
  const [headEmail, admins] = await Promise.all([
    clerkEmail(familyHeadClerkUserId),
    adminEmails(),
  ]);
  const url = `${GENHAL_URL}/families/${familyId}`;

  // Alert current head
  if (headEmail) {
    await trySend(
      headEmail,
      `⚠️ A succession claim has been filed for "${familyName}" on ${BRAND}`,
      wrap(
        `<h2 style="color:#b45309;margin:0 0 12px">Succession Claim Notice</h2>
         <p style="color:#57534e;line-height:1.7">A succession claim has been filed for the family account <strong>${esc(familyName)}</strong> on ${BRAND}. This is an informational notice — no changes have been made.</p>
         <table style="border-collapse:collapse;width:100%;margin:12px 0;font-size:13px">
           <tr><td style="padding:6px 12px;background:#fffbeb;font-weight:600">Claimer</td><td style="padding:6px 12px">${esc(claimerName)}</td></tr>
           <tr><td style="padding:6px 12px;background:#fffbeb;font-weight:600">Relationship</td><td style="padding:6px 12px">${esc(relationshipToOwner)}</td></tr>
           <tr><td style="padding:6px 12px;background:#fffbeb;font-weight:600">Claim Reference</td><td style="padding:6px 12px">#${claimId}</td></tr>
         </table>
         <p style="color:#57534e;line-height:1.7">The ${BRAND} admin team will review the submitted identification documents and contact you if further information is needed.</p>`,
        url, "View Family Account"
      )
    );
  }

  for (const adminEmail of admins) {
    await trySend(
      adminEmail,
      `[GenHaL Admin] Succession claim #${claimId} filed — Family: ${familyName}`,
      wrap(
        `<h2 style="color:#44403c;margin:0 0 12px">New Succession Claim Filed</h2>
         <table style="border-collapse:collapse;width:100%;font-size:13px">
           <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">Claim ID</td><td style="padding:6px 12px">#${claimId}</td></tr>
           <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">Family</td><td style="padding:6px 12px">${esc(familyName)}</td></tr>
           <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">Claimer</td><td style="padding:6px 12px">${esc(claimerName)} (${esc(claimerEmail)})</td></tr>
           <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">Relationship</td><td style="padding:6px 12px">${esc(relationshipToOwner)}</td></tr>
           <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">Current Head ID</td><td style="padding:6px 12px">${esc(familyHeadClerkUserId)}</td></tr>
         </table>`,
        url, "Review Family"
      )
    );
  }
}

// ─── 6. Succession claim approved ────────────────────────────────────────────

export async function sendSuccessionApprovedEmails(opts: {
  familyId: number;
  familyName: string;
  claimerName: string;
  claimerEmail: string;
  adminNotes?: string;
  claimId: number;
}) {
  const { familyId, familyName, claimerName, claimerEmail, adminNotes, claimId } = opts;
  const admins = await adminEmails();
  const url = `${GENHAL_URL}/families/${familyId}`;

  await trySend(
    claimerEmail,
    `✅ Succession approved — you are now the head of "${familyName}" on ${BRAND}`,
    wrap(
      `<h2 style="color:#15803d;margin:0 0 12px">Succession Approved — Welcome, Family Head</h2>
       <p style="color:#57534e;line-height:1.7">Your succession claim for the family account <strong>${esc(familyName)}</strong> has been <strong style="color:#15803d">approved</strong> by the ${BRAND} admin team.</p>
       <p style="color:#57534e;line-height:1.7">You are now the Family Head and account owner. You can manage all vault documents, members, succession settings, and subscriptions from your dashboard.</p>
       ${adminNotes ? `<p style="color:#57534e;font-style:italic;border-left:3px solid ${ACCENT};padding-left:12px;margin:16px 0">Admin note: ${esc(adminNotes)}</p>` : ""}`,
      url, "Open Family Dashboard"
    )
  );

  for (const adminEmail of admins) {
    await trySend(
      adminEmail,
      `[GenHaL Admin] Succession claim #${claimId} approved — new head: ${claimerName}`,
      wrap(
        `<h2 style="color:#44403c;margin:0 0 12px">Succession Approved</h2>
         <table style="border-collapse:collapse;width:100%;font-size:13px">
           <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">Claim ID</td><td style="padding:6px 12px">#${claimId}</td></tr>
           <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">Family</td><td style="padding:6px 12px">${esc(familyName)}</td></tr>
           <tr><td style="padding:6px 12px;background:#f5f5f4;font-weight:600">New Head</td><td style="padding:6px 12px">${esc(claimerName)} (${esc(claimerEmail)})</td></tr>
         </table>`,
        url, "View Family"
      )
    );
  }
}

// ─── 7. Succession claim rejected ────────────────────────────────────────────

export async function sendSuccessionRejectedEmail(opts: {
  familyName: string;
  claimerEmail: string;
  adminNotes?: string;
}) {
  const { familyName, claimerEmail, adminNotes } = opts;
  await trySend(
    claimerEmail,
    `Your succession claim for "${familyName}" was not approved — ${BRAND}`,
    wrap(
      `<h2 style="color:#b91c1c;margin:0 0 12px">Succession Claim Not Approved</h2>
       <p style="color:#57534e;line-height:1.7">After reviewing your succession claim for <strong>${esc(familyName)}</strong>, the ${BRAND} admin team has determined it does not meet the requirements for account transfer at this time.</p>
       ${adminNotes ? `<p style="color:#57534e;font-style:italic;border-left:3px solid #b91c1c;padding-left:12px;margin:16px 0">Reason: ${esc(adminNotes)}</p>` : ""}
       <p style="color:#57534e;line-height:1.7">If you have additional documentation or believe this decision was made in error, please contact the ${BRAND} support team.</p>`
    )
  );
}

// ─── 8. Proof-of-life reminder ────────────────────────────────────────────────

const VERIFY_URL = (token: string) =>
  `${GENHAL_URL}/verify?token=${encodeURIComponent(token)}`;

export async function sendLifeCheckReminderEmail(opts: {
  familyId: number;
  familyName: string;
  clerkUserId: string;
  token: string;
  sequence: number;
}) {
  const { familyId, familyName, clerkUserId, token, sequence } = opts;
  const to = await clerkEmail(clerkUserId);
  if (!to) return;

  const dashUrl = `${GENHAL_URL}/families/${familyId}`;
  const verifyUrl = VERIFY_URL(token);
  const ordinal = ["", "first", "second", "third", "fourth"][sequence] ?? `#${sequence}`;

  await trySend(
    to,
    `${BRAND} — Quarterly check-in: please confirm you're reachable`,
    wrap(
      `<h2 style="color:#44403c;margin:0 0 12px">Quarterly Family Record Check-In</h2>
       <p style="color:#57534e;line-height:1.7">
         Hello! This is your ${ordinal} quarterly reminder from <strong>${BRAND}</strong> for
         the family account <strong>${esc(familyName)}</strong>.
       </p>
       <p style="color:#57534e;line-height:1.7">
         To confirm that your family records are still active and under your care,
         please click the button below or enter your personal verification code on the ${BRAND} website.
       </p>
       <div style="text-align:center;margin:20px 0">
         <span style="font-size:28px;font-weight:700;letter-spacing:0.15em;color:#b45309;background:#fef3c7;border:2px solid #fcd34d;border-radius:10px;padding:10px 24px;display:inline-block">${esc(token)}</span>
       </div>
       <p style="color:#78716c;font-size:13px;text-align:center">
         This code expires in 90 days. You can also use it at
         <a href="${GENHAL_URL}/verify" style="color:${ACCENT}">${GENHAL_URL}/verify</a>
       </p>
       <hr style="border:none;border-top:1px solid #f0ede8;margin:20px 0"/>
       <p style="color:#57534e;line-height:1.7">
         While you're here, we recommend also reviewing and updating your
         <a href="${dashUrl}#wills" style="color:${ACCENT}">will documents</a> and
         <a href="${dashUrl}" style="color:${ACCENT}">family profile</a>
         to make sure everything is current.
       </p>
       ${sequence > 1 ? `<p style="color:#b91c1c;font-size:13px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px">
         ⚠️ We have not heard back from you in the last ${sequence - 1} quarter${sequence > 2 ? 's' : ''}. After four unanswered check-ins we will contact your designated Next of Kin.
       </p>` : ""}`,
      verifyUrl,
      "✅ Confirm I'm Here"
    )
  );
}

// ─── 9. Next-of-Kin alert after 4 missed checks ───────────────────────────────

export async function sendNextOfKinAlertEmail(opts: {
  familyId: number;
  familyName: string;
  nokName: string | null;
  nokEmail: string;
}) {
  const { familyId, familyName, nokName, nokEmail } = opts;
  const dashUrl = `${GENHAL_URL}/families/${familyId}`;

  await trySend(
    nokEmail,
    `${BRAND} — We have been unable to reach the head of "${familyName}"`,
    wrap(
      `<h2 style="color:#92400e;margin:0 0 12px">Family Record — Welfare Check Notice</h2>
       <p style="color:#57534e;line-height:1.7">
         Dear ${nokName ? esc(nokName) : "Next of Kin"},
       </p>
       <p style="color:#57534e;line-height:1.7">
         We are writing to you as the designated Next of Kin for the
         <strong>${esc(familyName)}</strong> family account on <strong>${BRAND}</strong>.
       </p>
       <p style="color:#57534e;line-height:1.7">
         Over the past twelve months we have sent four quarterly check-in reminders
         to the account holder and have not received any response. As part of our
         commitment to keeping family records accurate and secure, we are reaching out
         to confirm that the account holder can still be reached.
       </p>
       <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:16px 20px;margin:16px 0">
         <p style="color:#92400e;margin:0;font-weight:600">What you can do</p>
         <ul style="color:#57534e;margin:8px 0 0;padding-left:20px;line-height:1.8">
           <li>If the account holder is well, please ask them to log in and confirm their presence at the link below.</li>
           <li>If the account holder has passed away, you may file a succession claim so the family records can be properly maintained.</li>
           <li>If you need assistance, please contact the ${BRAND} support team.</li>
         </ul>
       </div>
       <p style="color:#57534e;line-height:1.7">
         We take the privacy and integrity of family heritage records seriously and will not
         take any action on the account without proper verification.
       </p>`,
      dashUrl,
      "View Family Account"
    )
  );
}
