import { useState } from 'react';
import {
  useListGenhalAiGenerations,
  useGenerateGenhalStory,
  useTranslateGenhal,
  useCaptionGenhalImage,
} from '@workspace/api-client-react';
import {
  Sparkles,
  BookOpen,
  Globe2,
  ImageIcon,
  Loader2,
  Play,
  History,
  ArrowRight,
} from 'lucide-react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { getListGenhalAiGenerationsQueryKey } from '@workspace/api-client-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Reveal, stagger } from '@/components/reveal';

export default function AiStudio() {
  const {
    data: history,
    isLoading: historyLoading,
    error: historyError,
  } = useListGenhalAiGenerations();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI Studio"
        title="Intelligence rooted in African context"
        description="Generate ancestral stories, translate indigenous languages, and analyse historical photos."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Reveal animation="fade-up" className="lg:col-span-2">
          <Tabs defaultValue="story" className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-xl bg-muted p-1">
              <TabsTrigger
                value="story"
                className="rounded-lg py-2 text-xs font-semibold data-[state=active]:bg-card data-[state=active]:shadow-sm sm:text-sm"
              >
                <BookOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Story generator</span>
                <span className="sm:hidden">Story</span>
              </TabsTrigger>
              <TabsTrigger
                value="translate"
                className="rounded-lg py-2 text-xs font-semibold data-[state=active]:bg-card data-[state=active]:shadow-sm sm:text-sm"
              >
                <Globe2 className="h-4 w-4" />
                <span className="hidden sm:inline">Translator</span>
                <span className="sm:hidden">Translate</span>
              </TabsTrigger>
              <TabsTrigger
                value="image"
                className="rounded-lg py-2 text-xs font-semibold data-[state=active]:bg-card data-[state=active]:shadow-sm sm:text-sm"
              >
                <ImageIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Photo caption</span>
                <span className="sm:hidden">Photo</span>
              </TabsTrigger>
            </TabsList>

            <div className="mt-4 rounded-xl border border-border bg-card p-5 shadow-card">
              <TabsContent value="story" className="mt-0 outline-none">
                <StoryGenerator />
              </TabsContent>
              <TabsContent value="translate" className="mt-0 outline-none">
                <Translator />
              </TabsContent>
              <TabsContent value="image" className="mt-0 outline-none">
                <ImageCaptioner />
              </TabsContent>
            </div>
          </Tabs>
        </Reveal>

        {/* History */}
        <Reveal
          animation="fade-up"
          delay={stagger(1)}
          className="lg:col-span-1"
        >
          <div className="flex h-full flex-col rounded-xl border border-border bg-card shadow-card">
            <div className="flex items-center gap-2 border-b border-border px-5 py-4">
              <History className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Generation history
              </h3>
            </div>
            <div className="max-h-[620px] flex-1 space-y-3 overflow-y-auto p-4">
              {historyLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))
              ) : historyError ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Couldn't load history.
                </p>
              ) : !history?.length ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No generations yet.
                </p>
              ) : (
                history?.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/60"
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="rounded-md bg-card px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {item.type.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(item.createdAt), 'MMM d')}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm font-medium text-foreground">
                      {item.prompt}
                    </p>
                    <p className="mt-1.5 line-clamp-2 border-l-2 border-primary/30 pl-2 text-xs text-muted-foreground">
                      {item.result}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}

