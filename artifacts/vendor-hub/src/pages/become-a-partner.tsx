import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Globe, Zap, Users, BookOpen, Check, ArrowRight, Link2, Code2, Sparkles,
} from "lucide-react";
import { Link } from "wouter";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const BENEFITS = [
  {
    icon: BookOpen,
    title: "AI-Generated Documentation",
    desc: "Awa Biz Suite AI reads your OpenAPI spec and produces a full developer docs portal — endpoints, auth guides, code samples.",
  },
  {
    icon: Users,
    title: "Instant Vendor Audience",
    desc: "Thousands of Awa Biz vendors can discover and connect to your platform directly from the Marketplace tab.",
  },
  {
    icon: Link2,
    title: "Shareable Docs Link",
    desc: "Get a permanent `/docs/your-slug` URL — add it to your website nav, your app, or your social media bio.",
  },
  {
    icon: Globe,
    title: "Listed on Our Landing Page",
    desc: "Approved partners appear in the 'Trusted by' section of the Awa Biz Suite home page.",
  },
  {
    icon: Code2,
    title: "Embeddable Connect Widget",
    desc: 'Put a "Connect on Awa Biz" button on your site so your own users can authorize your platform in one click.',
  },
  {
    icon: Zap,
    title: "No Integration Work",
    desc: "Just point us at your OpenAPI spec — we handle the connection layer, auth proxying, and webhook syncs automatically.",
  },
];

