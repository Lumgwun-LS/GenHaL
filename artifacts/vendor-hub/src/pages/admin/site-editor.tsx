import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Save, Layout, Sparkles, Megaphone, Settings2, Mail } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type HeroContent = { badge: string; heading: string; subheading: string; primaryCta: string; secondaryCta: string };
type FeatureItem = { title: string; description: string };
type FeaturesContent = { heading: string; subheading: string; items: FeatureItem[] };
type StatItem = { value: string; label: string };
type StatsContent = { heading: string; body: string; bullets: string[]; stats: StatItem[] };
type CtaContent = { heading: string; body: string; buttonLabel: string };
type SettingsContent = { siteName: string; logoUrl: string; supportEmail: string; footerTagline: string };
type EmailContent = { subject: string; body: string };

type SiteContent = {
  "landing.hero": HeroContent;
  "landing.features": FeaturesContent;
  "landing.stats": StatsContent;
  "landing.cta": CtaContent;
  "site.settings": SettingsContent;
  "email.birthday": EmailContent;
};

async function fetchAdminSiteContent(): Promise<SiteContent> {
  const res = await authFetch(`${BASE_URL}/api/admin/site-content`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load site content");
  return res.json() as Promise<SiteContent>;
}

async function saveBlock(key: string, value: unknown): Promise<void> {
  const res = await authFetch(`${BASE_URL}/api/admin/site-content/${key}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
    throw new Error(err.error ?? "Failed to save");
  }
}

/** Generic "save this block" button + state wrapper. */
function useBlockEditor<T>(key: string, initial: T | undefined, defaults: T) {
  const [draft, setDraft] = useState<T>(initial ?? defaults);
  const [saving, setSaving] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const qc = useQueryClient();

  // Only seed the draft from server data once — a background refetch (e.g.
  // after another admin's save, or the 30s revalidation) must never clobber
  // whatever the current admin is mid-editing.
  useEffect(() => {
    if (initial && !seeded) {
      setDraft(initial);
      setSeeded(true);
    }
  }, [initial, seeded]);

  async function save() {
    setSaving(true);
    try {
      await saveBlock(key, draft);
      toast.success("Saved. Changes are live immediately.");
      qc.invalidateQueries({ queryKey: ["admin-site-content"] });
      qc.invalidateQueries({ queryKey: ["site-content"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return { draft, setDraft, save, saving };
}

export default function SiteEditor() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["admin-site-content"], queryFn: fetchAdminSiteContent });

  const hero = useBlockEditor<HeroContent>("landing.hero", data?.["landing.hero"], {
    badge: "", heading: "", subheading: "", primaryCta: "", secondaryCta: "",
  });
  const features = useBlockEditor<FeaturesContent>("landing.features", data?.["landing.features"], {
    heading: "", subheading: "", items: [],
  });
  const stats = useBlockEditor<StatsContent>("landing.stats", data?.["landing.stats"], {
    heading: "", body: "", bullets: [], stats: [],
  });
  const cta = useBlockEditor<CtaContent>("landing.cta", data?.["landing.cta"], {
    heading: "", body: "", buttonLabel: "",
  });
  const settings = useBlockEditor<SettingsContent>("site.settings", data?.["site.settings"], {
    siteName: "", logoUrl: "", supportEmail: "", footerTagline: "",
  });
  const birthdayEmail = useBlockEditor<EmailContent>("email.birthday", data?.["email.birthday"], {
    subject: "", body: "",
  });

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading site content…</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center text-muted-foreground space-y-3">
        <p className="font-medium text-destructive">Couldn't load site content.</p>
        <p className="text-xs">{error instanceof Error ? error.message : "Unknown error"}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        Edit the copy shown on your public landing page — no code required. Changes save per section and go live immediately.
      </div>

      {/* Hero */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Layout className="w-5 h-5 text-primary" /> Hero Section</CardTitle>
          <CardDescription>The first thing visitors see on the landing page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Badge text">
            <Input value={hero.draft.badge} onChange={(e) => hero.setDraft({ ...hero.draft, badge: e.target.value })} />
          </Field>
          <Field label="Headline">
            <Input value={hero.draft.heading} onChange={(e) => hero.setDraft({ ...hero.draft, heading: e.target.value })} />
          </Field>
          <Field label="Subheadline">
            <Textarea rows={3} value={hero.draft.subheading} onChange={(e) => hero.setDraft({ ...hero.draft, subheading: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Primary button label">
              <Input value={hero.draft.primaryCta} onChange={(e) => hero.setDraft({ ...hero.draft, primaryCta: e.target.value })} />
            </Field>
            <Field label="Secondary button label">
              <Input value={hero.draft.secondaryCta} onChange={(e) => hero.setDraft({ ...hero.draft, secondaryCta: e.target.value })} />
            </Field>
          </div>
          <SaveButton onClick={hero.save} saving={hero.saving} />
        </CardContent>
      </Card>

      {/* Features */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /> Features Section</CardTitle>
          <CardDescription>The grid of feature cards below the hero.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Section heading">
            <Input value={features.draft.heading} onChange={(e) => features.setDraft({ ...features.draft, heading: e.target.value })} />
          </Field>
          <Field label="Section subheading">
            <Input value={features.draft.subheading} onChange={(e) => features.setDraft({ ...features.draft, subheading: e.target.value })} />
          </Field>
          <div className="space-y-3">
            {features.draft.items.map((item, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-2">
                <Input
                  value={item.title}
                  placeholder="Feature title"
                  onChange={(e) => {
                    const items = [...features.draft.items];
                    items[i] = { ...item, title: e.target.value };
                    features.setDraft({ ...features.draft, items });
                  }}
                />
                <Textarea
                  rows={2}
                  value={item.description}
                  placeholder="Feature description"
                  onChange={(e) => {
                    const items = [...features.draft.items];
                    items[i] = { ...item, description: e.target.value };
                    features.setDraft({ ...features.draft, items });
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    const items = features.draft.items.filter((_, idx) => idx !== i);
                    features.setDraft({ ...features.draft, items });
                  }}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => features.setDraft({ ...features.draft, items: [...features.draft.items, { title: "", description: "" }] })}
            >
              + Add feature
            </Button>
          </div>
          <SaveButton onClick={features.save} saving={features.saving} />
        </CardContent>
      </Card>

      {/* Stats/Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Megaphone className="w-5 h-5 text-primary" /> Metrics Section</CardTitle>
          <CardDescription>The "why choose us" panel with bullet points and stat callouts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Heading">
            <Input value={stats.draft.heading} onChange={(e) => stats.setDraft({ ...stats.draft, heading: e.target.value })} />
          </Field>
          <Field label="Body text">
            <Textarea rows={3} value={stats.draft.body} onChange={(e) => stats.setDraft({ ...stats.draft, body: e.target.value })} />
          </Field>
          <Field label="Bullet points (one per line)">
            <Textarea
              rows={4}
              value={stats.draft.bullets.join("\n")}
              onChange={(e) => stats.setDraft({ ...stats.draft, bullets: e.target.value.split("\n") })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {stats.draft.stats.map((s, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  className="w-24"
                  value={s.value}
                  placeholder="Value"
                  onChange={(e) => {
                    const arr = [...stats.draft.stats];
                    arr[i] = { ...s, value: e.target.value };
                    stats.setDraft({ ...stats.draft, stats: arr });
                  }}
                />
                <Input
                  value={s.label}
                  placeholder="Label"
                  onChange={(e) => {
                    const arr = [...stats.draft.stats];
                    arr[i] = { ...s, label: e.target.value };
                    stats.setDraft({ ...stats.draft, stats: arr });
                  }}
                />
              </div>
            ))}
          </div>
          <SaveButton onClick={stats.save} saving={stats.saving} />
        </CardContent>
      </Card>

      {/* CTA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Megaphone className="w-5 h-5 text-primary" /> Call-to-Action Banner</CardTitle>
          <CardDescription>The colored band before the footer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Heading">
            <Input value={cta.draft.heading} onChange={(e) => cta.setDraft({ ...cta.draft, heading: e.target.value })} />
          </Field>
          <Field label="Body">
            <Textarea rows={2} value={cta.draft.body} onChange={(e) => cta.setDraft({ ...cta.draft, body: e.target.value })} />
          </Field>
          <Field label="Button label">
            <Input value={cta.draft.buttonLabel} onChange={(e) => cta.setDraft({ ...cta.draft, buttonLabel: e.target.value })} />
          </Field>
          <SaveButton onClick={cta.save} saving={cta.saving} />
        </CardContent>
      </Card>

      {/* Site settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings2 className="w-5 h-5 text-primary" /> Site Settings</CardTitle>
          <CardDescription>Branding shown in the navbar and footer across the site.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Site name">
              <Input value={settings.draft.siteName} onChange={(e) => settings.setDraft({ ...settings.draft, siteName: e.target.value })} />
            </Field>
            <Field label="Logo URL">
              <Input value={settings.draft.logoUrl} onChange={(e) => settings.setDraft({ ...settings.draft, logoUrl: e.target.value })} />
            </Field>
          </div>
          <Field label="Support email">
            <Input value={settings.draft.supportEmail} onChange={(e) => settings.setDraft({ ...settings.draft, supportEmail: e.target.value })} />
          </Field>
          <Field label="Footer tagline">
            <Textarea rows={2} value={settings.draft.footerTagline} onChange={(e) => settings.setDraft({ ...settings.draft, footerTagline: e.target.value })} />
          </Field>
          <SaveButton onClick={settings.save} saving={settings.saving} />
        </CardContent>
      </Card>

      {/* Birthday email template */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5 text-primary" /> Birthday Email Template</CardTitle>
          <CardDescription>Use <code className="bg-muted px-1 rounded text-xs">{"{{name}}"}</code> to insert the vendor's name.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Subject">
            <Input value={birthdayEmail.draft.subject} onChange={(e) => birthdayEmail.setDraft({ ...birthdayEmail.draft, subject: e.target.value })} />
          </Field>
          <Field label="Body">
            <Textarea rows={3} value={birthdayEmail.draft.body} onChange={(e) => birthdayEmail.setDraft({ ...birthdayEmail.draft, body: e.target.value })} />
          </Field>
          <SaveButton onClick={birthdayEmail.save} saving={birthdayEmail.saving} />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SaveButton({ onClick, saving }: { onClick: () => void; saving: boolean }) {
  return (
    <Button size="sm" onClick={onClick} disabled={saving} className="gap-2">
      <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save section"}
    </Button>
  );
}
