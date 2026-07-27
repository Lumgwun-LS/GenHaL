import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookOpen,
  GraduationCap,
  ImageIcon,
  Video,
  Sparkles,
  Loader2,
  Download,
  Copy,
  Check,
  ExternalLink,
  Search,
  Clock,
  FileText,
} from "lucide-react";
import {
  useGenerateAiContent,
  useListContentLibrary,
  useListVendors,
  getListContentLibraryQueryKey,
  type GenerateAiContentResult,
  type ContentLibraryItem,
} from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// ─── config ──────────────────────────────────────────────────────────────────

const OUTPUT_TYPES = [
  {
    id: "social_post",
    label: "Social Post",
    icon: FileText,
    color: "text-blue-500",
    desc: "Platform-optimised caption with hashtags",
  },
  {
    id: "article",
    label: "Article / Long-form",
    icon: BookOpen,
    color: "text-emerald-500",
    desc: "500–1500 word structured write-up",
  },
  {
    id: "academic",
    label: "Academic Paper",
    icon: GraduationCap,
    color: "text-violet-500",
    desc: "Formal tone with abstract, sections & references",
  },
  {
    id: "image",
    label: "Image",
    icon: ImageIcon,
    color: "text-amber-500",
    desc: "AI-generated illustration or product visual",
  },
  {
    id: "video",
    label: "Video (Scenes)",
    icon: Video,
    color: "text-rose-500",
    desc: "Multi-scene preview — render in the composer",
  },
] as const;

type OutputTypeId = (typeof OUTPUT_TYPES)[number]["id"];

const TONES = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "educational", label: "Educational" },
  { value: "promotional", label: "Promotional" },
] as const;

const LANGUAGES = [
  { value: "english", label: "English" },
  { value: "hausa", label: "Hausa" },
  { value: "yoruba", label: "Yoruba" },
  { value: "igbo", label: "Igbo" },
] as const;

// ─── result card ─────────────────────────────────────────────────────────────

