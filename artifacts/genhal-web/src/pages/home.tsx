import { useGetGenhalDashboard } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { Network, BookOpen, Globe2, Sparkles, Users, Layers, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { useEffect, useRef, useState } from 'react';

/* ── animated counter ── */
function useCountUp(target: number, duration = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) return;
    let start = 0;
    const step = Math.ceil(target / (duration / 16));
    const timer = setInterval(() => {
      start = Math.min(start + step, target);
      setValue(start);
      if (start >= target) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

/* ── floating orb ── */
function FloatingOrb({ className }: { className: string }) {
  return <div className={`absolute rounded-full blur-3xl opacity-20 animate-pulse pointer-events-none ${className}`} />;
}

/* ── Trusted By data ── */
const TRUSTED_COMMUNITIES = [
  { name: "Benin Kingdom",        region: "Edo, Nigeria",          emoji: "👑", color: "from-amber-500 to-orange-600" },
  { name: "Ashanti Kingdom",      region: "Ashanti, Ghana",        emoji: "🛡️", color: "from-yellow-500 to-amber-600" },
  { name: "Oyo Empire",           region: "Oyo, Nigeria",          emoji: "🐎", color: "from-red-500 to-rose-600" },
  { name: "Zulu Kingdom",         region: "KwaZulu-Natal, SA",     emoji: "🌿", color: "from-green-500 to-emerald-600" },
  { name: "Buganda Kingdom",      region: "Kampala, Uganda",       emoji: "🦅", color: "from-blue-500 to-indigo-600" },
  { name: "Fulani Emirates",      region: "Sokoto, Nigeria",       emoji: "🌙", color: "from-purple-500 to-violet-600" },
  { name: "Yoruba Heritage Org.", region: "Lagos, Nigeria",        emoji: "🎭", color: "from-pink-500 to-rose-500" },
  { name: "Igbo Cultural Union",  region: "Enugu, Nigeria",        emoji: "🌳", color: "from-teal-500 to-cyan-600" },
  { name: "Hausa Alliance",       region: "Kano, Nigeria",         emoji: "🕌", color: "from-indigo-500 to-blue-600" },
  { name: "Swahili Heritage Ctr", region: "Mombasa, Kenya",        emoji: "⚓", color: "from-sky-500 to-blue-500" },
  { name: "Kongo Kingdom Trust",  region: "Kinshasa, DRC",         emoji: "🌺", color: "from-orange-500 to-amber-500" },
  { name: "Akan Heritage Fund",   region: "Accra, Ghana",          emoji: "🎶", color: "from-lime-500 to-green-600" },
  { name: "Ndebele Cultural Org", region: "Bulawayo, Zimbabwe",    emoji: "🦓", color: "from-red-400 to-orange-500" },
  { name: "Songhai Descendants",  region: "Gao, Mali",             emoji: "🏜️", color: "from-yellow-600 to-orange-500" },
  { name: "Luba Kingdom Trust",   region: "Kalemie, DRC",          emoji: "🔺", color: "from-violet-500 to-purple-600" },
  { name: "Mandé Heritage Soc.",  region: "Bamako, Mali",          emoji: "🎸", color: "from-emerald-500 to-teal-600" },
];

function TrustedByCard({ community }: { community: typeof TRUSTED_COMMUNITIES[0] }) {
  return (
    <div className="flex-shrink-0 w-52 mx-3">
      <div className="bg-card border border-border/60 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 group cursor-default">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${community.color} flex items-center justify-center text-lg mb-3 transition-transform duration-300 group-hover:scale-110`}>
          {community.emoji}
        </div>
        <p className="font-semibold text-sm text-foreground leading-tight">{community.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{community.region}</p>
      </div>
    </div>
  );
}

export default function Home() {
  const { data: dashboard, isLoading, error } = useGetGenhalDashboard();
  const marqueeRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-12 pb-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-secondary text-secondary-foreground p-8 md:p-16 flex flex-col justify-center items-start shadow-2xl min-h-[420px]">
        {/* background photo */}
        <div className="absolute inset-0 opacity-10 bg-[url('https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?q=80&w=2572&auto=format&fit=crop')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-gradient-to-r from-secondary via-secondary/90 to-transparent" />

        {/* floating colour orbs */}
        <FloatingOrb className="w-72 h-72 bg-primary top-[-4rem] right-[-4rem] animation-delay-0" />
        <FloatingOrb className="w-48 h-48 bg-accent bottom-[-2rem] right-[20%] animation-delay-700" />
        <FloatingOrb className="w-32 h-32 bg-purple-400 top-[40%] right-[40%] animation-delay-1400" />

        <div className="relative z-10 max-w-2xl space-y-6">
          {/* pill badge */}
          <div
            className="inline-flex items-center rounded-full border border-secondary-foreground/20 bg-secondary-foreground/10 px-4 py-1.5 text-sm font-semibold backdrop-blur-sm
                       animate-in fade-in slide-in-from-bottom-4 duration-700"
          >
            <Sparkles className="mr-2 h-4 w-4 text-accent animate-spin" style={{ animationDuration: '4s' }} />
            Genealogy • Heritage • Language
          </div>

          {/* headline */}
          <h1
            className="text-5xl md:text-7xl font-serif font-bold leading-tight
                       animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150"
          >
            Know Your <span className="text-accent">Roots</span>.<br />
            Tell Your <span className="text-primary-foreground/90">Story</span>.
          </h1>

          {/* tagline */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
            <p className="text-base md:text-lg font-medium text-secondary-foreground/90 tracking-wide">
              Preserve your roots.&nbsp; Protect your heritage.&nbsp; Keep your language alive.
            </p>
            <p className="mt-2 text-sm md:text-base text-secondary-foreground/60 max-w-xl">
              A pan-African platform for tracing genealogy, protecting community heritage, and keeping indigenous languages alive for generations to come.
            </p>
          </div>

          {/* CTA buttons */}
          <div
            className="flex flex-wrap gap-4 pt-2
                       animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500"
          >
            <Link href="/genealogy">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 text-primary-foreground text-base rounded-full px-8 shadow-lg shadow-primary/30
                           transition-transform hover:scale-105 active:scale-95"
              >
                Trace Your Lineage
              </Button>
            </Link>
            <Link href="/language">
              <Button
                size="lg"
                variant="outline"
                className="rounded-full px-8 text-base border-secondary-foreground/25 bg-secondary-foreground/10 hover:bg-secondary-foreground/20 text-white backdrop-blur-sm
                           transition-transform hover:scale-105 active:scale-95"
              >
                Explore Languages
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Overview */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)
        ) : error ? (
          <div className="col-span-4 p-4 text-center text-muted-foreground">Unable to load statistics.</div>
        ) : (
          <>
            <StatCard icon={<Network className="h-5 w-5 text-primary" />} label="Family Trees" value={dashboard?.totalTrees || 0} delay={0} />
            <StatCard icon={<Layers className="h-5 w-5 text-secondary" />} label="Communities" value={dashboard?.totalCommunities || 0} delay={100} />
            <StatCard icon={<Globe2 className="h-5 w-5 text-accent" />} label="Languages" value={dashboard?.totalLanguages || 0} delay={200} />
            <StatCard icon={<Sparkles className="h-5 w-5 text-purple-500" />} label="AI Generations" value={dashboard?.totalAiGenerations || 0} delay={300} />
          </>
        )}
      </section>

      {/* Pillars */}
      <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
        <h2 className="text-3xl font-serif font-bold text-foreground">Explore the Pillars</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <PillarCard
            title="Genealogy"
            description="Build your family tree, document generations, and connect with your ancestors."
            icon={<Network className="h-8 w-8" />}
            href="/genealogy"
            color="bg-primary/10 text-primary"
            hover="hover:border-primary/50 hover:shadow-primary/10"
            delay={0}
          />
          <PillarCard
            title="Heritage Hub"
            description="Discover communities, share oral histories, photos, and cultural traditions."
            icon={<BookOpen className="h-8 w-8" />}
            href="/heritage"
            color="bg-secondary/10 text-secondary"
            hover="hover:border-secondary/50 hover:shadow-secondary/10"
            delay={100}
          />
          <PillarCard
            title="Language Center"
            description="Learn and preserve indigenous languages. Contribute to the community dictionary."
            icon={<Globe2 className="h-8 w-8" />}
            href="/language"
            color="bg-accent/20 text-accent-foreground"
            hover="hover:border-accent/50 hover:shadow-accent/10"
            delay={200}
          />
        </div>
      </section>

      {/* ── Trusted By ── */}
      <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-400">
        {/* heading */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-primary/8 border border-primary/20 rounded-full px-4 py-1.5 text-xs font-bold text-primary uppercase tracking-widest">
            <Sparkles className="h-3.5 w-3.5" /> Trusted By Communities
          </div>
          <h2 className="text-3xl font-serif font-bold text-foreground">
            African Kingdoms & Heritage Organisations
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm">
            Thousands of families, kingdoms, and cultural organisations across Africa use GenHaL to preserve their identity for generations to come.
          </p>
        </div>

        {/* scrolling marquee — two rows scrolling in opposite directions */}
        <div className="relative overflow-hidden rounded-3xl py-4 space-y-4">
          {/* fade edges */}
          <div className="absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-background to-transparent pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-background to-transparent pointer-events-none" />

          {/* Row 1 — scrolls left */}
          <div className="flex" style={{ animation: 'marquee-left 38s linear infinite' }}>
            {[...TRUSTED_COMMUNITIES, ...TRUSTED_COMMUNITIES].map((c, i) => (
              <TrustedByCard key={`a-${i}`} community={c} />
            ))}
          </div>

          {/* Row 2 — scrolls right */}
          <div className="flex" style={{ animation: 'marquee-right 42s linear infinite' }}>
            {[...TRUSTED_COMMUNITIES.slice(8), ...TRUSTED_COMMUNITIES, ...TRUSTED_COMMUNITIES.slice(0, 8)].map((c, i) => (
              <TrustedByCard key={`b-${i}`} community={c} />
            ))}
          </div>
        </div>

        {/* bottom cta */}
        <div className="text-center pt-2">
          <Link href="/kingdoms">
            <Button variant="outline" className="rounded-full px-6 transition-all hover:scale-105">
              View All Kingdoms →
            </Button>
          </Link>
        </div>
      </section>

      {/* Recent Activity */}
      <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-serif font-bold text-foreground">Recent Activity</h2>
        </div>

        <Card className="border-none shadow-md overflow-hidden bg-card/50 backdrop-blur-sm">
          <div className="divide-y">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-6 flex gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))
            ) : dashboard?.recentActivity && dashboard.recentActivity.length > 0 ? (
              dashboard.recentActivity.map((activity: any, i: number) => (
                <div
                  key={i}
                  className="p-6 flex items-start gap-4 hover:bg-muted/50 transition-colors
                             animate-in fade-in slide-in-from-left-4 duration-500"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 transition-transform hover:scale-110">
                    <UserCircleIcon type={activity.type} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      <span className="font-semibold">{activity.user || 'A community member'}</span> {activity.action}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      {activity.date ? format(new Date(activity.date), 'MMM d, yyyy') : 'Recently'}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-3">
                <MessageSquare className="h-12 w-12 text-muted animate-bounce" />
                <p>No recent activity. Be the first to contribute!</p>
                <Link href="/heritage">
                  <Button variant="outline" className="mt-2 transition-transform hover:scale-105">Share a Story</Button>
                </Link>
              </div>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, delay }: { icon: React.ReactNode; label: string; value: number; delay: number }) {
  const count = useCountUp(value);
  return (
    <Card
      className="border-none shadow-sm bg-card hover:shadow-lg transition-all duration-300 hover:-translate-y-1 group
                 animate-in fade-in zoom-in-95 duration-500"
      style={{ animationDelay: `${delay}ms` }}
    >
      <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-2">
        <div className="p-3 bg-muted rounded-full mb-2 transition-transform group-hover:scale-110 group-hover:rotate-6 duration-300">
          {icon}
        </div>
        <div className="text-3xl font-bold font-serif tabular-nums">{count.toLocaleString()}</div>
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
      </CardContent>
    </Card>
  );
}

function PillarCard({ title, description, icon, href, color, hover, delay }: {
  title: string; description: string; icon: React.ReactNode;
  href: string; color: string; hover: string; delay: number;
}) {
  return (
    <Link href={href}>
      <Card
        className={`h-full border border-transparent shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer group hover:-translate-y-2 ${hover}
                   animate-in fade-in slide-in-from-bottom-6 duration-600`}
        style={{ animationDelay: `${delay}ms` }}
      >
        <CardHeader>
          <div className={`h-14 w-14 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 ${color}`}>
            {icon}
          </div>
          <CardTitle className="font-serif text-2xl group-hover:text-primary transition-colors duration-200">{title}</CardTitle>
          <CardDescription className="text-base mt-2">{description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}

function UserCircleIcon({ type }: { type?: string }) {
  switch (type) {
    case 'tree': return <Network className="h-5 w-5" />;
    case 'heritage': return <BookOpen className="h-5 w-5" />;
    case 'language': return <Globe2 className="h-5 w-5" />;
    default: return <Users className="h-5 w-5" />;
  }
}
