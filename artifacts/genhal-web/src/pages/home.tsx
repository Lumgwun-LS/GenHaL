import { useGetGenhalDashboard } from '@workspace/api-client-react';
import { Link } from 'wouter';
import {
  Network,
  BookOpen,
  Globe2,
  Sparkles,
  Users,
  ChevronRight,
  MessageSquare,
} from 'lucide-react';
import { format } from 'date-fns';

import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { StatCard } from '@/components/stat-card';
import { EmptyState } from '@/components/empty-state';
import { Reveal, stagger } from '@/components/reveal';

const PILLARS = [
  {
    title: 'Genealogy',
    description:
      'Build your family tree, document generations, and connect with your ancestors.',
    icon: Network,
    href: '/genealogy',
    chip: 'bg-primary/10 text-primary',
  },
  {
    title: 'Heritage Hub',
    description:
      'Discover communities, share oral histories, photos, and cultural traditions.',
    icon: BookOpen,
    href: '/heritage',
    chip: 'bg-secondary/10 text-secondary',
  },
  {
    title: 'Language Center',
    description:
      'Learn and preserve indigenous languages. Contribute to the community dictionary.',
    icon: Globe2,
    href: '/language',
    chip: 'bg-accent/15 text-accent-foreground dark:text-accent',
  },
];

export default function Home() {
  const { data: dashboard, isLoading, error } = useGetGenhalDashboard();

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <Reveal animation="fade-up">
        <section
          className="relative overflow-hidden rounded-xl px-5 py-5 md:px-6 md:py-6"
          style={{
            background:
              'linear-gradient(135deg, #A8360F 0%, #C2521A 55%, #D99321 100%)',
          }}
        >
          <div className="pointer-events-none absolute -top-6 right-16 hidden h-24 w-24 rounded-full bg-white/5 sm:block" />
          <div className="pointer-events-none absolute right-8 top-10 hidden h-32 w-32 rounded-full bg-white/5 sm:block" />

          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 max-w-xl">
              <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/90 backdrop-blur-sm">
                <Sparkles className="h-3 w-3" />
                Preserving African Heritage
              </p>
              <h2 className="text-xl font-bold leading-tight tracking-tight text-white md:text-2xl">
                Know your roots. Tell your story.
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-white/75">
                Trace genealogy, protect community heritage, and keep indigenous
                languages like Obolo alive — all in one archive.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <Link
                href="/genealogy"
                className={cn(buttonVariants(), 'bg-white text-primary')}
                style={{ borderColor: 'transparent' }}
              >
                Trace your lineage
              </Link>
              <Link
                href="/language"
                className={cn(
                  buttonVariants({ variant: 'outline' }),
                  'bg-white/10 text-white backdrop-blur-sm',
                )}
                style={{ borderColor: 'rgba(255,255,255,0.45)' }}
              >
                Explore languages
              </Link>
            </div>
          </div>
        </section>
      </Reveal>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[110px] rounded-xl" />
          ))
        ) : error ? (
          <div className="col-span-2 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground lg:col-span-4">
            Unable to load statistics right now.
          </div>
        ) : (
          <>
            <Reveal animation="zoom" delay={stagger(0)} className="h-full">
              <StatCard
                className="h-full"
                label="Family Trees"
                value={dashboard?.totalTrees ?? 0}
                icon={<Network className="h-5 w-5" />}
                color="terracotta"
              />
            </Reveal>
            <Reveal animation="zoom" delay={stagger(1)} className="h-full">
              <StatCard
                className="h-full"
                label="Communities"
                value={dashboard?.totalCommunities ?? 0}
                icon={<BookOpen className="h-5 w-5" />}
                color="forest"
              />
            </Reveal>
            <Reveal animation="zoom" delay={stagger(2)} className="h-full">
              <StatCard
                className="h-full"
                label="Languages"
                value={dashboard?.totalLanguages ?? 0}
                icon={<Globe2 className="h-5 w-5" />}
                color="gold"
              />
            </Reveal>
            <Reveal animation="zoom" delay={stagger(3)} className="h-full">
              <StatCard
                className="h-full"
                label="AI Generations"
                value={dashboard?.totalAiGenerations ?? 0}
                icon={<Sparkles className="h-5 w-5" />}
                color="neutral"
              />
            </Reveal>
          </>
        )}
      </section>

      {/* Pillars */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Explore the pillars
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          {PILLARS.map((pillar, i) => (
            <Reveal
              key={pillar.href}
              animation="fade-up"
              delay={stagger(i)}
              className="h-full"
            >
              <Link
                href={pillar.href}
                className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <div className="group h-full rounded-xl border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-card-hover">
                  <div
                    className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${pillar.chip}`}
                  >
                    <pillar.icon className="h-5 w-5" />
                  </div>
                  <p className="text-base font-semibold text-foreground">
                    {pillar.title}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {pillar.description}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                    Open
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Recent activity */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Recent activity
        </h3>

        {isLoading ? (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-card">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3 p-4">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-1/5" />
                </div>
              </div>
            ))}
          </div>
        ) : dashboard?.recentActivity && dashboard.recentActivity.length > 0 ? (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-card">
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
              <Link
                href="/heritage"
                className={buttonVariants({ variant: 'outline' })}
              >
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
    case 'tree':
      return <Network className="h-4 w-4" />;
    case 'heritage':
      return <BookOpen className="h-4 w-4" />;
    case 'language':
      return <Globe2 className="h-4 w-4" />;
    default:
      return <Users className="h-4 w-4" />;
  }
}
