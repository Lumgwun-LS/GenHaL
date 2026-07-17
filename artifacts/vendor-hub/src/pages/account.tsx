import { useState } from "react";
import { useUser } from "@clerk/react";
import { useLocation } from "wouter";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
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
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
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

      <ProfileSection
        vendorId={myVendor.id}
        gender={(myVendor as any).gender ?? null}
        country={(myVendor as any).country ?? null}
        state={(myVendor as any).state ?? null}
        city={(myVendor as any).city ?? null}
      />

      <DeleteAccountSection vendorId={myVendor.id} />
    </div>
  );
}
