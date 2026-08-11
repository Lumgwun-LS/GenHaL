import { useState } from 'react';
import { useParams } from 'wouter';
import {
  useListGenhalLanguages,
  useListGenhalLanguageEntries,
  useCreateGenhalLanguageEntry,
} from '@workspace/api-client-react';
import { Search, Plus, Volume2, BookOpen, Loader2, Globe2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListGenhalLanguageEntriesQueryKey,
  getListGenhalLanguagesQueryKey,
} from '@workspace/api-client-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Reveal, stagger } from '@/components/reveal';

export default function Dictionary() {
  const params = useParams();
  const code = params.code || '';

  const { data: languages, isLoading: languagesLoading } =
    useListGenhalLanguages();
  const language = languages?.find((l) => l.code === code);

  const { data: entries, isLoading: entriesLoading } =
    useListGenhalLanguageEntries(code);
  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);

  const filteredEntries = entries?.filter(
    (e) =>
      e.word.toLowerCase().includes(search.toLowerCase()) ||
      e.translation.toLowerCase().includes(search.toLowerCase()),
  );

  if (languagesLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!language) {
    return (
      <EmptyState
        icon={<Globe2 className="h-5 w-5" />}
        title="Language not found"
        description="We couldn't find a language with that code in the archive."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/language"
        backLabel="Back to Language Center"
        eyebrow="Dictionary"
        title={`${language.name} Dictionary`}
        description={`${language.nativeName} • ${language.region}, ${language.country}`}
        actions={
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Add word
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
              <DialogHeader>
                <DialogTitle>Add a new word to {language.name}</DialogTitle>
              </DialogHeader>
              <AddEntryForm
                languageCode={code}
                onSuccess={() => setIsAddOpen(false)}
              />
            </DialogContent>
          </Dialog>
        }
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by word or translation…"
          className="h-11 bg-card pl-9"
        />
      </div>

      {entriesLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : filteredEntries?.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title="No entries found"
          description={
            search
              ? `Nothing matches "${search}". Contribute it to the dictionary.`
              : 'This dictionary is empty. Add the first word.'
          }
          action={
            <Button onClick={() => setIsAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add word
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredEntries?.map((entry, i) => (
            <Reveal
              key={entry.id}
              animation="fade-up"
              delay={stagger(i, 40)}
              className="rounded-xl border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-card-hover"
            >
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-xl font-bold tracking-tight text-foreground">
                        {entry.word}
                      </h4>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {entry.partOfSpeech}
                      </span>
                      {entry.audioUrl && (
                        <button
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-accent-foreground transition-colors hover:bg-accent/25 dark:text-accent"
                          title="Play pronunciation"
                          onClick={() => {
                            void new Audio(entry.audioUrl!)
                              .play()
                              .catch(() => {});
                          }}
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {entry.pronunciation && (
                      <p className="mt-1 font-mono text-sm tracking-wide text-muted-foreground">
                        /{entry.pronunciation}/
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-base font-semibold text-primary">
                      {entry.translation}
                    </p>
                    {entry.dialect && (
                      <p className="mt-1 text-xs font-medium text-muted-foreground">
                        Dialect: {entry.dialect}
                      </p>
                    )}
                  </div>
                </div>

                {(entry.example || entry.exampleTranslation) && (
                  <div className="rounded-lg border border-border bg-muted/40 p-4 md:w-1/2">
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Example
                    </p>
                    <p className="text-sm italic leading-relaxed text-foreground">
                      “{entry.example}”
                    </p>
                    {entry.exampleTranslation && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        — {entry.exampleTranslation}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}

function AddEntryForm({
  languageCode,
  onSuccess,
}: {
  languageCode: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createEntry = useCreateGenhalLanguageEntry();

  const [formData, setFormData] = useState({
    word: '',
    translation: '',
    pronunciation: '',
    partOfSpeech: 'noun',
    dialect: '',
    example: '',
    exampleTranslation: '',
    audioUrl: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.word || !formData.translation) return;

    // The language code travels as a path parameter, not in the body.
    createEntry.mutate(
      { code: languageCode, data: formData },
      {
        onSuccess: () => {
          toast({ title: 'Word added to dictionary' });
          queryClient.invalidateQueries({
            queryKey: getListGenhalLanguageEntriesQueryKey(languageCode),
          });
          queryClient.invalidateQueries({
            queryKey: getListGenhalLanguagesQueryKey(),
          });
          onSuccess();
        },
        onError: () => {
          toast({ variant: 'destructive', title: 'Error adding word' });
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="word">Word *</Label>
          <Input
            id="word"
            value={formData.word}
            onChange={(e) => setFormData({ ...formData, word: e.target.value })}
            required
            className="font-semibold"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="translation">Translation (English) *</Label>
          <Input
            id="translation"
            value={formData.translation}
            onChange={(e) =>
              setFormData({ ...formData, translation: e.target.value })
            }
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Part of speech</Label>
          <Select
            value={formData.partOfSpeech}
            onValueChange={(val) =>
              setFormData({ ...formData, partOfSpeech: val })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="noun">Noun</SelectItem>
              <SelectItem value="verb">Verb</SelectItem>
              <SelectItem value="adjective">Adjective</SelectItem>
              <SelectItem value="adverb">Adverb</SelectItem>
              <SelectItem value="pronoun">Pronoun</SelectItem>
              <SelectItem value="preposition">Preposition</SelectItem>
              <SelectItem value="conjunction">Conjunction</SelectItem>
              <SelectItem value="interjection">Interjection</SelectItem>
              <SelectItem value="phrase">Phrase</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pronunciation">Pronunciation (phonetic)</Label>
          <Input
            id="pronunciation"
            value={formData.pronunciation}
            onChange={(e) =>
              setFormData({ ...formData, pronunciation: e.target.value })
            }
            placeholder="e.g. o-bo-lo"
            className="font-mono"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="dialect">Dialect (optional)</Label>
        <Input
          id="dialect"
          value={formData.dialect}
          onChange={(e) =>
            setFormData({ ...formData, dialect: e.target.value })
          }
          placeholder="Specific region or dialect variant"
        />
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-muted/40 p-4">
        <div className="space-y-2">
          <Label htmlFor="example">
            Example sentence in {languageCode.toUpperCase()}
          </Label>
          <Textarea
            id="example"
            value={formData.example}
            onChange={(e) =>
              setFormData({ ...formData, example: e.target.value })
            }
            rows={2}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="exampleTranslation">
            Example translation (English)
          </Label>
          <Textarea
            id="exampleTranslation"
            value={formData.exampleTranslation}
            onChange={(e) =>
              setFormData({ ...formData, exampleTranslation: e.target.value })
            }
            rows={2}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="audioUrl">Audio pronunciation URL (optional)</Label>
        <Input
          id="audioUrl"
          type="url"
          value={formData.audioUrl}
          onChange={(e) =>
            setFormData({ ...formData, audioUrl: e.target.value })
          }
          placeholder="Link to audio file…"
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={
            createEntry.isPending || !formData.word || !formData.translation
          }
        >
          {createEntry.isPending && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          Add word
        </Button>
      </div>
    </form>
  );
}
