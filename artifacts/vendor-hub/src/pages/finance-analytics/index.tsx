import { useUser } from "@clerk/react";
import { useListVendors } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { VendorFinanceOverview } from "@/components/VendorFinanceOverview";
import { LineChart } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

export default function FinanceAnalytics() {
  const { user } = useUser();
  const { data: vendors, isLoading: vendorsLoading } = useListVendors();
  const myVendor = vendors?.find((v) => v.clerkUserId === user?.id);

  if (vendorsLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
          className="text-primary"
        >
          <LineChart className="w-6 h-6" />
        </motion.div>
      </div>
    );
  }
  if (!myVendor) {
    return <div className="p-8 text-center text-muted-foreground">No vendor profile found for this account.</div>;
  }

  return (
    <div className="relative p-8 max-w-7xl mx-auto space-y-8 w-full overflow-hidden">
      {/* Aurora background */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <motion.div
          className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-emerald-500/7 blur-[120px]"
          animate={{ x: [0, 40, 0], y: [0, 50, 0], scale: [1, 1.06, 1] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-primary/6 blur-[100px]"
          animate={{ x: [0, -40, 0], y: [0, -35, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut", delay: 7 }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 w-[300px] h-[300px] rounded-full bg-amber-500/5 blur-[80px]"
          animate={{ x: [0, 30, 0], y: [0, -30, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 12 }}
        />
      </div>

      {/* Header */}
      <motion.div
        className="flex flex-col gap-2"
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <div className="flex items-center gap-3">
          <motion.div
            className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/30 to-emerald-500/10 ring-1 ring-white/10 shadow-lg"
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <LineChart className="w-5 h-5 text-emerald-400" />
          </motion.div>
          <div>
            <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
              Finance Analytics
            </h1>
            <p className="text-muted-foreground text-sm">Revenue, profit &amp; loss, expenses, and investment performance.</p>
          </div>
        </div>

        {/* Animated divider */}
        <motion.div
          className="h-px bg-gradient-to-r from-emerald-500/50 via-primary/30 to-transparent rounded-full"
          initial={{ scaleX: 0, originX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.8, delay: 0.3, ease: EASE }}
        />
      </motion.div>

      {/* Main content */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="show"
        transition={{ delay: 0.2 }}
      >
        <VendorFinanceOverview vendorId={myVendor.id} />
      </motion.div>
    </div>
  );
}
