import { useGetAnalyticsOverview } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Users, ShoppingCart, Target, Share2, Package, Activity } from "lucide-react";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: analytics, isLoading } = useGetAnalyticsOverview();

  if (isLoading) {
    return <div className="p-8 flex items-center justify-center min-h-[50vh]">Loading dashboard...</div>;
  }

  const stats = [
    { title: "Total Revenue", value: `$${(analytics?.totalRevenue || 0).toLocaleString()}`, icon: DollarSign, color: "text-emerald-500" },
    { title: "Pending Orders", value: analytics?.pendingOrders || 0, icon: ShoppingCart, color: "text-amber-500" },
    { title: "Total Leads", value: analytics?.totalLeads || 0, icon: Target, color: "text-blue-500" },
    { title: "Total Vendors", value: analytics?.totalVendors || 0, icon: Users, color: "text-primary" },
    { title: "Low Stock Alerts", value: analytics?.lowStockAlerts || 0, icon: Package, color: "text-destructive" },
    { title: "Social Posts", value: analytics?.totalPosts || 0, icon: Share2, color: "text-purple-500" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground">Welcome to your VendorHub command center.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Revenue Overview</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center min-h-[300px] text-muted-foreground">
            {/* We will implement a Recharts chart here in a later step if time permits */}
            <div className="flex flex-col items-center">
              <Activity className="w-12 h-12 mb-4 opacity-20" />
              <p>Chart rendering requires Recharts setup.</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity feed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {analytics?.recentActivity?.length ? (
                analytics.recentActivity.map((activity, i) => (
                  <div key={i} className="flex items-center">
                    <div className="ml-4 space-y-1">
                      <p className="text-sm font-medium leading-none">{activity.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(activity.timestamp), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground text-center py-8">No recent activity</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
