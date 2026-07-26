/**
 * Stock Alert Scheduler
 *
 * Runs every hour. Checks all products with maxStock > 0.
 * When a product's stock drops through a threshold (60%, 40%, 20% of maxStock),
 * fires an in-app notification + push notification — transition-based so each
 * level fires exactly once per descent (not every tick).
 *
 * Recovery: when stock rises back above 70% of maxStock, the lastStockAlertLevel
 * is reset to NULL so the cycle can start again on next drop.
 */
import { db, productsTable, vendorNotificationsTable, vendorsTable, vendorStockAlertSettingsTable } from "@workspace/db";
import { eq, gt, and, sql } from "drizzle-orm";
import { sendPushToVendor } from "./push";
import { recordJobRun } from "./job-run-status";
import { logger } from "./logger";

const JOB_NAME = "stock-alert-check";
const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/** Returns the most-severe threshold level (20 > 40 > 60) a stock pct is at, or null if above all thresholds. */
function alertLevel(stockPct: number): 20 | 40 | 60 | null {
  if (stockPct <= 20) return 20;
  if (stockPct <= 40) return 40;
  if (stockPct <= 60) return 60;
  return null;
}

async function tick(): Promise<{ checked: number; alerted: number }> {
  // Fetch all active products with maxStock > 0 and their stock levels + vendor settings
  const products = await db
    .select({
      id: productsTable.id,
      vendorId: productsTable.vendorId,
      name: productsTable.name,
      stockQuantity: productsTable.stockQuantity,
      maxStock: productsTable.maxStock,
      lastStockAlertLevel: productsTable.lastStockAlertLevel,
    })
    .from(productsTable)
    .where(and(
      gt(productsTable.maxStock, 0),
      eq(productsTable.status, "active"),
    ));

  if (products.length === 0) return { checked: 0, alerted: 0 };

  // Load all vendor alert settings in one query
  const settingsRows = await db.select().from(vendorStockAlertSettingsTable);
  const settingsMap = new Map(settingsRows.map(s => [s.vendorId, s]));

  let alerted = 0;

  for (const product of products) {
    const stockPct = (product.stockQuantity / product.maxStock) * 100;
    const currentLevel = alertLevel(stockPct);
    const lastLevel = product.lastStockAlertLevel as 20 | 40 | 60 | null;

    // If stock has recovered well above 60%, reset the alert cycle
    if (stockPct > 70 && lastLevel !== null) {
      await db
        .update(productsTable)
        .set({ lastStockAlertLevel: null })
        .where(eq(productsTable.id, product.id));
      continue;
    }

    if (!currentLevel) continue; // above 60% — no alert needed

    // Only fire if this is a new (more severe) level
    if (lastLevel !== null && currentLevel >= lastLevel) continue;

    // Check if vendor has this alert tier enabled
    const settings = settingsMap.get(product.vendorId);
    const tierEnabled =
      currentLevel === 60 ? (settings?.alert60Enabled ?? true) :
      currentLevel === 40 ? (settings?.alert40Enabled ?? true) :
      (settings?.alert20Enabled ?? true);

    if (!tierEnabled) continue;

    // Fire the alert
    const severity = currentLevel <= 20 ? "Critical" : currentLevel <= 40 ? "Warning" : "Notice";
    const message = `${severity}: "${product.name}" stock is at ${stockPct.toFixed(0)}% (${product.stockQuantity} / ${product.maxStock} units). Time to reorder.`;

    await db.insert(vendorNotificationsTable).values({
      vendorId: product.vendorId,
      type: "stock_alert",
      message,
      resourceId: product.id,
    });

    await sendPushToVendor(
      product.vendorId,
      `${severity}: Low Stock — ${product.name}`,
      `Stock at ${stockPct.toFixed(0)}% (${product.stockQuantity} units remaining)`,
      { screen: "inventory", productId: product.id },
    );

    // Record the new alert level
    await db
      .update(productsTable)
      .set({ lastStockAlertLevel: currentLevel })
      .where(eq(productsTable.id, product.id));

    alerted++;
    logger.info({ productId: product.id, vendorId: product.vendorId, level: currentLevel }, "[stock-alert] Alert fired");
  }

  return { checked: products.length, alerted };
}

export function startStockAlertScheduler(): void {
  const run = async () => {
    try {
      const counts = await tick();
      await recordJobRun(JOB_NAME, { success: true, checkedCount: counts.checked, affectedCount: counts.alerted });
      logger.info(counts, "[stock-alert] Tick complete");
    } catch (err) {
      await recordJobRun(JOB_NAME, { success: false, error: String(err) }).catch(() => {});
      logger.error({ err }, "[stock-alert] Tick failed");
    }
  };

  run();
  setInterval(run, INTERVAL_MS);
  logger.info({ intervalHours: 1 }, "[stock-alert] Stock alert scheduler started");
}
