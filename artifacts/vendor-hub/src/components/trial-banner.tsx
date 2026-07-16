/**
 * Trial banner — shown at the top of the vendor billing section when the
 * vendor has an active free trial. Tells them how many days remain and which
 * plan they'll be billed for when the trial ends.
 */
import { AlertTriangle, Clock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface TrialBannerProps {
  trialEndsAt: string;       // ISO timestamp
  subscriptionTier: string;  // e.g. "starter"
  vendorId: number;
  /** Called after the vendor opens the billing portal to add/manage their card. */
  onManageBilling?: () => void;
}

export default function TrialBanner({ trialEndsAt, subscriptionTier, vendorId, onManageBilling }: TrialBannerProps) {
  const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

  const ends = new Date(trialEndsAt);
  const now = new Date();
  const msLeft = ends.getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
  const isExpiringSoon = daysLeft <= 3;

  const dateStr = ends.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const tierName = subscriptionTier.charAt(0).toUpperCase() + subscriptionTier.slice(1);

  async function openPortal() {
    try {
      const returnUrl = `${window.location.origin}${window.location.pathname}`;
      const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/subscription/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ returnUrl }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      }
    } catch {
      // ignore — portal is optional convenience
    }
    onManageBilling?.();
  }

  return (
    <Alert
      className={`mb-4 border ${
        isExpiringSoon
          ? "border-amber-500/50 bg-amber-950/20"
          : "border-violet-600/40 bg-violet-950/20"
      }`}
    >
      <div className="flex items-start gap-3">
        {isExpiringSoon ? (
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
        ) : (
          <Clock className="w-4 h-4 mt-0.5 shrink-0 text-violet-400" />
        )}
        <AlertDescription className="flex-1">
          <span className={`font-semibold ${isExpiringSoon ? "text-amber-300" : "text-violet-300"}`}>
            {daysLeft > 0
              ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your ${tierName} free trial`
              : `Your ${tierName} free trial ends today`}
          </span>
          <span className="text-muted-foreground text-sm ml-2">
            {isExpiringSoon
              ? `Your card will be charged on ${dateStr}.`
              : `Your trial ends on ${dateStr}. Your card on file will be charged automatically.`}
          </span>
        </AlertDescription>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 ml-2"
          onClick={openPortal}
        >
          Manage card
        </Button>
      </div>
    </Alert>
  );
}
