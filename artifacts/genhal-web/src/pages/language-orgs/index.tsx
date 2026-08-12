/**
 * /language-orgs — Directory of registered Language Organisations on GenHaL.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Globe2, Users, BookOpen, CheckCircle2, PlusCircle, ChevronRight, Search, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getApiBaseUrl } from "@/lib/api";

interface LanguageOrg {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  website: string | null;
  country: string | null;
  memberCount: number;
  languageCodes: string[];
  createdAt: string;
}

export default function LanguageOrgsPage() {
  const [orgs, setOrgs] = useState<LanguageOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [, navigate] = useLocation();
  const base = getApiBaseUrl();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${base}/genhal/language-orgs`);
        const data = await res.json();
        setOrgs(data.orgs ?? []);
      } catch {
        // An unreachable API used to reject here with nothing catching it —
        // res.json() throws on an empty body. The directory simply shows its
        // empty state instead, which is what the rest of these pages do.
        setOrgs([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [base]);

  const filtered = orgs.filter(
    (o) =>
      !query ||
      o.name.toLowerCase().includes(query.toLowerCase()) ||
      o.country?.toLowerCase().includes(query.toLowerCase()) ||
      o.languageCodes.some((c) => c.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <div className="space-y-6">
      {/* Hero card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-stone-900 via-stone-800 to-amber-950 text-white p-8 md:p-12">
        <div className="pointer-events-none absolute -top-8 -right-8 h-40 w-40 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-10 right-16 h-32 w-32 rounded-full bg-white/5" />
        <div className="flex items-center gap-2 text-amber-400 text-sm font-medium mb-3">
          <Globe2 className="h-4 w-4" />
          Language Governance
        </div>
        <h1 className="text-4xl md:text-5xl font-serif font-bold mb-3">Language Organisations</h1>
        <p className="text-white/80 text-base md:text-lg max-w-xl mb-5">
          Official custodians of African languages — reviewing corpus data before it trains AI models.
        </p>
        <Button
          className="rounded-full bg-amber-500 hover:bg-amber-400 text-stone-900 font-semibold shadow-lg"
          onClick={() => navigate("/language-orgs/register")}
        >
          <PlusCircle className="mr-2 h-4 w-4" /> Register Your Organisation
        </Button>
        <div className="flex flex-wrap gap-2 mt-4">
          {['Approved reviewers', 'AI training oversight', 'Community governance'].map((t) => (
            <div key={t} className="flex items-center gap-1.5 text-xs bg-amber-50/10 border border-amber-300/30 text-amber-200 px-3 py-1.5 rounded-full font-medium">
              {t}
            </div>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 rounded-xl"
          placeholder="Search by name, country, or language code…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-amber-700 dark:text-amber-300" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Globe2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          {query ? "No organisations match your search." : "No organisations have been approved yet."}
          <div className="mt-4">
            <Button variant="outline" className="rounded-xl" onClick={() => navigate("/language-orgs/register")}>
              Be the first to register
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((org) => (
            <OrgCard key={org.id} org={org} onClick={() => navigate(`/language-orgs/${org.id}`)} />
          ))}
        </div>
      )}

      {/* Info banner */}
      <div className="rounded-xl border bg-amber-50 border-amber-200 p-5 flex gap-4 dark:bg-amber-500/10 dark:border-amber-500/30">
        <CheckCircle2 className="h-5 w-5 text-amber-700 shrink-0 mt-0.5 dark:text-amber-300" />
        <div className="text-sm text-amber-900 space-y-1 dark:text-amber-300">
          <p className="font-semibold">How the approval system works</p>
          <p className="text-amber-800 leading-relaxed dark:text-amber-300">
            When an organisation enables approval review for their language, all new corpus
            submissions are held in a pending queue.  A designated reviewer from the organisation
            inspects each submission and either approves it (making it eligible for AI training)
            or rejects it with feedback.
          </p>
        </div>
      </div>
    </div>
  );
}

function OrgCard({ org, onClick }: { org: LanguageOrg; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-2xl border bg-white hover:border-amber-400 hover:shadow-md transition-all p-5 space-y-3 group dark:bg-card dark:hover:border-amber-500/50"
      style={{ borderRadius: 'var(--theme-card-radius, 16px)' }}
    >
      <div className="flex items-start gap-3">
        {org.logoUrl ? (
          <img src={org.logoUrl} alt={org.name} className="h-10 w-10 rounded-lg object-cover border shrink-0" />
        ) : (
          <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 dark:bg-amber-500/15">
            <BookOpen className="h-5 w-5 text-amber-700 dark:text-amber-300" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold truncate">{org.name}</p>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </div>
          {org.country && <p className="text-xs text-muted-foreground">{org.country}</p>}
        </div>
      </div>

      {org.description && (
        <p className="text-sm text-muted-foreground line-clamp-2">{org.description}</p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {org.languageCodes.slice(0, 4).map((code) => (
            <Badge key={code} variant="outline" className="text-[10px] px-2 font-mono">
              {code.toUpperCase()}
            </Badge>
          ))}
          {org.languageCodes.length > 4 && (
            <Badge variant="outline" className="text-[10px] px-2">
              +{org.languageCodes.length - 4}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <Users className="h-3.5 w-3.5" />
          {org.memberCount}
        </div>
      </div>
    </button>
  );
}
