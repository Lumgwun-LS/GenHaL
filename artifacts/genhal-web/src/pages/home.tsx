import { useGetGenhalDashboard } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  Network,
  BookOpen,
  Globe2,
  Sparkles,
  Users,
  ChevronRight,
  MessageSquare,
  PlayCircle,
  Crown,
  Upload,
  Brain,
} from 'lucide-react';
import { format } from 'date-fns';
import { useUser } from '@clerk/react';

import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { StatCard } from '@/components/stat-card';
import { EmptyState } from '@/components/empty-state';
import { Reveal, stagger } from '@/components/reveal';

const PILLARS = [
  {
    title: 'Family Trees',
    description: 'Build your family tree, document generations, and connect with your ancestors.',
    icon: Network,
    href: '/genealogy',
    accentBg: 'bg-amber-500/10',
    accentText: 'text-amber-600 dark:text-amber-400',
    dot: '#F97316',
  },
  {
    title: 'Heritage Hub',
    description: 'Discover communities, share oral histories, photos, and cultural traditions.',
    icon: BookOpen,
    href: '/heritage',
    accentBg: 'bg-emerald-500/10',
    accentText: 'text-emerald-600 dark:text-emerald-400',
    dot: '#10B981',
  },
  {
    title: 'Language Center',
    description: 'Learn and preserve indigenous languages. Contribute to the community dictionary.',
    icon: Globe2,
    href: '/language',
    accentBg: 'bg-sky-500/10',
    accentText: 'text-sky-600 dark:text-sky-400',
    dot: '#0EA5E9',
  },
  {
    title: 'Kingdoms & Realms',
    description: 'Explore and document the historical kingdoms, empires, and chieftaincies of Africa.',
    icon: Crown,
    href: '/kingdoms',
    accentBg: 'bg-purple-500/10',
    accentText: 'text-purple-600 dark:text-purple-400',
    dot: '#A855F7',
  },
  {
    title: 'Language Corpus',
    description: 'Upload language materials and launch AI model training on Google Vertex AI.',
    icon: Brain,
    href: '/corpus',
    accentBg: 'bg-rose-500/10',
    accentText: 'text-rose-600 dark:text-rose-400',
    dot: '#F43F5E',
  },
  {
    title: 'Heritage Collector',
    description: 'Record and upload audio, video, and written materials in your indigenous language.',
    icon: Upload,
    href: '/collect',
    accentBg: 'bg-orange-500/10',
    accentText: 'text-orange-600 dark:text-orange-400',
    dot: '#FB923C',
  },
];

function useExplainerVideoUrl() {
  return useQuery({
    queryKey: ['genhal-explainer-video-url'],
    queryFn: async () => {
      const res = await fetch('/api/genhal/public/video-url');
      if (!res.ok) return '';
      const data = await res.json();
      return (data.url as string) ?? '';
    },
    staleTime: 5 * 60 * 1000,
  });
}

