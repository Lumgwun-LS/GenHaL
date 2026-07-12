import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle, CreditCard, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type GatewayField = { key: string; label: string; secret: boolean };

type Gateway = {
  provider: string;
  label: string;
  fields: GatewayField[];
  liveVerification: boolean;
  configured: boolean;
  testPassed: boolean;
  maskedValues: Record<string, string | null>;
  updatedAt: string | null;
  lastCheckedAt: string | null;
  lastFailureReason: string | null;
  failingSince: string | null;
};

async function fetchGateways(): Promise<Gateway[]> {
  const res = await fetch(`${BASE_URL}/api/admin/payment-gateways`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load payment gateways");
  const data = (await res.json()) as { gateways: Gateway[] };
  return data.gateways;
}

async function saveGateway(provider: string, credentials: Record<string, string>): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/payment-gateways/${provider}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ credentials }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to save credentials");
  }
}

async function recheckAllGateways(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/payment-gateways/recheck`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to re-test gateways");
  }
}

async function removeGateway(provider: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/admin/payment-gateways/${provider}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to remove credentials");
  }
}

function GatewayCard({ gateway, onSaved }: { gateway: Gateway; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  function setField(key: string, val: string) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  async function handleSave() {
    const missing = gateway.fields.filter((f) => !values[f.key]?.trim());
    if (missing.length > 0) {
      toast.error(`Missing: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    setSaving(true);
    try {
      await saveGateway(gateway.provider, values);
      toast.success(`${gateway.label} credentials saved and verified`);
      setValues({});
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await removeGateway(gateway.provider);
      toast.success(`${gateway.label} credentials removed`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="w-4 h-4 text-primary" /> {gateway.label}
          </CardTitle>
          <CardDescription className="mt-1">
            {gateway.liveVerification
              ? "Credentials are verified with a live API call before saving."
              : "Credentials are format-checked only — this provider has no generic live verification call."}
          </CardDescription>
        </div>
        <div className="shrink-0">
          {gateway.configured ? (
            gateway.testPassed ? (
              <Badge className="gap-1 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15">
                <CheckCircle2 className="w-3.5 h-3.5" /> Verified
              </Badge>
            ) : gateway.failingSince ? (
              <Badge className="gap-1 bg-red-500/15 text-red-600 hover:bg-red-500/15">
                <AlertTriangle className="w-3.5 h-3.5" /> Now failing
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Unverified
              </Badge>
            )
          ) : (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <XCircle className="w-3.5 h-3.5" /> Not configured
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {gateway.configured && gateway.failingSince && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs space-y-1 text-red-700">
            <div className="font-medium">
              This key was working before but started failing {new Date(gateway.failingSince).toLocaleString()}.
            </div>
            {gateway.lastFailureReason && <div>Reason: {gateway.lastFailureReason}</div>}
            <div className="text-red-700/70">
              Checkouts on this gateway will fail until it's replaced below. It's likely been revoked, expired, or rotated on the provider's side.
            </div>
          </div>
        )}
        {gateway.configured && (
          <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
            {gateway.fields.map((f) => (
              <div key={f.key} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{f.label}</span>
                <span className="font-mono">{gateway.maskedValues[f.key] ?? "—"}</span>
              </div>
            ))}
            {gateway.updatedAt && (
              <div className="text-muted-foreground pt-1">Updated {new Date(gateway.updatedAt).toLocaleString()}</div>
            )}
            {gateway.lastCheckedAt && (
              <div className="text-muted-foreground">Last checked {new Date(gateway.lastCheckedAt).toLocaleString()}</div>
            )}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {gateway.fields.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={`${gateway.provider}-${f.key}`} className="text-xs">{f.label}</Label>
              <Input
                id={`${gateway.provider}-${f.key}`}
                type={f.secret ? "password" : "text"}
                placeholder={gateway.configured ? "Enter to replace" : f.label}
                value={values[f.key] ?? ""}
                onChange={(e) => setField(f.key, e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save & verify
          </Button>
          {gateway.configured && (
            <Button size="sm" variant="outline" onClick={handleRemove} disabled={removing} className="gap-1.5 text-destructive hover:text-destructive">
              {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Remove
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function PaymentGatewaysPanel() {
  const qc = useQueryClient();
  const [rechecking, setRechecking] = useState(false);
  const { data: gateways, isLoading, error } = useQuery({
    queryKey: ["admin-payment-gateways"],
    queryFn: fetchGateways,
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["admin-payment-gateways"] });
  }

  async function handleRecheckAll() {
    setRechecking(true);
    try {
      await recheckAllGateways();
      toast.success("Re-tested all configured gateways");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Re-test failed");
    } finally {
      setRechecking(false);
    }
  }

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading payment gateways…</div>;
  }
  if (error) {
    return <div className="p-8 text-center text-destructive">Failed to load payment gateways.</div>;
  }

  const failingCount = gateways?.filter((g) => g.configured && g.failingSince).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Configure the platform's own gateway credentials here. Vendors on Pro/Enterprise tiers or
          Verified/Premium status may still route payments through their own keys — the platform
          key below is only used as the fallback for everyone else. Every configured gateway is
          automatically re-tested every 15 minutes so a key revoked later on the provider's side
          doesn't fail silently.
        </p>
        <Button size="sm" variant="outline" onClick={handleRecheckAll} disabled={rechecking} className="shrink-0 gap-1.5">
          {rechecking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Re-test all now
        </Button>
      </div>
      {failingCount > 0 && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {failingCount} gateway{failingCount > 1 ? "s" : ""} that {failingCount > 1 ? "were" : "was"} working previously {failingCount > 1 ? "are" : "is"} now failing. Check the flagged card{failingCount > 1 ? "s" : ""} below.
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {gateways?.map((g) => (
          <GatewayCard key={g.provider} gateway={g} onSaved={refresh} />
        ))}
      </div>
    </div>
  );
}
