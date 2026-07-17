import { useUser } from "@clerk/react";
import { useListVendors } from "@workspace/api-client-react";
import { VendorFinanceOverview } from "@/components/VendorFinanceOverview";

export default function FinanceAnalytics() {
  const { user } = useUser();
  const { data: vendors, isLoading: vendorsLoading } = useListVendors();
  const myVendor = vendors?.find((v) => v.clerkUserId === user?.id);

  if (vendorsLoading) {
    return <div className="p-8 flex items-center justify-center min-h-[50vh]">Loading finance analytics...</div>;
  }
  if (!myVendor) {
    return <div className="p-8 text-center text-muted-foreground">No vendor profile found for this account.</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 w-full">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Finance Analytics</h1>
        <p className="text-muted-foreground">Revenue, profit &amp; loss, expenses, and investment performance in one place.</p>
      </div>
      <VendorFinanceOverview vendorId={myVendor.id} />
    </div>
  );
}