function ResultCard({
  typeId,
  label,
  icon: Icon,
  color,
  result,
  onUseInPost,
}: {
  typeId: string;
  label: string;
  icon: React.ElementType;
  color: string;
  result: NonNullable<GenerateAiContentResult[keyof GenerateAiContentResult]>;
  onUseInPost: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isLong = (result.wordCount ?? 0) > 80;

  const handleCopy = () => {
    if (!result.content) return;
    navigator.clipboard.writeText(result.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!result.content) return;
    const blob = new Blob([result.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${typeId}-content.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const borderColor =
    result.status === "failed" ? "border-l-destructive" : "border-l-primary";

  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Icon className={`w-4 h-4 ${color} shrink-0`} />
            <span className="font-medium text-sm">{label}</span>
            {result.status === "failed" && (
              <Badge variant="destructive" className="text-xs">Failed</Badge>
            )}
            {result.wordCount != null && (
              <Badge variant="secondary" className="text-xs">
                {result.wordCount.toLocaleString()} words
              </Badge>
            )}
            {result.videoScenes != null && (
              <Badge variant="secondary" className="text-xs">
                {result.videoScenes.length} scenes
              </Badge>
            )}
            {result.libraryId != null && (
              <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">
                Saved to Library
              </Badge>
            )}
          </div>

          {result.status === "completed" && (
            <div className="flex gap-1.5 shrink-0">
              {result.content && (
                <>
                  <Button size="sm" variant="ghost" onClick={handleCopy} title="Copy">
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleDownload} title="Download">
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}
              {result.imageUrl && (
                <Button size="sm" variant="ghost" asChild title="Open image">
                  <a href={result.imageUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </Button>
              )}
              <Button size="sm" onClick={onUseInPost}>
                Use in Post
              </Button>
            </div>
          )}
        </div>

        {result.status === "failed" && (
          <p className="text-sm text-destructive mt-3">{result.error}</p>
        )}

        {result.content && (
          <div className="mt-3">
            <p
              className={`text-sm text-foreground whitespace-pre-wrap leading-relaxed ${
                !expanded && isLong ? "line-clamp-6" : ""
              }`}
            >
              {result.content}
            </p>
            {isLong && (
              <button
                className="text-xs text-primary mt-1.5 hover:underline"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "Show less" : "Expand full text"}
              </button>
            )}
          </div>
        )}

        {result.imageUrl && (
          <div className="mt-3 rounded-lg overflow-hidden border aspect-video max-w-sm">
            <img
              src={result.imageUrl}
              alt="AI-generated"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {result.videoScenes && result.videoScenes.length > 0 && (
          <div className="mt-3 flex gap-2 flex-wrap">
            {result.videoScenes.map((scene, i) => (
              <div
                key={scene.id}
                className="relative rounded-md overflow-hidden border aspect-video w-32"
              >
                <img
                  src={scene.imageUrl}
                  alt={`Scene ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1 rounded">
                  Scene {i + 1}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── library item card ────────────────────────────────────────────────────────

function LibraryCard({
  item,
  onUse,
}: {
  item: ContentLibraryItem;
  onUse: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const conf = OUTPUT_TYPES.find((t) => t.id === item.type);
  const Icon = conf?.icon ?? FileText;
  const color = conf?.color ?? "text-muted-foreground";

  const handleCopy = () => {
    navigator.clipboard.writeText(item.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${color} shrink-0`} />
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {conf?.label ?? item.type}
              </span>
              <span className="text-xs text-muted-foreground ml-auto flex items-center gap-0.5">
                <Clock className="w-3 h-3" />
                {new Date(item.createdAt).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm font-medium mb-1 truncate">{item.topic}</p>
            {item.imageUrl ? (
              <div className="rounded-md overflow-hidden border aspect-video max-w-[120px] mt-2">
                <img
                  src={item.imageUrl}
                  alt={item.topic}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {item.content}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <Button size="sm" variant="outline" onClick={handleCopy} title="Copy">
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </Button>
            <Button size="sm" onClick={onUse}>
              Use
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function ContentStudio() {
  const { user } = useUser();
  const { data: vendors } = useListVendors();
  const vendorId = vendors?.find((v) => v.clerkUserId === user?.id)?.id ?? vendors?.[0]?.id ?? 1;
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  // Studio state
  const [topic, setTopic] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<OutputTypeId[]>(["social_post"]);
  const [tone, setTone] = useState<"professional" | "casual" | "educational" | "promotional">("professional");
  const [language, setLanguage] = useState<"english" | "hausa" | "yoruba" | "igbo">("english");
  const [results, setResults] = useState<GenerateAiContentResult | null>(null);

  // Library state
  const [studioTab, setStudioTab] = useState<"studio" | "library">("studio");
  const [search, setSearch] = useState("");

  const generateMutation = useGenerateAiContent();
  const { data: library, isLoading: libraryLoading } = useListContentLibrary(
    { vendorId },
    {
      query: {
        enabled: studioTab === "library",
        queryKey: getListContentLibraryQueryKey({ vendorId }),
      },
    },
  );

  const toggleType = (id: OutputTypeId) => {
    setSelectedTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  };

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error("Enter a topic or brief first");
      return;
    }
    if (selectedTypes.length === 0) {
      toast.error("Select at least one output type");
      return;
    }
    try {
      const res = await generateMutation.mutateAsync({
        data: {
          vendorId,
          topic,
          outputTypes: selectedTypes as ('social_post' | 'article' | 'academic' | 'image' | 'video')[],
          tone,
          language,
        },
      });
      setResults(res);
      // Refresh library if it's been loaded
      queryClient.invalidateQueries({ queryKey: getListContentLibraryQueryKey({ vendorId }) });
      const succeeded = selectedTypes.filter(
        (t) => (res as Record<string, { status: string }>)[t]?.status === "completed",
      ).length;
      toast.success(
        `Generated ${succeeded} of ${selectedTypes.length} content type${selectedTypes.length !== 1 ? "s" : ""}`,
      );
    } catch (err: unknown) {
      const errData = (err as { data?: { error?: string } })?.data;
      toast.error(errData?.error ?? "Generation failed — please try again");
    }
  };

  const navigateToCompose = (prefill: {
    caption?: string;
    imageUrl?: string;
    videoScenes?: { id: number; prompt: string; imageUrl: string }[];
  }) => {
    sessionStorage.setItem("vendorhub:studio-prefill", JSON.stringify(prefill));
    navigate("/social/create");
  };

  const handleUseResultInPost = (typeId: string) => {
    if (!results) return;
    const r = (results as Record<string, { content?: string | null; imageUrl?: string | null; videoScenes?: { id: number; prompt: string; imageUrl: string }[] | null }>)[typeId];
    if (!r) return;
    if (typeId === "image") navigateToCompose({ imageUrl: r.imageUrl ?? undefined });
    else if (typeId === "video") navigateToCompose({ videoScenes: r.videoScenes ?? undefined });
    else navigateToCompose({ caption: r.content ?? undefined });
  };

  const handleUseLibraryItem = (item: ContentLibraryItem) => {
    if (item.type === "image") navigateToCompose({ imageUrl: item.imageUrl ?? item.content });
    else navigateToCompose({ caption: item.content });
  };

  const filteredLibrary = (library ?? []).filter(
    (item) =>
      !search ||
      item.topic.toLowerCase().includes(search.toLowerCase()) ||
      item.content.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <Tabs value={studioTab} onValueChange={(v) => setStudioTab(v as "studio" | "library")}>
        <TabsList>
          <TabsTrigger value="studio">
            <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Studio
          </TabsTrigger>
          <TabsTrigger value="library">
            <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Library
          </TabsTrigger>
        </TabsList>

        {/* ── STUDIO TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="studio" className="mt-6 space-y-6">
          {/* Topic */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">What do you want to create content about?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Benefits of locally sourced products for Nigerian businesses"
                className="min-h-[80px] resize-none"
                maxLength={1000}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Be specific — a clear topic produces better content across all types</span>
                <span>{topic.length}/1000</span>
              </div>
            </CardContent>
          </Card>

          {/* Output types */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Select output types</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {OUTPUT_TYPES.map(({ id, label, icon: Icon, color, desc }) => (
                  <label
                    key={id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors select-none ${
                      selectedTypes.includes(id as OutputTypeId)
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <Checkbox
                      checked={selectedTypes.includes(id as OutputTypeId)}
                      onCheckedChange={() => toggleType(id as OutputTypeId)}
                      className="mt-0.5 shrink-0"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Icon className={`w-4 h-4 ${color}`} />
                        <span className="text-sm font-medium">{label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tone + Language */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tone</Label>
              <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                Language{" "}
                <span className="text-muted-foreground font-normal text-xs">(caption & long-form)</span>
              </Label>
              <Select value={language} onValueChange={(v) => setLanguage(v as typeof language)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Generate */}
          <Button
            size="lg"
            className="w-full"
            onClick={handleGenerate}
            disabled={generateMutation.isPending || selectedTypes.length === 0 || !topic.trim()}
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating {selectedTypes.length} type
                {selectedTypes.length !== 1 ? "s" : ""} in parallel…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate
              </>
            )}
          </Button>

          {/* Results */}
          {results && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Generated Content
              </h3>
              {OUTPUT_TYPES.filter(({ id }) => {
                const r = (results as Record<string, unknown>)[id];
                return r != null;
              }).map(({ id, label, icon, color }) => {
                const r = (results as Record<string, NonNullable<GenerateAiContentResult[keyof GenerateAiContentResult]>>)[id];
                return (
                  <ResultCard
                    key={id}
                    typeId={id}
                    label={label}
                    icon={icon}
                    color={color}
                    result={r}
                    onUseInPost={() => handleUseResultInPost(id)}
                  />
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── LIBRARY TAB ────────────────────────────────────────────────── */}
        <TabsContent value="library" className="mt-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search library…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {libraryLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              Loading library…
            </div>
          ) : filteredLibrary.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl">
              {search
                ? "No items match your search"
                : "Your content library is empty — generate some content first"}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredLibrary.map((item) => (
                <LibraryCard
                  key={item.id}
                  item={item}
                  onUse={() => handleUseLibraryItem(item)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
