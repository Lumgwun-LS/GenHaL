import { Router } from "express";
import { db, paymentsTable, ordersTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import stripeRouter from "./stripe";
import paystackRouter from "./paystack";

const router = Router();

// Mount sub-routers
router.use(stripeRouter);
router.use(paystackRouter);

/**
 * GET /payments
 * List all payment transactions. Filterable by vendorId, provider, status.
 */
router.get("/payments", async (req, res): Promise<void> => {
  const { vendorId, provider, status } = req.query as {
    vendorId?: string;
    provider?: string;
    status?: string;
  };

  let payments = await db
    .select()
    .from(paymentsTable)
    .orderBy(desc(paymentsTable.createdAt));

  if (vendorId) payments = payments.filter((p) => p.vendorId === parseInt(vendorId));
  if (provider) payments = payments.filter((p) => p.provider === provider);
  if (status) payments = payments.filter((p) => p.status === status);

  // Compute revenue summary
  const paidPayments = payments.filter((p) => p.status === "paid");
  const revenueByProvider = {
    stripe: paidPayments
      .filter((p) => p.provider === "stripe")
      .reduce((s, p) => s + parseFloat(p.amount), 0),
    paystack: paidPayments
      .filter((p) => p.provider === "paystack")
      .reduce((s, p) => s + parseFloat(p.amount), 0),
  };

  res.json({
    payments: payments.map((p) => ({ ...p, amount: parseFloat(p.amount) })),
    summary: {
      total: payments.length,
      paid: paidPayments.length,
      totalRevenue: paidPayments.reduce((s, p) => s + parseFloat(p.amount), 0),
      revenueByProvider,
    },
  });
});

export default router;
