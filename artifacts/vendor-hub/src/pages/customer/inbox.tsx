import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import CustomerLayout from "./layout";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const TYPE_ICON: Record<string, string> = {
  order_confirmed: "✅",
  order_shipped:   "🚚",
  order_failed:    "❌",
  promo:           "🎁",
  system:          "🔔",
};

export default function CustomerInbox() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["customer-notifications-inbox"],
    queryFn: () => fetch(`${BASE}/api/customer/notifications`).then(r => r.json()),
  });

  const markAllRead = useMutation({
    mutationFn: () => fetch(`${BASE}/api/customer/notifications/read-all`, { method: "PUT" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-notifications-inbox"] });
      qc.invalidateQueries({ queryKey: ["customer-notifications-count"] });
    },
  });

  const markOneRead = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/customer/notifications/${id}/read`, { method: "PUT" }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-notifications-inbox"] });
      qc.invalidateQueries({ queryKey: ["customer-notifications-count"] });
    },
  });

  const notifications = data?.notifications ?? [];
  const unread = data?.unreadCount ?? 0;

  return (
    <CustomerLayout>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
          {unread > 0 && (
            <button onClick={() => markAllRead.mutate()}
              className="text-xs font-bold text-violet-600 hover:text-violet-700 disabled:opacity-50"
              disabled={markAllRead.isPending}>
              Mark all as read
            </button>
          )}
        </div>
        <p className="text-muted-foreground text-sm mb-6">{unread > 0 ? `${unread} unread message${unread > 1 ? "s" : ""}` : "All caught up!"}</p>

        {isLoading && <div className="text-center py-16 text-muted-foreground animate-pulse">Loading…</div>}

        {!isLoading && notifications.length === 0 && (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📬</div>
            <p className="font-bold text-gray-800 mb-2">No messages yet</p>
            <p className="text-muted-foreground text-sm">Order confirmations, updates, and platform news will appear here.</p>
          </div>
        )}

        <div className="space-y-2">
          {notifications.map((n: { id: number; type: string; title: string; message: string; read: boolean; createdAt: string }) => (
            <div key={n.id}
              onClick={() => !n.read && markOneRead.mutate(n.id)}
              className={`bg-white border rounded-2xl p-4 shadow-sm cursor-pointer transition-all ${
                n.read ? "border-gray-100 opacity-75" : "border-violet-200 shadow-violet-100"}`}>
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5 shrink-0">{TYPE_ICON[n.type] ?? "🔔"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className={`text-sm ${n.read ? "font-medium text-gray-700" : "font-bold text-gray-900"}`}>{n.title}</p>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{n.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-2">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </CustomerLayout>
  );
}