export default function BecomeAPartnerPage() {
  const [step, setStep] = useState<"form" | "success">("form");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ slug: string; name: string } | null>(null);

  const [form, setForm] = useState({
    name: "",
    slug: "",
    applicantName: "",
    contactEmail: "",
    websiteUrl: "",
    description: "",
    logoUrl: "",
    baseUrl: "",
    specSourceType: "url",
    specUrl: "",
    specRawContent: "",
  });

  function toSlug(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function setField(k: keyof typeof form, v: string) {
    setForm((prev) => {
      const next = { ...prev, [k]: v };
      if (k === "name" && !prev.slug) next.slug = toSlug(v);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.slug || !form.contactEmail) {
      toast.error("Platform name, slug, and contact email are required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}/api/platform-partners/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registration failed");
      setResult({ slug: data.partner.slug, name: data.partner.name });
      setStep("success");
    } catch (err: any) {
      toast.error(err.message ?? "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border/40 bg-background/80 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between max-w-6xl">
          <Link href="/home">
            <span className="font-black text-lg tracking-tight">Awa Biz Suite</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/home">
              <Button variant="ghost" size="sm">Home</Button>
            </Link>
            <Link href="/sign-in">
              <Button size="sm">Sign in</Button>
            </Link>
          </div>
        </div>
      </header>

      {step === "success" && result ? (
        <SuccessState slug={result.slug} name={result.name} />
      ) : (
        <>
          {/* Hero */}
          <section className="py-24 px-6 text-center relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-primary/8 blur-[120px] rounded-full" />
            </div>
            <div className="relative z-10 max-w-3xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider mb-8"
              >
                <Sparkles className="w-3.5 h-3.5" /> Platform Partner Program
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl md:text-6xl font-black tracking-tight mb-6 text-balance"
              >
                Bring your platform to{" "}
                <span className="text-primary">thousands of African businesses</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto"
              >
                Register your website, app, or SaaS as a Platform Partner. Our AI generates your
                full documentation and API connector — then vendors across our marketplace can
                discover and integrate with you in one click.
              </motion.p>
            </div>
          </section>

          {/* Benefits */}
          <section className="py-16 px-6 border-y border-border/40 bg-muted/20">
            <div className="container mx-auto max-w-5xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {BENEFITS.map((b, i) => (
                  <motion.div
                    key={b.title}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.07 }}
                    className="flex gap-4 p-5 rounded-2xl bg-card/60 border border-border/50"
                  >
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <b.icon className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div>
                      <div className="font-bold text-sm mb-1">{b.title}</div>
                      <div className="text-xs text-muted-foreground leading-relaxed">{b.desc}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* Registration Form */}
          <section className="py-20 px-6">
            <div className="container mx-auto max-w-2xl">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="bg-card border border-border/60 rounded-3xl p-8 md:p-10 shadow-xl"
              >
                <h2 className="text-2xl font-black mb-2">Register your platform</h2>
                <p className="text-muted-foreground text-sm mb-8">
                  Fill in the basics — our team reviews within 1–2 business days. Once approved, your AI-generated
                  docs and marketplace listing go live automatically.
                </p>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* About the platform */}
                  <fieldset className="space-y-4">
                    <legend className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">About your platform</legend>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="name">Platform name <span className="text-destructive">*</span></Label>
                        <Input id="name" placeholder="e.g. Awajimaa Schools" value={form.name}
                          onChange={(e) => setField("name", e.target.value)} required />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="slug">URL slug <span className="text-destructive">*</span></Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">/docs/</span>
                          <Input id="slug" className="pl-12" placeholder="awajimaa-schools" value={form.slug}
                            onChange={(e) => setField("slug", toSlug(e.target.value))} required />
                        </div>
                        <p className="text-xs text-muted-foreground">Your shareable link will be <span className="font-mono text-foreground">/docs/{form.slug || "your-slug"}</span></p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="description">Short description</Label>
                      <Textarea id="description" placeholder="What does your platform do? Who is it for?" rows={3}
                        value={form.description} onChange={(e) => setField("description", e.target.value)} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="websiteUrl">Website URL</Label>
                        <Input id="websiteUrl" type="url" placeholder="https://yourplatform.com" value={form.websiteUrl}
                          onChange={(e) => setField("websiteUrl", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="logoUrl">Logo URL</Label>
                        <Input id="logoUrl" type="url" placeholder="https://yourplatform.com/logo.png" value={form.logoUrl}
                          onChange={(e) => setField("logoUrl", e.target.value)} />
                      </div>
                    </div>
                  </fieldset>

                  {/* Contact */}
                  <fieldset className="space-y-4 pt-2 border-t border-border/40">
                    <legend className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 pt-4">Contact</legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="applicantName">Your name</Label>
                        <Input id="applicantName" placeholder="Jane Doe" value={form.applicantName}
                          onChange={(e) => setField("applicantName", e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="contactEmail">Contact email <span className="text-destructive">*</span></Label>
                        <Input id="contactEmail" type="email" placeholder="you@yourplatform.com" value={form.contactEmail}
                          onChange={(e) => setField("contactEmail", e.target.value)} required />
                      </div>
                    </div>
                  </fieldset>

                  {/* API / Spec */}
                  <fieldset className="space-y-4 pt-2 border-t border-border/40">
                    <legend className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 pt-4">
                      API spec <span className="font-normal text-muted-foreground">(optional — you can add this later)</span>
                    </legend>
                    <p className="text-xs text-muted-foreground">
                      If you have an OpenAPI spec, point us to it. Our AI will generate your full documentation and API connector automatically.
                    </p>

                    <div className="space-y-1.5">
                      <Label>Spec source</Label>
                      <Select value={form.specSourceType} onValueChange={(v) => setField("specSourceType", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="url">Hosted URL (OpenAPI JSON/YAML)</SelectItem>
                          <SelectItem value="upload">Paste spec manually</SelectItem>
                          <SelectItem value="none">I'll add this later</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {form.specSourceType === "url" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="specUrl">OpenAPI spec URL</Label>
                        <Input id="specUrl" type="url" placeholder="https://yourplatform.com/openapi.json" value={form.specUrl}
                          onChange={(e) => setField("specUrl", e.target.value)} />
                      </div>
                    )}

                    {form.specSourceType === "upload" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="specRawContent">Paste your OpenAPI YAML or JSON</Label>
                        <Textarea id="specRawContent" placeholder="openapi: '3.0.0'&#10;info:&#10;  title: Your API&#10;  ..." rows={8}
                          className="font-mono text-xs"
                          value={form.specRawContent} onChange={(e) => setField("specRawContent", e.target.value)} />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor="baseUrl">API base URL <span className="text-muted-foreground text-xs">(e.g. https://api.yourplatform.com)</span></Label>
                      <Input id="baseUrl" type="url" placeholder="https://api.yourplatform.com" value={form.baseUrl}
                        onChange={(e) => setField("baseUrl", e.target.value)} />
                    </div>
                  </fieldset>

                  <Button type="submit" className="w-full h-12 text-base font-bold" disabled={submitting}>
                    {submitting ? "Submitting…" : "Submit Application"}
                    {!submitting && <ArrowRight className="ml-2 w-4 h-4" />}
                  </Button>

                  <p className="text-center text-xs text-muted-foreground">
                    By submitting, you agree to our{" "}
                    <a href="/home#terms" className="underline hover:text-foreground">Partner Terms</a>.
                    We'll contact you at the email above.
                  </p>
                </form>
              </motion.div>
            </div>
          </section>
        </>
      )}

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-border/40 text-center text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} Lumgwun Solutions Group · Awa Biz Suite</p>
      </footer>
    </div>
  );
}

function SuccessState({ slug, name }: { slug: string; name: string }) {
  const docsUrl = `${window.location.origin}${BASE_URL}/docs/${slug}`;
  const partnerUrl = `${window.location.origin}${BASE_URL}/partner/${slug}`;
  const embedCode = `<a href="${docsUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:8px;background:#7c3aed;color:#fff;font-family:sans-serif;font-size:14px;font-weight:600;text-decoration:none;"><img src="https://awabiz.app/favicon.ico" width="18" height="18" alt="" style="border-radius:3px">Connect on Awa Biz</a>`;

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6 py-24">
      <div className="max-w-xl w-full text-center">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18 }}
          className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-8"
        >
          <Check className="w-10 h-10 text-emerald-500" />
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-3xl font-black mb-3"
        >
          Application submitted!
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-muted-foreground mb-10"
        >
          We'll review <strong>{name}</strong> and reach out within 1–2 business days. Once approved,
          your docs and marketplace listing go live automatically.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-4 text-left"
        >
          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
            <h3 className="font-bold text-sm">Your future links</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs shrink-0">Docs</Badge>
                <a href={docsUrl} className="text-sm text-primary hover:underline truncate font-mono">{docsUrl}</a>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs shrink-0">Toolkit</Badge>
                <a href={partnerUrl} className="text-sm text-primary hover:underline truncate font-mono">{partnerUrl}</a>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
            <h3 className="font-bold text-sm">Embed button for your website</h3>
            <p className="text-xs text-muted-foreground">Paste this anywhere in your site to let your users connect from Awa Biz:</p>
            <pre className="bg-muted rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all font-mono select-all">{embedCode}</pre>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 flex flex-col sm:flex-row gap-3 justify-center"
        >
          <Link href="/home">
            <Button variant="outline">Back to Home</Button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
