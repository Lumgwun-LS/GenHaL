import { Router } from "express";
import { db, vendorPushTokensTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireExternalAuth } from "../../middlewares/requireExternalAuth";

const router = Router();
router.use(requireExternalAuth);

/**
 * POST /external/push/register
 * Registers (or re-registers) this device's Expo push token for the
 * authenticated vendor so the api-server can send instant push
 * notifications (e.g. payment status changes) to their phone.
 *
 * A token belongs to exactly one vendor at a time — if it was previously
 * registered under a different vendor (e.g. device changed accounts),
 * ownership is reassigned to the current vendor.
 */
router.post("/push/register", async (req, res): Promise<void> => {
  const { vendorId } = req.externalUser!;
  const { expoPushToken } = (req.body ?? {}) as { expoPushToken?: string };

  if (!expoPushToken || typeof expoPushToken !== "string") {
    res.status(400).json({ error: "expoPushToken is required" });
    return;
  }

  await db
    .insert(vendorPushTokensTable)
    .values({ vendorId, expoPushToken })
    .onConflictDoUpdate({
      target: vendorPushTokensTable.expoPushToken,
      set: { vendorId, updatedAt: new Date() },
    });

  res.status(200).json({ ok: true });
});

/**
 * POST /external/push/unregister
 * Removes a device's push token, e.g. on logout, so the signed-out device
 * stops receiving notifications for this vendor.
 */
router.post("/push/unregister", async (req, res): Promise<void> => {
  const { vendorId } = req.externalUser!;
  const { expoPushToken } = (req.body ?? {}) as { expoPushToken?: string };
  if (!expoPushToken || typeof expoPushToken !== "string") {
    res.status(400).json({ error: "expoPushToken is required" });
    return;
  }

  // Scoped to the authenticated vendor so a caller can never unregister a
  // token belonging to someone else, even if they somehow learn its value.
  await db
    .delete(vendorPushTokensTable)
    .where(
      and(
        eq(vendorPushTokensTable.expoPushToken, expoPushToken),
        eq(vendorPushTokensTable.vendorId, vendorId),
      ),
    );
  res.status(200).json({ ok: true });
});

export default router;
