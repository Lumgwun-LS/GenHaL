import { useState } from 'react';
import { 
  useListGenhalAiGenerations, 
  useGenerateGenhalStory, 
  useTranslateGenhal, 
  useCaptionGenhalImage 
} from '@workspace/api-client-react';
import { Sparkles, BookOpen, Globe2, ImageIcon, Loader2, Play, History, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { getListGenhalAiGenerationsQueryKey } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';

export default function AiStudio() {
  const { data: history, isLoading: historyLoading } = useListGenhalAiGenerations();
  
  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 max-w-6xl mx-auto">
      <div className="bg-[#1a1625] text-white rounded-3xl p-8 md:p-12 relative overflow-hidden shadow-2xl border border-purple-500/20">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4"></div>
        
        <div className="relative z-10">
          <Badge className="bg-purple-500/20 text-purple-200 border-purple-500/30 hover:bg-purple-500/30 backdrop-blur mb-6">
            <Sparkles className="h-3 w-3 mr-1" /> GenHaL AI Studio
          </Badge>
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4">
            Intelligence Rooted in <br/> African Context.
          </h1>
          <p className="text-lg text-white/70 max-w-xl font-medium">
            Powerful tools designed specifically for African heritage. Generate ancestral stories, translate indigenous languages, and analyze historical photos.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Tabs defaultValue="story" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-14 bg-muted/50 p-1 rounded-2xl">
              <TabsTrigger value="story" className="rounded-xl text-sm font-bold data-[state=active]:bg-card data-[state=active]:shadow-sm">
                <BookOpen className="h-4 w-4 mr-2" /> Story Generator
              </TabsTrigger>
              <TabsTrigger value="translate" className="rounded-xl text-sm font-bold data-[state=active]:bg-card data-[state=active]:shadow-sm">
                <Globe2 className="h-4 w-4 mr-2" /> Translator
              </TabsTrigger>
              <TabsTrigger value="image" className="rounded-xl text-sm font-bold data-[state=active]:bg-card data-[state=active]:shadow-sm">
                <ImageIcon className="h-4 w-4 mr-2" /> Photo Caption
              </TabsTrigger>
            </TabsList>

            <div className="mt-6 bg-card border rounded-3xl p-6 shadow-sm">
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
        </div>

        {/* History Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-card rounded-3xl border shadow-sm h-full flex flex-col">
            <div className="p-6 border-b flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-serif font-bold text-lg">Generation History</h3>
            </div>
            <div className="flex-1 p-6 overflow-y-auto max-h-[600px] space-y-4">
              {historyLoading ? (
                Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-muted/50 rounded-xl animate-pulse"></div>)
              ) : history?.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <p>No generations yet.</p>
                </div>
              ) : (
                history?.map((item) => (
                  <div key={item.id} className="p-4 rounded-xl border bg-muted/20 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-bold">
                        {item.type.replace('_', ' ')}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{format(new Date(item.createdAt), 'MMM d')}</span>
                    </div>
                    <p className="text-sm font-medium line-clamp-2 mb-2">"{item.prompt}"</p>
                    <p className="text-xs text-muted-foreground line-clamp-2 border-l-2 border-primary/30 pl-2">{item.result}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StoryGenerator() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const generateStory = useGenerateGenhalStory();
  
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('epic');
  const [result, setResult] = useState('');

  const handleGenerate = () => {
    if (!topic) return;
    setResult('');
    
    generateStory.mutate({ data: { storyType: tone, customPrompt: topic } }, {
      onSuccess: (data) => {
        setResult(data.result);
        queryClient.invalidateQueries({ queryKey: getListGenhalAiGenerationsQueryKey() });
      },
      onError: () => toast({ variant: "destructive", title: "Generation failed" })
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-serif font-bold text-primary">Ancestral Storyteller</h2>
        <p className="text-muted-foreground">Provide facts, a family legend, or a historical event, and the AI will craft a rich, culturally contextualized narrative.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Topic or Outline</Label>
          <Textarea 
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. My great-grandfather Okonkwo who was a famous wrestler in Umuofia in the 1920s..."
            rows={4}
            className="resize-none"
          />
        </div>
        
        <div className="space-y-2">
          <Label>Narrative Tone</Label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="epic">Epic & Heroic</SelectItem>
              <SelectItem value="folk_tale">Traditional Folk Tale</SelectItem>
              <SelectItem value="historical_documentary">Historical Documentary</SelectItem>
              <SelectItem value="intimate">Intimate Family Lore</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button 
          onClick={handleGenerate} 
          disabled={!topic || generateStory.isPending}
          className="w-full bg-primary hover:bg-primary/90 text-white rounded-xl h-12 text-lg"
        >
          {generateStory.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Play className="h-5 w-5 mr-2" />}
          Generate Story
        </Button>
      </div>

      {result && (
        <div className="mt-8 pt-6 border-t animate-in slide-in-from-bottom-4">
          <h3 className="font-serif font-bold text-xl mb-4">Generated Story</h3>
          <div className="bg-[#fffdf5] dark:bg-[#1a1814] p-6 md:p-8 rounded-2xl border shadow-inner">
            <p className="font-serif text-lg leading-relaxed whitespace-pre-line text-foreground/90">
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
  const [sourceLang, setSourceLang] = useState('english');
  const [targetLang, setTargetLang] = useState('obolo');
  const [result, setResult] = useState('');

  const handleTranslate = () => {
    if (!text) return;
    setResult('');
    
    translate.mutate({ data: { text, sourceLanguage: sourceLang, targetLanguage: targetLang } }, {
      onSuccess: (data) => {
        setResult(data.result);
        queryClient.invalidateQueries({ queryKey: getListGenhalAiGenerationsQueryKey() });
      },
      onError: () => toast({ variant: "destructive", title: "Translation failed" })
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-serif font-bold text-accent-foreground">Contextual Translator</h2>
        <p className="text-muted-foreground">Translate phrases preserving cultural idioms and proverbs.</p>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
        <Select value={sourceLang} onValueChange={setSourceLang}>
          <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="english">English</SelectItem>
            <SelectItem value="french">French</SelectItem>
            <SelectItem value="obolo">Obolo</SelectItem>
            <SelectItem value="igbo">Igbo</SelectItem>
            <SelectItem value="yoruba">Yoruba</SelectItem>
            <SelectItem value="swahili">Swahili</SelectItem>
          </SelectContent>
        </Select>
        
        <ArrowRight className="h-5 w-5 text-muted-foreground" />
        
        <Select value={targetLang} onValueChange={setTargetLang}>
          <SelectTrigger className="bg-muted/50"><SelectValue /></SelectTrigger>
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
          placeholder="Enter text to translate..."
          rows={5}
          className="resize-none text-lg"
        />

        <Button 
          onClick={handleTranslate} 
          disabled={!text || translate.isPending}
          className="w-full bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl h-12 text-lg"
        >
          {translate.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Globe2 className="h-5 w-5 mr-2" />}
          Translate
        </Button>
      </div>

      {result && (
        <div className="mt-8 pt-6 border-t animate-in slide-in-from-bottom-4">
          <Label className="text-muted-foreground uppercase tracking-wider text-xs font-bold mb-2 block">Translation</Label>
          <div className="bg-accent/10 border border-accent/20 p-6 rounded-2xl">
            <p className="font-serif text-2xl font-bold text-accent-foreground">
              {result}
            </p>
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

  const handleAnalyze = () => {
    if (!imageUrl) return;
    setResult('');
    
    captionImage.mutate({ data: { imageUrl, context } }, {
      onSuccess: (data) => {
        setResult(data.result);
        queryClient.invalidateQueries({ queryKey: getListGenhalAiGenerationsQueryKey() });
      },
      onError: () => toast({ variant: "destructive", title: "Analysis failed" })
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-serif font-bold text-secondary">Historical Photo Analysis</h2>
        <p className="text-muted-foreground">Upload a URL of an old family or community photo. The AI will analyze attire, context, and generate a descriptive archival caption.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Image URL</Label>
          <Input 
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
            className="h-12"
          />
        </div>

        {imageUrl && (
          <div className="h-48 rounded-xl bg-muted overflow-hidden border">
            <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
          </div>
        )}
        
        <div className="space-y-2">
          <Label>Known Context (Optional)</Label>
          <Input 
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="e.g. Taken in Lagos, 1960. Wedding ceremony."
          />
        </div>

        <Button 
          onClick={handleAnalyze} 
          disabled={!imageUrl || captionImage.isPending}
          className="w-full bg-secondary hover:bg-secondary/90 text-white rounded-xl h-12 text-lg"
        >
          {captionImage.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Sparkles className="h-5 w-5 mr-2" />}
          Analyze Photo
        </Button>
      </div>

      {result && (
        <div className="mt-8 pt-6 border-t animate-in slide-in-from-bottom-4">
          <h3 className="font-serif font-bold text-xl mb-4">Archival Analysis</h3>
          <div className="bg-secondary/5 border-l-4 border-secondary p-6 rounded-r-2xl">
            <p className="text-foreground leading-relaxed whitespace-pre-line">
              {result}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}