export default function Home() {
  const { data: dashboard, isLoading, error } = useGetGenhalDashboard();
  const { data: videoUrl } = useExplainerVideoUrl();
  const { user } = useUser();

  const firstName = user?.firstName ?? user?.username ?? null;

  return (
    <div className="space-y-6">
      {/* ── Hero banner ─────────────────────────────────────────────────── */}
      <Reveal animation="fade-up">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-stone-900 via-stone-800 to-amber-950 text-white p-8 md:p-12">
          {/* Decorative orbs */}
          <div className="pointer-events-none absolute -top-8 -right-8 h-48 w-48 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute -bottom-12 right-20 h-36 w-36 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute top-1/2 right-64 h-20 w-20 rounded-full bg-amber-400/10" />

          <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0 max-w-xl">
              {/* Eyebrow */}
              <div className="mb-3 flex items-center gap-2 text-amber-400 text-sm font-medium">
                <Sparkles className="h-4 w-4" />
                Preserving African Heritage
              </div>

              {/* Greeting + title */}
              {firstName && (
                <p className="mb-1 text-white/60 text-sm font-medium">
                  Welcome back, {firstName} 👋
                </p>
              )}
              <h1 className="text-4xl md:text-5xl font-serif font-bold leading-tight mb-3">
                Know your roots.<br />Tell your story.
              </h1>
              <p className="text-white/75 text-base md:text-lg max-w-lg">
                Trace genealogy, protect community heritage, and keep indigenous
                languages alive — all in one archive.
              </p>

              {/* CTA row */}
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/genealogy"
                  className="inline-flex items-center gap-2 rounded-full bg-amber-500 hover:bg-amber-400 px-5 py-2.5 text-sm font-semibold text-stone-900 shadow-lg transition-colors"
                >
                  Trace your lineage
                  <ChevronRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/language"
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 hover:bg-white/20 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-colors"
                >
                  Explore languages
                </Link>
              </div>
            </div>

            {/* Mini stat pills */}
            {!isLoading && !error && dashboard && (
              <div className="flex flex-wrap gap-2 md:flex-col md:items-end md:gap-2 shrink-0">
                {[
                  { label: 'Family Trees', value: dashboard.totalTrees ?? 0, icon: '🌳' },
                  { label: 'Communities', value: dashboard.totalCommunities ?? 0, icon: '🏛️' },
                  { label: 'Languages', value: dashboard.totalLanguages ?? 0, icon: '📖' },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur-sm"
                  >
                    <span>{s.icon}</span>
                    <span className="text-white/70 font-normal">{s.label}</span>
                    <span>{s.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Reveal>

      {/* ── Explainer video ─────────────────────────────────────────────── */}
      {videoUrl && (
        <Reveal animation="fade-up">
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b border-border px-5 py-3">
              <PlayCircle className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Watch our story</h3>
            </div>
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <video
                src={videoUrl}
                controls
                playsInline
                preload="metadata"
                className="absolute inset-0 h-full w-full bg-black object-contain"
              />
            </div>
          </section>
        </Reveal>
      )}

      {/* ── Stats row ───────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[110px] rounded-2xl" />
          ))
        ) : error ? (
          <div className="col-span-2 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground lg:col-span-4">
            Unable to load statistics right now.
          </div>
        ) : (
          <>
            <Reveal animation="zoom" delay={stagger(0)} className="h-full">
              <StatCard className="h-full" label="Family Trees"    value={dashboard?.totalTrees ?? 0}          icon={<Network className="h-5 w-5" />}  color="terracotta" />
            </Reveal>
            <Reveal animation="zoom" delay={stagger(1)} className="h-full">
              <StatCard className="h-full" label="Communities"     value={dashboard?.totalCommunities ?? 0}    icon={<BookOpen className="h-5 w-5" />}  color="forest" />
            </Reveal>
            <Reveal animation="zoom" delay={stagger(2)} className="h-full">
              <StatCard className="h-full" label="Languages"       value={dashboard?.totalLanguages ?? 0}      icon={<Globe2 className="h-5 w-5" />}    color="gold" />
            </Reveal>
            <Reveal animation="zoom" delay={stagger(3)} className="h-full">
              <StatCard className="h-full" label="AI Generations"  value={dashboard?.totalAiGenerations ?? 0}  icon={<Sparkles className="h-5 w-5" />}  color="neutral" />
            </Reveal>
          </>
        )}
      </section>

      {/* ── Pillars ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Explore the archive
        </h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((pillar, i) => (
            <Reveal key={pillar.href} animation="fade-up" delay={stagger(i)} className="h-full">
              <Link
                href={pillar.href}
                className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <div
                  className="group relative h-full overflow-hidden border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
                  style={{ borderRadius: 'var(--theme-card-radius, 16px)' }}
                >
                  {/* Subtle top accent strip */}
                  <div
                    className="absolute inset-x-0 top-0 h-0.5 opacity-60"
                    style={{ background: pillar.dot }}
                  />
                  <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${pillar.accentBg}`}>
                    <pillar.icon className={`h-5 w-5 ${pillar.accentText}`} />
                  </div>
                  <p className="font-serif text-base font-bold text-foreground">
                    {pillar.title}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {pillar.description}
                  </p>
                  <span className={cn('mt-4 inline-flex items-center gap-1 text-sm font-semibold', pillar.accentText)}>
                    Open
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Recent activity ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Recent activity
        </h3>

        {isLoading ? (
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3 p-4">
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2 pt-0.5">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-1/5" />
                </div>
              </div>
            ))}
          </div>
        ) : dashboard?.recentActivity && dashboard.recentActivity.length > 0 ? (
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            {dashboard.recentActivity.map((activity: any, i: number) => (
              <Reveal
                key={i}
                animation="fade-up"
                delay={stagger(i, 40)}
                className="flex items-start gap-3 p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ActivityIcon type={activity.type} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    <span className="font-semibold">
                      {activity.user || 'A community member'}
                    </span>{' '}
                    {activity.action}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {activity.date
                      ? format(new Date(activity.date), 'MMM d, yyyy')
                      : 'Recently'}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<MessageSquare className="h-5 w-5" />}
            title="No recent activity"
            description="Nothing has been contributed yet. Share a story to get the archive moving."
            action={
              <Link href="/heritage" className={buttonVariants({ variant: 'outline' })}>
                Share a story
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}

function ActivityIcon({ type }: { type?: string }) {
  switch (type) {
    case 'tree':     return <Network  className="h-4 w-4" />;
    case 'heritage': return <BookOpen className="h-4 w-4" />;
    case 'language': return <Globe2   className="h-4 w-4" />;
    default:         return <Users    className="h-4 w-4" />;
  }
}
