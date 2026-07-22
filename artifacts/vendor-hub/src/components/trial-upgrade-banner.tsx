/**
 * TrialUpgradeBanner
 *
 * Shows a sticky banner when the current vendor has an active free trial.
 * - Days 1–2: soft info strip (blue)
 * - Day 3+: amber urgency strip with "Upgrade Now" CTA
 * - Last 24 h: red critical strip
 */
import { useUser } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { X, Clock, Zap } from "lucide-react";
import { useState } from "react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface TrialStatus {
  trialEndsAt: string | null;
  trialStartedAt: string | null;
  trialDurationDays: number | null;
  vendorId: number | null;
}

async function fetchTrialStatus(userId: string): Promise<TrialStatus> {
  const res = await fetch(`${BASE_URL}/api/vendors/trial-status?clerkUserId=${encodeURIComponent(userId)}`, {
    credentials: "include",
  });
  if (!res.ok) return { trialEndsAt: null, trialStartedAt: null, trialDurationDays: null, vendorId: null };
  return res.json() as Promise<TrialStatus>;
}

export function TrialUpgradeBanner() {
  const { user } = useUser();
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState(false);

  const { data } = useQuery({
    queryKey: ["trial-status", user?.id],
    queryFn: () => fetchTrialStatus(user!.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  if (!data?.trialEndsAt || dismissed) return null;

  const now = Date.now();
  const endsAt = new Date(data.trialEndsAt).getTime();
  const startedAt = data.trialStartedAt ? new Date(data.trialStartedAt).getTime() : now;

  // Trial expired
  if (endsAt <= now) return null;

  const msRemaining = endsAt - now;
  const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
  const daysElapsed = Math.floor((now - startedAt) / (1000 * 60 * 60 * 24));
  const totalDays = data.trialDurationDays ?? 7;

  // Don't show on first 2 days (before day 3)
  const showUrgency = daysElapsed >= 3;
  if (!showUrgency) return null;

  const isCritical = daysRemaining <= 1;
  const isWarning = daysRemaining <= 3;

  const bg = isCritical
    ? "bg-red-600"
    : isWarning
    ? "bg-amber-500"
    : "bg-blue-600";

  const label =
    daysRemaining === 1
      ? "Your trial expires today!"
      : `${daysRemaining} days left on your ${totalDays}-day free trial`;

  return (
    <div
      className={`${bg} text-white text-sm flex items-center justify-between gap-3 px-4 py-2 z-50`}
      role="alert"
    >
      <div className="flex items-center gap-2 min-w-0">
        {isCritical ? (
          <Clock className="w-4 h-4 shrink-0 animate-pulse" />
        ) : (
          <Zap className="w-4 h-4 shrink-0" />
        )}
        <span className="font-medium truncate">{label}</span>
        <span className="hidden sm:inline text-white/80">— upgrade to keep full access.</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => navigate("/account")}
          className="bg-white/20 hover:bg-white/30 transition-colors rounded-md px-3 py-1 text-xs font-semibold whitespace-nowrap"
        >
          {isCritical ? "Upgrade Now" : "See Plans"}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-0.5 hover:bg-white/20 rounded transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
