/**
 * Shared finance-overview computation: turns raw sales/expenses/investments
 * rows for a date range into the 5 views used by both the per-vendor
 * finance-overview endpoint (routes/analytics.ts) and the admin cross-vendor
 * finance rollup (routes/admin-analytics.ts). Keeping this logic in one
 * place means both callers stay in sync automatically.
 */

export interface FinanceSaleRow {
  amount: string;
  saleDate: Date;
}

export interface FinanceExpenseRow {
  amount: string;
  expenseDate: Date;
  category: string;
}

export interface FinanceInvestmentRow {
  id: number;
  name: string;
  type: string;
  amount: string;
  currentValue: string | null;
}

export interface FinanceOverviewComputation {
  revenueTrend: { date: string; revenue: number }[];
  profitAndLoss: {
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    byPeriod: { date: string; revenue: number; expenses: number; profit: number }[];
  };
  expenseByCategory: { category: string; total: number }[];
  investmentRoi: {
    totalInvested: number;
    totalCurrentValue: number;
    overallRoiPercent: number;
    byInvestment: { id: number; name: string; type: string; invested: number; currentValue: number; roiPercent: number }[];
  };
  cashFlowForecast: { date: string; projectedNet: number; isForecast: boolean }[];
}

export function computeFinanceOverview(
  sales: FinanceSaleRow[],
  expenses: FinanceExpenseRow[],
  investments: FinanceInvestmentRow[],
  from: Date,
  to: Date,
): FinanceOverviewComputation {
  // ── Revenue trend (by day) ──────────────────────────────────────────────
  const revenueByDayMap: Record<string, number> = {};
  for (const s of sales) {
    const key = s.saleDate.toISOString().split("T")[0]!;
    revenueByDayMap[key] = (revenueByDayMap[key] ?? 0) + parseFloat(s.amount);
  }
  const revenueTrend = Object.entries(revenueByDayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue }));

  // ── Profit & loss (by day) ───────────────────────────────────────────────
  const expenseByDayMap: Record<string, number> = {};
  for (const e of expenses) {
    const key = e.expenseDate.toISOString().split("T")[0]!;
    expenseByDayMap[key] = (expenseByDayMap[key] ?? 0) + parseFloat(e.amount);
  }
  const allDays = Array.from(new Set([...Object.keys(revenueByDayMap), ...Object.keys(expenseByDayMap)])).sort();
  const byPeriod = allDays.map((date) => {
    const revenue = revenueByDayMap[date] ?? 0;
    const expensesTotal = expenseByDayMap[date] ?? 0;
    return { date, revenue, expenses: expensesTotal, profit: revenue - expensesTotal };
  });
  const totalRevenue = sales.reduce((s, r) => s + parseFloat(r.amount), 0);
  const totalExpenses = expenses.reduce((s, r) => s + parseFloat(r.amount), 0);

  // ── Expense breakdown by category ────────────────────────────────────────
  const categoryMap: Record<string, number> = {};
  for (const e of expenses) {
    categoryMap[e.category] = (categoryMap[e.category] ?? 0) + parseFloat(e.amount);
  }
  const expenseByCategory = Object.entries(categoryMap)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  // ── Investment ROI ───────────────────────────────────────────────────────
  const byInvestment = investments.map((inv) => {
    const invested = parseFloat(inv.amount);
    const currentValue = inv.currentValue ? parseFloat(inv.currentValue) : invested;
    const roiPercent = invested > 0 ? ((currentValue - invested) / invested) * 100 : 0;
    return { id: inv.id, name: inv.name, type: inv.type, invested, currentValue, roiPercent };
  });
  const totalInvested = byInvestment.reduce((s, i) => s + i.invested, 0);
  const totalCurrentValue = byInvestment.reduce((s, i) => s + i.currentValue, 0);
  const overallRoiPercent = totalInvested > 0 ? ((totalCurrentValue - totalInvested) / totalInvested) * 100 : 0;

  // ── Cash flow forecast ────────────────────────────────────────────────────
  // Simple linear projection: extend the average daily net (revenue - expenses)
  // from the selected range forward for the same number of days.
  const rangeDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
  const avgDailyNet = (totalRevenue - totalExpenses) / rangeDays;
  const historicalCashFlow = byPeriod.map((p) => ({ date: p.date, projectedNet: p.profit, isForecast: false }));
  const forecastDays = Math.min(30, rangeDays);
  const forecastCashFlow = Array.from({ length: forecastDays }, (_, idx) => {
    const date = new Date(to.getTime() + (idx + 1) * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;
    return { date, projectedNet: avgDailyNet, isForecast: true };
  });

  return {
    revenueTrend,
    profitAndLoss: { totalRevenue, totalExpenses, netProfit: totalRevenue - totalExpenses, byPeriod },
    expenseByCategory,
    investmentRoi: { totalInvested, totalCurrentValue, overallRoiPercent, byInvestment },
    cashFlowForecast: [...historicalCashFlow, ...forecastCashFlow],
  };
}
