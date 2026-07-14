import { useListVendorNotifications } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpCircle, ArrowDownCircle, History } from "lucide-react";
import { format } from "date-fns";

interface Props {
  vendorId: number;
}

const TIER_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };
const TIER_LABEL: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

function tierLabel(tier: string): string {
  return TIER_LABEL[tier] ?? tier;
}

/** Turns the structured previousTier/newTier on a tier_change notification into a plain-language reason. */
function describeChange(previousTier: string, newTier: string, message: string): string {
  const isDowngradeToFree = newTier === "free" && (TIER_RANK[previousTier] ?? 0) > 0;
  if (isDowngradeToFree) {
    // The stored message already distinguishes cancellation vs. reconciliation-detected
    // lapse ("...subscription has been cancelled..." vs "...no longer active...").
    if (/no longer active/i.test(message)) return "Subscription lapsed (no active payment found) — auto-downgraded to Free";
    if (/cancel/i.test(message)) return "Subscription cancelled";
    if (/refund/i.test(message)) return "Subscription refunded";
    return "Moved back to Free";
  }
  const isUpgrade = (TIER_RANK[newTier] ?? 0) > (TIER_RANK[previousTier] ?? 0);
  return isUpgrade ? "Upgraded plan" : "Changed plan";
}

/**
 * Vendor-facing billing history: a timeline of past tier changes (upgrades,
 * cancellations, refunds, and reconciliation-detected lapses) with timestamp
 * and reason. Reuses the same vendor_notifications rows (type: "tier_change")
 * the admin plan-change history and in-app notification bell already rely on
 * — see the tier-downgrade notification pattern in project memory.
 */
export default function BillingHistoryCard({ vendorId }: Props) {
  const { data: notifications, isLoading } = useListVendorNotifications(vendorId);

  const history = (notifications ?? [])
    .filter((n) => n.type === "tier_change" && n.previousTier && n.newTier)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="w-4 h-4" />
          Billing History
        </CardTitle>
        <CardDescription>Past plan changes on this account, including automatic downgrades.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-billing-history">
            No plan changes yet.
          </p>
        ) : (
          <ul className="space-y-3" data-testid="list-billing-history">
            {history.map((n) => {
              const previousTier = n.previousTier as string;
              const newTier = n.newTier as string;
              const isDown = (TIER_RANK[newTier] ?? 0) < (TIER_RANK[previousTier] ?? 0);
              return (
                <li key={n.id} className="flex items-start gap-3" data-testid={`row-billing-history-${n.id}`}>
                  {isDown ? (
                    <ArrowDownCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  ) : (
                    <ArrowUpCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{tierLabel(previousTier)}</Badge>
                      <span className="text-muted-foreground text-xs">&rarr;</span>
                      <Badge variant={isDown ? "destructive" : "default"}>{tierLabel(newTier)}</Badge>
                    </div>
                    <p className="text-sm text-foreground mt-1">{describeChange(previousTier, newTier, n.message)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(n.createdAt), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
