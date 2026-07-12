import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { Bell, Cake, TrendingUp, Info, PhoneCall } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useListVendors } from "@workspace/api-client-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type VendorNotification = {
  id: number;
  vendorId: number;
  type: string;
  message: string;
  adminUserId: string | null;
  adminDisplayName: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationBell() {
  const { user } = useUser();
  const { data: vendors } = useListVendors();
  const qc = useQueryClient();

  const myVendor = vendors?.find((v) => v.clerkUserId === user?.id);
  const vendorId = myVendor?.id;

  const { data: notifications } = useQuery<VendorNotification[]>({
    queryKey: ["vendor-notifications", vendorId],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/notifications`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load notifications");
      return res.json();
    },
    enabled: Boolean(vendorId),
    refetchInterval: 60 * 1000,
  });

  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0;

  async function markAsRead(notificationId: number) {
    if (!vendorId) return;
    await fetch(`${BASE_URL}/api/vendors/${vendorId}/notifications/${notificationId}/read`, {
      method: "PATCH",
      credentials: "include",
    });
    qc.invalidateQueries({ queryKey: ["vendor-notifications", vendorId] });
  }

  if (!vendorId) return null;

  function typeIcon(type: string) {
    switch (type) {
      case "birthday":
        return <Cake className="w-4 h-4 text-pink-500 shrink-0 mt-0.5" />;
      case "tier_change":
        return <TrendingUp className="w-4 h-4 text-primary shrink-0 mt-0.5" />;
      case "voice_campaign":
        return <PhoneCall className="w-4 h-4 text-accent shrink-0 mt-0.5" />;
      default:
        return <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />;
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] leading-none"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-3 border-b">
          <p className="text-sm font-semibold">Notifications</p>
        </div>
        <ScrollArea className="max-h-80">
          {!notifications || notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">No notifications yet.</p>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3 text-sm flex items-start gap-2 ${!n.readAt ? "bg-primary/5" : ""}`}
                >
                  {typeIcon(n.type)}
                  <div className="flex-1 min-w-0">
                    {n.type === "general" && n.adminDisplayName && (
                      <p className="text-xs font-medium text-muted-foreground mb-0.5">
                        From {n.adminDisplayName}
                      </p>
                    )}
                    <p className="text-foreground">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  {!n.readAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-auto px-2 py-1 shrink-0"
                      onClick={() => markAsRead(n.id)}
                      data-testid={`button-mark-read-${n.id}`}
                    >
                      Mark read
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
