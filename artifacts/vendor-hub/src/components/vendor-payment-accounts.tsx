import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Key, CheckCircle2, XCircle, Lock, Unlock, Loader2, Trash2, TestTube2 } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type CredentialInfo = {
  hasKey: boolean;
  maskedKey: string | null;
  testPassed: boolean;
};

type CredsData = {
  vendorId: number;
  subscriptionTier: string;
  verificationLevel: string;
  featureUnlocked: boolean;
  requiredTiers: string[];
  requiredLevels: string[];
  stripe: CredentialInfo;
  paystack: CredentialInfo;
};

const TIER_COLORS: Record<string, string> = {
  free: "bg-zinc-700 text-zinc-100",
  starter: "bg-blue-700 text-blue-100",
  pro: "bg-violet-700 text-violet-100",
  enterprise: "bg-amber-600 text-amber-100",
};

const LEVEL_COLORS: Record<string, string> = {
  unverified: "bg-zinc-700 text-zinc-100",
  basic: "bg-sky-700 text-sky-100",
  verified: "bg-green-700 text-green-100",
  premium: "bg-emerald-600 text-emerald-100",
};

interface Props {
  vendorId: number;
}

export default function VendorPaymentAccounts({ vendorId }: Props) {
  const [creds, setCreds] = useState<CredsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [stripeInput, setStripeInput] = useState("");
  const [paystackInput, setPaystackInput] = useState("");
  const [busyStripe, setBusyStripe] = useState<"test" | "save" | "remove" | null>(null);
  const [busyPaystack, setBusyPaystack] = useState<"test" | "save" | "remove" | null>(null);

  async function fetchCreds() {
    try {
      const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/payment-credentials`, {
        credentials: "include",
      });
      if (res.ok) setCreds(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchCreds(); }, [vendorId]);

  async function handleTest(provider: "stripe" | "paystack") {
    const key = provider === "stripe" ? stripeInput : paystackInput;
    if (!key) { toast.error("Enter a key first"); return; }
    const setBusy = provider === "stripe" ? setBusyStripe : setBusyPaystack;
    setBusy("test");
    try {
      const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/payment-credentials/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider, secretKey: key }),
      });
      const data = await res.json();
      if (res.ok && data.testPassed) toast.success(`${provider === "stripe" ? "Stripe" : "Paystack"} key is valid ✓`);
      else toast.error(data.error ?? "Key validation failed");
    } catch { toast.error("Network error"); }
    finally { setBusy(null); }
  }

  async function handleSave(provider: "stripe" | "paystack") {
    const key = provider === "stripe" ? stripeInput : paystackInput;
    if (!key) { toast.error("Enter a key first"); return; }
    const setBusy = provider === "stripe" ? setBusyStripe : setBusyPaystack;
    setBusy("save");
    try {
      const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/payment-credentials`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider, secretKey: key }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${provider === "stripe" ? "Stripe" : "Paystack"} key saved and verified`);
        if (provider === "stripe") setStripeInput("");
        else setPaystackInput("");
        await fetchCreds();
      } else {
        toast.error(data.error ?? "Failed to save key");
      }
    } catch { toast.error("Network error"); }
    finally { setBusy(null); }
  }

  async function handleRemove(provider: "stripe" | "paystack") {
    const setBusy = provider === "stripe" ? setBusyStripe : setBusyPaystack;
    setBusy("remove");
    try {
      const res = await fetch(`${BASE_URL}/api/vendors/${vendorId}/payment-credentials`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider }),
      });
      if (res.ok) {
        toast.success(`${provider === "stripe" ? "Stripe" : "Paystack"} key removed`);
        await fetchCreds();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Failed to remove key");
      }
    } catch { toast.error("Network error"); }
    finally { setBusy(null); }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Key className="w-4 h-4" />Payment Accounts</CardTitle></CardHeader>
        <CardContent><div className="text-sm text-muted-foreground">Loading...</div></CardContent>
      </Card>
    );
  }

  if (!creds) return null;

  const { featureUnlocked, subscriptionTier, verificationLevel } = creds;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {featureUnlocked ? <Unlock className="w-4 h-4 text-green-400" /> : <Lock className="w-4 h-4 text-muted-foreground" />}
          Payment Accounts
        </CardTitle>
        <CardDescription>
          Connect your own Stripe or Paystack account so payments go directly to you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Tier badges */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs text-muted-foreground">Tier</div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TIER_COLORS[subscriptionTier] ?? "bg-zinc-700 text-zinc-100"}`}>
            {subscriptionTier.toUpperCase()}
          </span>
          <div className="text-xs text-muted-foreground">Verification</div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${LEVEL_COLORS[verificationLevel] ?? "bg-zinc-700 text-zinc-100"}`}>
            {verificationLevel.toUpperCase()}
          </span>
        </div>

        {!featureUnlocked && (
          <div className="rounded-lg border border-amber-800/40 bg-amber-950/30 p-4 space-y-2">
            <p className="text-sm font-medium text-amber-300">Feature locked</p>
            <p className="text-xs text-muted-foreground">
              Direct payment routing requires <strong>Pro</strong> or <strong>Enterprise</strong> subscription,
              or a <strong>Verified</strong> / <strong>Premium</strong> verification level.
            </p>
            <p className="text-xs text-muted-foreground">
              An admin can upgrade this vendor via <code className="bg-zinc-800 px-1 rounded">PATCH /vendors/{vendorId}/tier</code>.
            </p>
          </div>
        )}

        {featureUnlocked && (
          <div className="space-y-6">
            {/* Stripe */}
            <ProviderKeyForm
              provider="stripe"
              label="Stripe"
              placeholder="sk_live_... or sk_test_..."
              credInfo={creds.stripe}
              inputValue={stripeInput}
              onInputChange={setStripeInput}
              busy={busyStripe}
              onTest={() => handleTest("stripe")}
              onSave={() => handleSave("stripe")}
              onRemove={() => handleRemove("stripe")}
            />

            <Separator />

            {/* Paystack */}
            <ProviderKeyForm
              provider="paystack"
              label="Paystack"
              placeholder="sk_live_... or sk_test_..."
              credInfo={creds.paystack}
              inputValue={paystackInput}
              onInputChange={setPaystackInput}
              busy={busyPaystack}
              onTest={() => handleTest("paystack")}
              onSave={() => handleSave("paystack")}
              onRemove={() => handleRemove("paystack")}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ProviderKeyFormProps {
  provider: string;
  label: string;
  placeholder: string;
  credInfo: CredentialInfo;
  inputValue: string;
  onInputChange: (v: string) => void;
  busy: "test" | "save" | "remove" | null;
  onTest: () => void;
  onSave: () => void;
  onRemove: () => void;
}

function ProviderKeyForm({
  label, placeholder, credInfo, inputValue, onInputChange, busy, onTest, onSave, onRemove,
}: ProviderKeyFormProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">{label}</Label>
        {credInfo.hasKey && (
          <div className="flex items-center gap-2">
            {credInfo.testPassed
              ? <CheckCircle2 className="w-4 h-4 text-green-400" />
              : <XCircle className="w-4 h-4 text-red-400" />}
            <span className="font-mono text-xs text-muted-foreground">{credInfo.maskedKey}</span>
          </div>
        )}
      </div>

      {credInfo.hasKey ? (
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder={`Replace current key (${credInfo.maskedKey})`}
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            className="font-mono text-sm flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={onTest}
            disabled={busy !== null || !inputValue}
          >
            {busy === "test" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube2 className="w-3.5 h-3.5" />}
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={busy !== null || !inputValue}
          >
            {busy === "save" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onRemove}
            disabled={busy !== null}
          >
            {busy === "remove" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            className="font-mono text-sm flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={onTest}
            disabled={busy !== null || !inputValue}
          >
            {busy === "test" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube2 className="w-3.5 h-3.5" />}
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={busy !== null || !inputValue}
          >
            {busy === "save" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {credInfo.hasKey
          ? "Your key is saved. Payments for this vendor route directly to your account."
          : "No key saved — payments use the platform account."}
      </p>
    </div>
  );
}
