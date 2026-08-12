import { useState } from 'react';
import { Link } from 'wouter';
import { useListGenhalLanguages } from '@workspace/api-client-react';
import { Globe2, Search, Book, ChevronRight } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Reveal, stagger } from '@/components/reveal';

export default function LanguageCenter() {
  const {
    data: languages,
    isLoading,
    error,
    refetch,
  } = useListGenhalLanguages();
  const [search, setSearch] = useState('');

  const filteredLanguages = languages?.filter(
    (l) =>
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.country.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-stone-900 via-stone-800 to-amber-950 text-white p-8 md:p-12">
        <div className="pointer-events-none absolute -top-8 -right-8 h-40 w-40 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-10 right-16 h-32 w-32 rounded-full bg-white/5" />
        <div className="flex items-center gap-2 text-amber-400 text-sm font-medium mb-3">
          <Globe2 className="h-4 w-4" />
          Language Preservation
        </div>
        <h1 className="text-4xl md:text-5xl font-serif font-bold mb-3">Language Center</h1>
        <p className="text-white/80 text-base md:text-lg max-w-xl mb-5">
          A collaborative dictionary for indigenous African languages — explore dialects and keep ancestral words alive.
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { icon: <Book className="h-3.5 w-3.5" />, text: 'Community dictionary' },
            { icon: <Globe2 className="h-3.5 w-3.5" />, text: 'Pan-African coverage' },
            { icon: <ChevronRight className="h-3.5 w-3.5" />, text: 'Search by dialect' },
          ].map((p, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs bg-amber-50/10 border border-amber-300/30 text-amber-200 px-3 py-1.5 rounded-full font-medium">
              {p.icon}&nbsp;{p.text}
            </div>
          ))}
        </div>
      </div>
      <div className="relative w-full sm:w-96">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or country…"
          className="bg-card pl-9 rounded-full"
        />
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Supported languages
          {filteredLanguages && (
            <span className="ml-2 font-semibold normal-case tracking-normal text-muted-foreground/70">
              ({filteredLanguages.length})
            </span>
          )}
        </h3>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <ErrorState subject="languages" onRetry={() => refetch()} />
        ) : !filteredLanguages?.length ? (
          <EmptyState
            icon={<Globe2 className="h-5 w-5" />}
            title="No languages found"
            description={
              search
                ? `Nothing matches "${search}". Try a different name or country.`
                : 'No languages have been added yet.'
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredLanguages?.map((lang, i) => (
              <Reveal
                key={lang.code}
                animation="fade-up"
                delay={stagger(i)}
                className="h-full"
              >
                <Link
                  href={`/language/${lang.code}`}
                  className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <div className="group flex h-full flex-col rounded-xl border border-border bg-card shadow-card transition-shadow hover:shadow-card-hover" style={{ borderRadius: 'var(--theme-card-radius, 12px)' }}>
                    <div className="flex flex-1 items-start gap-3 p-5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-foreground dark:text-accent">
                        <Globe2 className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold text-foreground">
                          {lang.name}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {lang.nativeName}
                        </p>
                        <span className="mt-2 inline-block rounded-md bg-muted px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {lang.region}, {lang.country}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Book className="h-3.5 w-3.5" />
                        {lang.entryCount} entries
                      </span>
                      <span className="inline-flex items-center gap-1 font-medium text-primary">
                        Explore
                        <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
