import { Link } from 'wouter';
import { useListGenhalLanguages } from '@workspace/api-client-react';
import { Globe2, Search, Book, Mic, Loader2 } from 'lucide-react';

import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';

export default function LanguageCenter() {
  const { data: languages, isLoading } = useListGenhalLanguages();
  const [search, setSearch] = useState('');

  const filteredLanguages = languages?.filter(l => 
    l.name.toLowerCase().includes(search.toLowerCase()) || 
    l.country.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="bg-accent text-accent-foreground rounded-3xl p-8 md:p-12 relative overflow-hidden shadow-lg border border-accent/20">
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-1/4 translate-y-1/4">
          <Globe2 className="w-96 h-96" />
        </div>
        <div className="relative z-10 max-w-2xl space-y-6">
          <Badge variant="outline" className="border-accent-foreground/20 bg-accent-foreground/10 text-accent-foreground backdrop-blur font-bold uppercase tracking-wider">
            Language Center
          </Badge>
          <h1 className="text-4xl md:text-6xl font-serif font-bold">
            Preserve Every Word.
          </h1>
          <p className="text-lg md:text-xl font-medium opacity-90 max-w-xl">
            A collaborative dictionary for indigenous African languages. Explore dialects, hear pronunciations, and keep ancestral languages alive.
          </p>
          
          <div className="relative max-w-md mt-8">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-accent-foreground/50 h-5 w-5" />
            <Input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search languages by name or country..." 
              className="pl-12 h-14 rounded-full bg-white/20 border-white/30 text-accent-foreground placeholder:text-accent-foreground/60 backdrop-blur-md focus-visible:ring-white focus-visible:border-white shadow-inner text-lg"
            />
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-serif font-bold text-foreground">Supported Languages</h2>
        </div>

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Card key={i} className="animate-pulse border-none shadow-sm h-40 bg-muted/50"></Card>
            ))}
          </div>
        ) : filteredLanguages?.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-3xl border border-dashed">
            <Globe2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No languages found matching "{search}"</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredLanguages?.map((lang) => (
              <Link key={lang.code} href={`/language/${lang.code}`}>
                <Card className="h-full border-none shadow-sm hover:shadow-lg transition-all cursor-pointer group bg-card overflow-hidden hover:bg-accent/5 hover:ring-1 hover:ring-accent/30">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h3 className="text-2xl font-serif font-bold text-foreground group-hover:text-accent-foreground transition-colors flex items-center gap-2">
                          {lang.name}
                        </h3>
                        <p className="text-sm font-medium text-muted-foreground">{lang.nativeName}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <div className="inline-flex bg-muted text-muted-foreground text-xs font-semibold px-2 py-1 rounded-md uppercase tracking-wider">
                      {lang.region}, {lang.country}
                    </div>
                  </CardContent>
                  <CardFooter className="pt-3 border-t bg-muted/20 text-sm font-medium flex justify-between">
                    <span className="flex items-center gap-1 text-foreground/70"><Book className="h-4 w-4 text-accent" /> {lang.entryCount} Entries</span>
                    <span className="text-accent group-hover:translate-x-1 transition-transform">Explore →</span>
                  </CardFooter>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}