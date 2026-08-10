import { useState } from 'react';
import { Link } from 'wouter';
import { useListGenhalLanguages } from '@workspace/api-client-react';
import { Globe2, Search, Book, ChevronRight } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Reveal, stagger } from '@/components/reveal';

export default function LanguageCenter() {
  const { data: languages, isLoading } = useListGenhalLanguages();
  const [search, setSearch] = useState('');

  const filteredLanguages = languages?.filter(
    (l) =>
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.country.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Language Center"
        description="A collaborative dictionary for indigenous African languages — explore dialects and keep ancestral words alive."
        actions={
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or country…"
              className="bg-card pl-9"
            />
          </div>
        }
      />

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
        ) : filteredLanguages?.length === 0 ? (
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
                <Link href={`/language/${lang.code}`} className="block h-full">
                  <div className="group flex h-full flex-col rounded-xl border border-border bg-card shadow-card transition-shadow hover:shadow-card-hover">
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
