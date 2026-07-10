/** Shared helper for turning a period keyword or explicit from/to into a concrete date range. */
export type Period = "week" | "month" | "year" | "custom";

export function resolveDateRange(query: { period?: string; from?: string; to?: string }): { from: Date; to: Date; period: Period } {
  const to = query.to ? new Date(query.to) : new Date();
  const validTo = isNaN(to.getTime()) ? new Date() : to;

  if (query.period === "custom" || (query.from && query.to)) {
    const from = query.from ? new Date(query.from) : new Date(validTo.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from: isNaN(from.getTime()) ? new Date(validTo.getTime() - 30 * 24 * 60 * 60 * 1000) : from, to: validTo, period: "custom" };
  }

  const period: Period = query.period === "year" ? "year" : query.period === "month" ? "month" : "week";
  const msByPeriod: Record<Exclude<Period, "custom">, number> = {
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
  };
  const from = new Date(validTo.getTime() - msByPeriod[period]);
  return { from, to: validTo, period };
}
