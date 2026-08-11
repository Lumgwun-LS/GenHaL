/**
 * /language-orgs/register — Register a new Language Organisation on GenHaL.
 * Submitted registration is held in "pending" status until a platform admin approves it.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import {
  Building2, Globe2, Mail, Link2, Calendar, CheckCircle2, Loader2, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getApiBaseUrl } from "@/lib/api";

interface Form {
  name: string;
  description: string;
  contactEmail: string;
  website: string;
  logoUrl: string;
  country: string;
  foundedYear: string;
}

const EMPTY: Form = {
  name: "", description: "", contactEmail: "",
  website: "", logoUrl: "", country: "", foundedYear: "",
};

function Field({
  label, required, children, hint,
}: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function RegisterOrgPage() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const base = getApiBaseUrl();

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Organisation name is required", variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${base}/genhal/language-orgs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          contactEmail: form.contactEmail.trim() || undefined,
          website: form.website.trim() || undefined,
          logoUrl: form.logoUrl.trim() || undefined,
          country: form.country.trim() || undefined,
          foundedYear: form.foundedYear ? Number(form.foundedYear) : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Registration failed");
      }
      setDone(true);
    } catch (err: any) {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 flex flex-col items-center gap-5 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold font-serif">Registration submitted!</h2>
          <p className="text-muted-foreground mt-2 leading-relaxed">
            Your organisation has been registered and is pending review by the GenHaL admin team.
            You'll be notified once it has been approved.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="rounded-xl" onClick={() => navigate("/language-orgs")}>
            View all organisations
          </Button>
          <Button className="rounded-xl bg-amber-700 hover:bg-amber-800 text-white" onClick={() => navigate("/")}>
            Go to dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate("/language-orgs")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Language Organisations
        </button>
        <h1 className="text-3xl font-serif font-bold">Register an Organisation</h1>
        <p className="text-muted-foreground mt-1">
          Register your language authority, community group, or academic institution to manage
          corpus submissions for your language(s) on GenHaL.
        </p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-2xl border p-6 space-y-5">
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="h-5 w-5 text-amber-700" />
          <h2 className="font-semibold">Organisation details</h2>
        </div>

        <Field label="Organisation name" required>
          <Input
            value={form.name}
            onChange={set("name")}
            placeholder="e.g. Yoruba Language Institute"
            className="rounded-xl"
          />
        </Field>

        <Field
          label="Description"
          hint="What is this organisation's mandate? What language(s) does it represent?"
        >
          <Textarea
            value={form.description}
            onChange={set("description")}
            rows={4}
            placeholder="Describe your organisation's mission and the language(s) you manage…"
            className="rounded-xl resize-none"
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Country / Region">
            <div className="relative">
              <Globe2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={form.country} onChange={set("country")} placeholder="Nigeria" className="rounded-xl pl-9" />
            </div>
          </Field>
          <Field label="Year founded">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={form.foundedYear}
                onChange={set("foundedYear")}
                placeholder="e.g. 1999"
                type="number"
                min={1800}
                max={new Date().getFullYear()}
                className="rounded-xl pl-9"
              />
            </div>
          </Field>
          <Field label="Contact email">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={form.contactEmail}
                onChange={set("contactEmail")}
                type="email"
                placeholder="contact@yourlanguage.org"
                className="rounded-xl pl-9"
              />
            </div>
          </Field>
          <Field label="Website">
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={form.website}
                onChange={set("website")}
                placeholder="https://yourlanguage.org"
                className="rounded-xl pl-9"
              />
            </div>
          </Field>
        </div>

        <Field
          label="Logo URL"
          hint="Link to a publicly accessible logo image (PNG or SVG, square recommended)."
        >
          <Input
            value={form.logoUrl}
            onChange={set("logoUrl")}
            placeholder="https://example.com/logo.png"
            className="rounded-xl"
          />
        </Field>
      </div>

      {/* Info box */}
      <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-900 space-y-1">
        <p className="font-semibold">What happens after you register?</p>
        <ul className="list-disc pl-5 space-y-1 text-blue-800 leading-relaxed">
          <li>Your registration will be reviewed by the GenHaL admin team (typically within 3–5 business days).</li>
          <li>Once approved, you can add languages your organisation manages and invite team members.</li>
          <li>You can then enable approval review so all submissions for your language pass through your team before going to AI training.</li>
        </ul>
      </div>

      <div className="flex gap-3 justify-end">
        <Button variant="outline" className="rounded-xl" onClick={() => navigate("/language-orgs")}>
          Cancel
        </Button>
        <Button
          className="rounded-xl bg-amber-700 hover:bg-amber-800 text-white px-8"
          disabled={submitting || !form.name.trim()}
          onClick={submit}
        >
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {submitting ? "Submitting…" : "Submit registration"}
        </Button>
      </div>
    </div>
  );
}
