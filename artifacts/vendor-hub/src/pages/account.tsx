import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useUser } from "@clerk/react";
import { useLocation } from "wouter";
import { useVoice } from "@/contexts/voice-context";
import {
  useListVendors,
  useUpdateVendor,
  useGetVendorDeletionEligibility,
  useRequestVendorDeletion,
  useVerifyVendorDeletion,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, CheckCircle2, Loader2, Mic, Key, Webhook, Plus, Trash2, Copy, CheckCheck, ExternalLink, Eye, EyeOff, Code2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const REMINDER_LEAD_OPTIONS = [
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 240, label: "4 hours before" },
  { value: 1440, label: "1 day before" },
];

function PostReminderLeadSection({ vendorId, currentLeadMinutes }: { vendorId: number; currentLeadMinutes: number }) {
  const [leadMinutes, setLeadMinutes] = useState(currentLeadMinutes);
  const updateVendor = useUpdateVendor();

  function save() {
    updateVendor.mutate(
      { id: vendorId, data: { postReminderLeadMinutes: leadMinutes } as any },
      {
        onSuccess: () => toast.success("Reminder timing saved"),
        onError: () => toast.error("Could not update reminder timing"),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pre-publish reminder timing</CardTitle>
        <CardDescription>
          Choose how far ahead you want a heads-up before a scheduled post goes live. You'll get a push notification and email at that time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Remind me</Label>
          <Select value={String(leadMinutes)} onValueChange={(v) => setLeadMinutes(Number(v))}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REMINDER_LEAD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={save} disabled={updateVendor.isPending || leadMinutes === currentLeadMinutes}>
          {updateVendor.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

function ProfileSection({ vendorId, gender, country, state, city }: { vendorId: number; gender: string | null; country: string | null; state: string | null; city: string | null }) {
  const [form, setForm] = useState({
    gender: gender ?? "",
    country: country ?? "",
    state: state ?? "",
    city: city ?? "",
  });
  const updateVendor = useUpdateVendor();

  function save() {
    updateVendor.mutate(
      { id: vendorId, data: { gender: form.gender || undefined, country: form.country || undefined, state: form.state || undefined, city: form.city || undefined } },
      {
        onSuccess: () => toast.success("Profile updated"),
        onError: () => toast.error("Could not update profile"),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profile details</CardTitle>
        <CardDescription>These help us understand our vendor community better. Fully optional.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Gender</Label>
            <Select value={form.gender} onValueChange={(v) => setForm((f) => ({ ...f, gender: v }))}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {GENDERS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Country</Label>
            <Input value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} placeholder="e.g. Nigeria" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">State / Province</Label>
            <Input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} placeholder="e.g. Lagos" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">City</Label>
            <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="e.g. Ikeja" />
          </div>
        </div>
        <Button onClick={save} disabled={updateVendor.isPending}>
          {updateVendor.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Save profile
        </Button>
      </CardContent>
    </Card>
  );
}

function VoiceControlSection() {
  const { voiceEnabled, setVoiceEnabled } = useVoice();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Mic className="w-4 h-4 text-violet-500" />
          Voice Control
        </CardTitle>
        <CardDescription>
          Tap the mic button (bottom-right on any dashboard page) and speak to fill form fields,
          open dialogs, or navigate. Say <em>"Go to inventory"</em>, <em>"Name: Basmati Rice"</em>, or <em>"New product"</em>.
          Works in Chrome and Edge.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <Switch
            id="voice-control-toggle"
            checked={voiceEnabled}
            onCheckedChange={setVoiceEnabled}
          />
          <label htmlFor="voice-control-toggle" className="text-sm font-medium cursor-pointer">
            {voiceEnabled ? "Voice control is enabled" : "Voice control is disabled"}
          </label>
        </div>
        {voiceEnabled && (
          <div className="mt-4 rounded-lg bg-violet-500/10 border border-violet-500/20 p-3 space-y-1.5 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground text-sm">Quick reference</p>
            <ul className="space-y-1 list-disc pl-4">
              <li><strong>Navigate:</strong> <em>"Go to orders"</em>, <em>"Open inventory"</em></li>
              <li><strong>Open a form:</strong> <em>"New product"</em>, <em>"Record sale"</em>, <em>"New expense"</em></li>
              <li><strong>Fill a field:</strong> <em>"Price: 4500"</em>, <em>"Customer name: John Doe"</em></li>
              <li><strong>Fill focused input:</strong> Click the field, then speak its value</li>
              <li><strong>Submit form:</strong> <em>"Save"</em> or <em>"Submit"</em></li>
              <li><strong>Dismiss dialog:</strong> <em>"Cancel"</em> or <em>"Close"</em></li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeleteAccountSection({ vendorId }: { vendorId: number }) {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<"idle" | "codes-sent">("idle");
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");

  const { data: eligibility, isLoading: eligibilityLoading } = useGetVendorDeletionEligibility(vendorId);
  const requestDeletion = useRequestVendorDeletion();
  const verifyDeletion = useVerifyVendorDeletion();

  function startRequest() {
    requestDeletion.mutate(
      { id: vendorId },
      {
        onSuccess: () => {
          setStep("codes-sent");
          toast.success("Confirmation codes sent to your email and phone.");
        },
        onError: (err: any) => toast.error(err?.message ?? "Could not start deletion"),
      },
    );
  }

  function confirmDeletion() {
    verifyDeletion.mutate(
      { id: vendorId, data: { emailCode, phoneCode } },
      {
        onSuccess: () => {
          toast.success("Your account and data have been deleted.");
          setLocation("/");
        },
        onError: (err: any) => toast.error(err?.message ?? "Codes did not match"),
      },
    );
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 text-destructive">
          <AlertTriangle className="w-4 h-4" /> Delete my account
        </CardTitle>
        <CardDescription>
          Permanently deletes your vendor profile and everything linked to it — products, orders, leads, posts, and payment history. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {eligibilityLoading ? (
          <p className="text-sm text-muted-foreground">Checking eligibility…</p>
        ) : eligibility && !eligibility.eligible ? (
          <Alert variant="destructive">
            <AlertTriangle className="w-4 h-4" />
            <AlertTitle>You can't delete your data yet</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                {eligibility.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <CheckCircle2 className="w-4 h-4" />
            <AlertTitle>You're eligible to delete your data</AlertTitle>
            <AlertDescription>No unpaid orders or active subscriptions were found on your account.</AlertDescription>
          </Alert>
        )}

        {step === "idle" ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={!eligibility?.eligible || eligibilityLoading}>
                Delete my account data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Start account deletion?</AlertDialogTitle>
                <AlertDialogDescription>
                  We'll send a one-time code to your email and another to your phone. You'll need both to confirm deletion.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={startRequest} disabled={requestDeletion.isPending}>
                  {requestDeletion.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Send codes
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <div className="space-y-4 rounded-md border p-4">
            <p className="text-sm font-medium">Enter both confirmation codes</p>
            <div className="space-y-1.5">
              <Label className="text-xs">Code sent to your email</Label>
              <InputOTP maxLength={6} value={emailCode} onChange={setEmailCode}>
                <InputOTPGroup>
                  {Array.from({ length: 6 }).map((_, i) => <InputOTPSlot key={i} index={i} />)}
                </InputOTPGroup>
              </InputOTP>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Code sent to your phone</Label>
              <InputOTP maxLength={6} value={phoneCode} onChange={setPhoneCode}>
                <InputOTPGroup>
                  {Array.from({ length: 6 }).map((_, i) => <InputOTPSlot key={i} index={i} />)}
                </InputOTPGroup>
              </InputOTP>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("idle")}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={confirmDeletion}
                disabled={emailCode.length !== 6 || phoneCode.length !== 6 || verifyDeletion.isPending}
              >
                {verifyDeletion.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Permanently delete my data
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Account() {
  const { user } = useUser();
  const { data: vendors, isLoading } = useListVendors();
  const myVendor = vendors?.find((v) => v.clerkUserId === user?.id);

  if (isLoading) {
    return <div className="p-8 flex items-center justify-center min-h-[50vh]">Loading account...</div>;
  }
  if (!myVendor) {
    return <div className="p-8 text-center text-muted-foreground">No vendor profile found for this account.</div>;
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6 w-full">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Account</h1>
        <p className="text-muted-foreground">Manage your profile details and account data.</p>
      </div>

      <PostReminderLeadSection
        vendorId={myVendor.id}
        currentLeadMinutes={(myVendor as any).postReminderLeadMinutes ?? 30}
      />

      <VoiceControlSection />

      <ProfileSection
        vendorId={myVendor.id}
        gender={(myVendor as any).gender ?? null}
        country={(myVendor as any).country ?? null}
        state={(myVendor as any).state ?? null}
        city={(myVendor as any).city ?? null}
      />

      <DeveloperSection vendorId={myVendor.id} />

      <DeleteAccountSection vendorId={myVendor.id} />
    </div>
  );
}

// ─── Developer Section ────────────────────────────────────────────────────────

const ALL_SCOPES = [
  { id: "read",             label: "Read",             desc: "Read posts, leads, products, orders, analytics" },
  { id: "write:posts",      label: "Write: Posts",     desc: "Create, edit, delete social posts" },
  { id: "write:leads",      label: "Write: Leads",     desc: "Create, update, delete leads" },
  { id: "write:products",   label: "Write: Products",  desc: "Create, edit, delete products" },
  { id: "write:orders",     label: "Write: Orders",    desc: "Create and update orders" },
  { id: "write:inventory",  label: "Write: Inventory", desc: "Adjust inventory levels" },
  { id: "write:campaigns",  label: "Write: Campaigns", desc: "Create and send campaigns" },
  { id: "analytics",        label: "Analytics",        desc: "Access detailed analytics" },
];

const WEBHOOK_EVENTS = [
  "*", "order.created", "order.paid", "order.cancelled",
  "lead.created", "lead.updated",
  "payment.succeeded", "payment.failed",
  "post.published", "post.failed",
  "product.created", "product.updated", "product.deleted",
];

interface ApiKeyRow {
  id: number; name: string; prefix: string; scopes: string[];
  isActive: boolean; lastUsedAt: string | null; createdAt: string | null;
}
interface WebhookRow {
  id: number; url: string; rawSecretPreview: string | null;
  events: string[]; isActive: boolean; createdAt: string | null;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded">
      {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function DeveloperSection({ vendorId: _vendorId }: { vendorId: number }) {
  // ── API Keys state ──────────────────────────────────────────────────────────
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [newKeyName, setNewKeyName]   = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(["read"]);
  const [creatingKey, setCreatingKey]  = useState(false);
  const [revealedKey, setRevealedKey]  = useState<string | null>(null);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);

  // ── Webhooks state ──────────────────────────────────────────────────────────
  const [hooks, setHooks]             = useState<WebhookRow[]>([]);
  const [hooksLoading, setHooksLoading] = useState(true);
  const [newHookUrl, setNewHookUrl]   = useState("");
  const [newHookEvents, setNewHookEvents] = useState<string[]>(["*"]);
  const [creatingHook, setCreatingHook]   = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [hookDialogOpen, setHookDialogOpen] = useState(false);
  const [testingHook, setTestingHook] = useState<number | null>(null);

  const fetchKeys = useCallback(async () => {
    setKeysLoading(true);
    try {
      const r = await fetch("/api/developer/api-keys");
      if (r.ok) setKeys(await r.json());
    } finally { setKeysLoading(false); }
  }, []);

  const fetchHooks = useCallback(async () => {
    setHooksLoading(true);
    try {
      const r = await fetch("/api/developer/webhooks");
      if (r.ok) setHooks(await r.json());
    } finally { setHooksLoading(false); }
  }, []);

  useEffect(() => { fetchKeys(); fetchHooks(); }, [fetchKeys, fetchHooks]);

  async function createKey() {
    if (!newKeyName.trim()) { toast.error("Give the key a name"); return; }
    if (!newKeyScopes.length) { toast.error("Select at least one scope"); return; }
    setCreatingKey(true);
    try {
      const r = await fetch("/api/developer/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim(), scopes: newKeyScopes }),
      });
      const data = await r.json();
      if (!r.ok) { toast.error(data.error ?? "Could not create API key"); return; }
      setRevealedKey(data.rawKey);
      setNewKeyName(""); setNewKeyScopes(["read"]);
      fetchKeys();
    } finally { setCreatingKey(false); }
  }

  async function revokeKey(id: number) {
    const r = await fetch(`/api/developer/api-keys/${id}`, { method: "DELETE" });
    if (r.ok) { toast.success("API key revoked"); fetchKeys(); }
    else toast.error("Could not revoke key");
  }

  async function createHook() {
    if (!newHookUrl.startsWith("https://")) { toast.error("URL must start with https://"); return; }
    setCreatingHook(true);
    try {
      const r = await fetch("/api/developer/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newHookUrl.trim(), events: newHookEvents }),
      });
      const data = await r.json();
      if (!r.ok) { toast.error(data.error ?? "Could not register webhook"); return; }
      setRevealedSecret(data.rawSecret);
      setNewHookUrl(""); setNewHookEvents(["*"]);
      fetchHooks();
    } finally { setCreatingHook(false); }
  }

  async function deleteHook(id: number) {
    const r = await fetch(`/api/developer/webhooks/${id}`, { method: "DELETE" });
    if (r.ok) { toast.success("Webhook removed"); fetchHooks(); }
    else toast.error("Could not remove webhook");
  }

  async function testHook(id: number) {
    setTestingHook(id);
    try {
      const r = await fetch(`/api/developer/webhooks/${id}/test`, { method: "POST" });
      const data = await r.json();
      if (data.ok) toast.success(`Test event delivered (HTTP ${data.statusCode})`);
      else toast.error(`Delivery failed: ${data.error ?? data.statusCode}`);
    } finally { setTestingHook(null); }
  }

  function toggleScope(scope: string) {
    setNewKeyScopes((prev) => prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]);
  }
  function toggleEvent(ev: string) {
    if (ev === "*") { setNewHookEvents(["*"]); return; }
    setNewHookEvents((prev) => {
      const without = prev.filter((e) => e !== "*" && e !== ev);
      return prev.includes(ev) ? without : [...without, ev];
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Code2 className="w-4 h-4 text-violet-500" />
          Developer & Integrations
        </CardTitle>
        <CardDescription className="leading-relaxed">
          Connect Zapier, Make, HubSpot, CRMs, AI platforms, or any custom app to your business data using API keys or OAuth 2.0.{" "}
          <Link href="/developers" className="text-violet-400 hover:underline inline-flex items-center gap-0.5">
            View full docs <ExternalLink className="w-3 h-3" />
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs defaultValue="api-keys">
          <TabsList className="mb-4">
            <TabsTrigger value="api-keys" className="gap-1.5">
              <Key className="w-3.5 h-3.5" /> API Keys
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-1.5">
              <Webhook className="w-3.5 h-3.5" /> Webhooks
            </TabsTrigger>
          </TabsList>

          {/* ── API Keys ─────────────────────────────────────────────── */}
          <TabsContent value="api-keys" className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Use an API key as a Bearer token on <code className="bg-muted px-1 rounded text-xs">https://awajimaaapp.io/api/external/features/*</code>. Keys are shown once — save them immediately.
            </p>

            {/* Revealed key banner */}
            {revealedKey && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 space-y-2">
                <p className="text-xs font-semibold text-green-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> API key created — copy it now, it won't be shown again
                </p>
                <div className="flex items-center gap-2 bg-background/50 rounded px-3 py-1.5 border border-border/40">
                  <code className="flex-1 text-xs font-mono break-all text-foreground/90">{revealedKey}</code>
                  <CopyBtn text={revealedKey} />
                </div>
                <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setRevealedKey(null)}>Dismiss</Button>
              </div>
            )}

            {/* Existing keys */}
            {keysLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading keys…</div>
            ) : keys.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No API keys yet. Create one below.</p>
            ) : (
              <div className="space-y-2">
                {keys.map((k) => (
                  <div key={k.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-muted/20">
                    <Key className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{k.name}</span>
                        {k.isActive
                          ? <Badge variant="secondary" className="text-xs py-0 px-1.5 bg-green-500/10 text-green-400 border-green-500/20">Active</Badge>
                          : <Badge variant="secondary" className="text-xs py-0 px-1.5">Revoked</Badge>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <code className="text-xs font-mono text-muted-foreground">{k.prefix}…</code>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{k.scopes.join(", ")}</span>
                      </div>
                      {k.lastUsedAt && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Last used {new Date(k.lastUsedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    {k.isActive && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive h-8 w-8 p-0 shrink-0">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Revoke "{k.name}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Any integrations using this key will immediately stop working. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => revokeKey(k.id)} className="bg-destructive hover:bg-destructive/90">
                              Revoke key
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Create new key */}
            <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Plus className="w-4 h-4" /> New API key
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Create API key</DialogTitle>
                  <DialogDescription>Choose a name and select the permissions this key will have.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Key name</Label>
                    <Input
                      placeholder="e.g. Zapier integration, HubSpot CRM"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Permissions (scopes)</Label>
                    <div className="grid grid-cols-1 gap-1.5 max-h-52 overflow-y-auto pr-1">
                      {ALL_SCOPES.map((s) => (
                        <label key={s.id} className="flex items-start gap-2.5 p-2 rounded-lg border border-border/40 hover:border-border cursor-pointer transition-colors" htmlFor={`scope-key-${s.id}`}>
                          <Checkbox id={`scope-key-${s.id}`} checked={newKeyScopes.includes(s.id)} onCheckedChange={() => toggleScope(s.id)} className="mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-medium leading-none">{s.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setKeyDialogOpen(false)}>Cancel</Button>
                  <Button onClick={async () => { await createKey(); if (!creatingKey) setKeyDialogOpen(false); }} disabled={creatingKey} className="bg-violet-600 hover:bg-violet-700">
                    {creatingKey && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Create key
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* ── Webhooks ─────────────────────────────────────────────── */}
          <TabsContent value="webhooks" className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Awa Biz Suite will POST real-time events to your HTTPS endpoint. Payloads are HMAC-SHA256 signed with your secret.
            </p>

            {/* Revealed secret banner */}
            {revealedSecret && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 space-y-2">
                <p className="text-xs font-semibold text-green-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Webhook created — copy the signing secret now
                </p>
                <div className="flex items-center gap-2 bg-background/50 rounded px-3 py-1.5 border border-border/40">
                  <code className="flex-1 text-xs font-mono break-all text-foreground/90">{revealedSecret}</code>
                  <CopyBtn text={revealedSecret} />
                </div>
                <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setRevealedSecret(null)}>Dismiss</Button>
              </div>
            )}

            {/* Existing webhooks */}
            {hooksLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading webhooks…</div>
            ) : hooks.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No webhooks yet. Register one below.</p>
            ) : (
              <div className="space-y-2">
                {hooks.map((h) => (
                  <div key={h.id} className="p-3 rounded-lg border border-border/40 bg-muted/20 space-y-2">
                    <div className="flex items-start gap-2">
                      <Webhook className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-xs font-mono text-foreground/90 truncate max-w-xs">{h.url}</code>
                          {h.isActive
                            ? <Badge variant="secondary" className="text-xs py-0 px-1.5 bg-green-500/10 text-green-400 border-green-500/20">Active</Badge>
                            : <Badge variant="secondary" className="text-xs py-0 px-1.5">Inactive</Badge>}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {h.events.map((e) => (
                            <code key={e} className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded border border-border/40 text-muted-foreground">{e}</code>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => testHook(h.id)} disabled={testingHook === h.id}>
                          {testingHook === h.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Test"}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive h-7 w-7 p-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove webhook?</AlertDialogTitle>
                              <AlertDialogDescription>Events will no longer be sent to {h.url}.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteHook(h.id)} className="bg-destructive hover:bg-destructive/90">Remove</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Register webhook */}
            <Dialog open={hookDialogOpen} onOpenChange={setHookDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Plus className="w-4 h-4" /> Register webhook
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Register webhook endpoint</DialogTitle>
                  <DialogDescription>Awa Biz Suite will POST signed JSON payloads to this HTTPS URL.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Endpoint URL (HTTPS only)</Label>
                    <Input
                      placeholder="https://yourapp.com/webhooks/awa"
                      value={newHookUrl}
                      onChange={(e) => setNewHookUrl(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Events to receive</Label>
                    <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                      {WEBHOOK_EVENTS.map((ev) => (
                        <label key={ev} className="flex items-center gap-2 p-1.5 rounded border border-border/40 hover:border-border cursor-pointer transition-colors text-xs" htmlFor={`event-${ev}`}>
                          <Checkbox id={`event-${ev}`} checked={newHookEvents.includes(ev) || (ev !== "*" && newHookEvents.includes("*"))} onCheckedChange={() => toggleEvent(ev)} />
                          <code className="font-mono text-xs">{ev}</code>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setHookDialogOpen(false)}>Cancel</Button>
                  <Button onClick={async () => { await createHook(); setHookDialogOpen(false); }} disabled={creatingHook} className="bg-violet-600 hover:bg-violet-700">
                    {creatingHook && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Register
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