function ToolIntro({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/**
 * `storyType` is interpolated straight into the model prompt server-side
 * ("Write a compelling ${storyType} narrative…"), so these are phrased to read
 * naturally in that sentence rather than as enum slugs.
 */
const STORY_TONES: Array<{ value: string; label: string }> = [
  { value: 'epic and heroic', label: 'Epic & heroic' },
  { value: 'traditional folk tale', label: 'Traditional folk tale' },
  { value: 'historical documentary', label: 'Historical documentary' },
  { value: 'intimate family lore', label: 'Intimate family lore' },
];

function StoryGenerator() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const generateStory = useGenerateGenhalStory();

  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState(STORY_TONES[0].value);
  const [result, setResult] = useState('');

  const handleGenerate = () => {
    const trimmedTopic = topic.trim();
    if (!trimmedTopic) return;
    setResult('');

    generateStory.mutate(
      {
        data: {
          storyType: tone,
          // The server ignores `storyType` whenever `customPrompt` is set, so
          // the tone has to be carried in the prompt for it to have any effect.
          customPrompt: `Write a compelling ${tone} narrative about the following, using vivid, respectful storytelling that honours African oral traditions: ${trimmedTopic}`,
        },
      },
      {
        onSuccess: (data) => {
          setResult(data.result);
          queryClient.invalidateQueries({
            queryKey: getListGenhalAiGenerationsQueryKey(),
          });
        },
        onError: () =>
          toast({ variant: 'destructive', title: 'Generation failed' }),
      },
    );
  };

  return (
    <div className="space-y-5">
      <ToolIntro
        title="Ancestral storyteller"
        description="Provide facts, a family legend, or a historical event, and the AI will craft a culturally contextualised narrative."
      />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="topic">Topic or outline</Label>
          <Textarea
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. My great-grandfather Okonkwo, a famous wrestler in Umuofia in the 1920s…"
            rows={4}
            className="resize-none"
          />
        </div>

        <div className="space-y-2">
          <Label>Narrative tone</Label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STORY_TONES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={!topic.trim() || generateStory.isPending}
          size="lg"
          className="w-full"
        >
          {generateStory.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Generate story
        </Button>
      </div>

      {result && (
        <div className="space-y-3 border-t border-border pt-5">
          <h4 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Generated story
          </h4>
          <div className="rounded-lg border border-border bg-muted/40 p-5">
            <p className="whitespace-pre-line font-serif text-base leading-relaxed text-foreground/90">
              {result}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Translator() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const translate = useTranslateGenhal();

  const [text, setText] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('english');
  const [targetLanguage, setTargetLanguage] = useState('obolo');
  const [result, setResult] = useState('');

  const handleTranslate = () => {
    if (!text.trim()) return;
    setResult('');

    translate.mutate(
      { data: { text, sourceLanguage, targetLanguage } },
      {
        onSuccess: (data) => {
          setResult(data.result);
          queryClient.invalidateQueries({
            queryKey: getListGenhalAiGenerationsQueryKey(),
          });
        },
        onError: () =>
          toast({ variant: 'destructive', title: 'Translation failed' }),
      },
    );
  };

  return (
    <div className="space-y-5">
      <ToolIntro
        title="Contextual translator"
        description="Translate phrases while preserving cultural idioms and proverbs."
      />

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Select value={sourceLanguage} onValueChange={setSourceLanguage}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="english">English</SelectItem>
            <SelectItem value="french">French</SelectItem>
            <SelectItem value="obolo">Obolo</SelectItem>
            <SelectItem value="igbo">Igbo</SelectItem>
            <SelectItem value="yoruba">Yoruba</SelectItem>
            <SelectItem value="swahili">Swahili</SelectItem>
          </SelectContent>
        </Select>

        <ArrowRight className="h-4 w-4 text-muted-foreground" />

        <Select value={targetLanguage} onValueChange={setTargetLanguage}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="obolo">Obolo</SelectItem>
            <SelectItem value="igbo">Igbo</SelectItem>
            <SelectItem value="yoruba">Yoruba</SelectItem>
            <SelectItem value="swahili">Swahili</SelectItem>
            <SelectItem value="english">English</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter text to translate…"
          rows={5}
          className="resize-none"
        />

        <Button
          onClick={handleTranslate}
          disabled={!text.trim() || translate.isPending}
          size="lg"
          className="w-full"
        >
          {translate.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Globe2 className="h-4 w-4" />
          )}
          Translate
        </Button>
      </div>

      {result && (
        <div className="space-y-3 border-t border-border pt-5">
          <h4 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Translation
          </h4>
          <div className="rounded-lg border border-accent/30 bg-accent/10 p-5">
            <p className="text-lg font-semibold text-foreground">{result}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageCaptioner() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const captionImage = useCaptionGenhalImage();

  const [imageUrl, setImageUrl] = useState('');
  const [context, setContext] = useState('');
  const [result, setResult] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);

  const handleAnalyze = () => {
    if (!imageUrl) return;
    setResult('');

    captionImage.mutate(
      { data: { imageUrl, context } },
      {
        onSuccess: (data) => {
          setResult(data.result);
          queryClient.invalidateQueries({
            queryKey: getListGenhalAiGenerationsQueryKey(),
          });
        },
        onError: () =>
          toast({ variant: 'destructive', title: 'Analysis failed' }),
      },
    );
  };

  return (
    <div className="space-y-5">
      <ToolIntro
        title="Historical photo analysis"
        description="Link an old family or community photo. The AI reads attire and context, then writes a descriptive archival caption."
      />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="imageUrl">Image URL</Label>
          <Input
            id="imageUrl"
            type="url"
            value={imageUrl}
            onChange={(e) => {
              setImageUrl(e.target.value);
              setPreviewFailed(false);
            }}
            placeholder="https://…"
          />
        </div>

        {imageUrl && !previewFailed && (
          <div className="h-48 overflow-hidden rounded-lg border border-border bg-muted">
            <img
              src={imageUrl}
              alt="Preview"
              className="h-full w-full object-cover"
              onError={() => setPreviewFailed(true)}
            />
          </div>
        )}

        {imageUrl && previewFailed && (
          <EmptyState
            className="py-8"
            icon={<ImageIcon className="h-5 w-5" />}
            title="Preview unavailable"
            description="That URL didn't load an image, but you can still try the analysis."
          />
        )}

        <div className="space-y-2">
          <Label htmlFor="context">Known context (optional)</Label>
          <Input
            id="context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="e.g. Taken in Lagos, 1960. Wedding ceremony."
          />
        </div>

        <Button
          onClick={handleAnalyze}
          disabled={!imageUrl || captionImage.isPending}
          size="lg"
          className="w-full"
        >
          {captionImage.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Analyse photo
        </Button>
      </div>

      {result && (
        <div className="space-y-3 border-t border-border pt-5">
          <h4 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Archival analysis
          </h4>
          <div className="rounded-lg border border-border border-l-2 border-l-secondary bg-secondary/5 p-5">
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
              {result}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
