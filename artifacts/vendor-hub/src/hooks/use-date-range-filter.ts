import { useMemo, useState } from "react";

export type DateRangePreset = "all" | "week" | "month" | "year" | "custom";

/**
 * Shared "This week / This month / This year / Custom" date-range filter used
 * across Sales, Expenses, Investments, and Orders. Returns ISO from/to strings
 * (or undefined for "all") ready to hand straight to a list query's params.
 */
export function useDateRangeFilter() {
  const [preset, setPreset] = useState<DateRangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { from, to } = useMemo(() => {
    if (preset === "all") return { from: undefined as string | undefined, to: undefined as string | undefined };
    if (preset === "custom") {
      return {
        from: customFrom ? new Date(customFrom).toISOString() : undefined,
        to: customTo ? new Date(`${customTo}T23:59:59`).toISOString() : undefined,
      };
    }
    const now = new Date();
    const start = new Date(now);
    if (preset === "week") start.setDate(now.getDate() - 7);
    else if (preset === "month") start.setMonth(now.getMonth() - 1);
    else if (preset === "year") start.setFullYear(now.getFullYear() - 1);
    return { from: start.toISOString(), to: now.toISOString() };
  }, [preset, customFrom, customTo]);

  return { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, from, to };
}
