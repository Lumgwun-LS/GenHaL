import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Sparkles, Image as ImageIcon, CalendarClock, ShoppingBag, Link as LinkIcon, Copy, Check } from "lucide-react";
import { useCreatePost, useUpdatePost, useListProducts } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListPostsQueryKey } from "@workspace/api-client-react";
import { toast } from "sonner";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type LinkMode = "none" | "interest" | "checkout";

const PLATFORMS = [
  { id: 'facebook', label: 'Facebook', color: 'bg-blue-600' },
  { id: 'instagram', label: 'Instagram', color: 'bg-pink-600' },
  { id: 'twitter', label: 'Twitter/X', color: 'bg-zinc-900' },
  { id: 'linkedin', label: 'LinkedIn', color: 'bg-blue-700' },
  { id: 'tiktok', label: 'TikTok', color: 'bg-teal-600' }
];

export default function CreatePost() {
  const [caption, setCaption] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [linkMode, setLinkMode] = useState<LinkMode>("none");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [, setLocation] = useLocation();

  const { data: products } = useListProducts({ vendorId: 1 });
  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const queryClient = useQueryClient();

  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const toggleProduct = (id: number) => {
    setSelectedProductIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const handlePublish = async (status: 'published' | 'draft' | 'scheduled') => {
    if (!caption || selectedPlatforms.length === 0) {
      toast.error("Please enter a caption and select at least one platform");
      return;
    }
    if (selectedProductIds.length > 0 && linkMode === "none") {
      toast.error("Choose what customers can do with the shop link (express interest or check out)");
      return;
    }

    try {
      const post = await createPost.mutateAsync({
        data: {
          vendorId: 1, // hardcoded for demo, normally from context
          caption,
          platforms: selectedPlatforms,
          productIds: selectedProductIds,
          linkMode,
          // status would be passed here if the API supported it in creation, for now it assumes draft or published
        }
      });

      if (post.shareToken) {
        // Always append the shop link to the bottom of the caption once we know the token.
        const url = `${window.location.origin}${BASE_URL}/p/${post.shareToken}`;
        const cta = linkMode === "checkout" ? "🛍️ Shop this post" : "🛍️ Interested? Let us know";
        const finalCaption = `${caption}\n\n${cta}: ${url}`;
        await updatePost.mutateAsync({ id: post.id, data: { caption: finalCaption } });
        setShareUrl(url);
      }

      queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
      toast.success(`Post ${status === 'published' ? 'published' : 'saved'}`);
      if (!post.shareToken) setLocation("/social");
    } catch (e) {
      toast.error("Failed to save post");
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full h-full flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/social"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Compose Post</h1>
      </div>

      <div className="grid md:grid-cols-2 gap-8 h-full">
        {/* Editor Side */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Select Platforms</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className={`px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                      selectedPlatforms.includes(p.id) 
                        ? `${p.color} text-white border-transparent` 
                        : 'bg-transparent text-foreground hover:bg-muted'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Caption</CardTitle>
              <Button variant="outline" size="sm" className="h-8">
                <Sparkles className="w-3 h-3 mr-2 text-primary" />
                AI Writer
              </Button>
            </CardHeader>
            <CardContent>
              <Textarea 
                placeholder="What do you want to share?"
                className="min-h-[200px] resize-none text-base"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
              <div className="flex justify-between items-center mt-3 text-sm text-muted-foreground">
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="h-8 px-2"><ImageIcon className="w-4 h-4 mr-2" /> Media</Button>
                  <Button variant="ghost" size="sm" className="h-8 px-2"># Hashtags</Button>
                </div>
                <span>{caption.length} / 2200</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShoppingBag className="w-4 h-4" /> Shop this post</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Attach products and we'll add a shoppable link to the bottom of your post automatically.
              </p>

              {products && products.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {products.map((p) => (
                    <label
                      key={p.id}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer ${
                        selectedProductIds.includes(p.id) ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <Checkbox
                        checked={selectedProductIds.includes(p.id)}
                        onCheckedChange={() => toggleProduct(p.id)}
                      />
                      <span className="truncate">{p.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">${p.price.toFixed(2)}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No products yet — add some in Products first.</p>
              )}

              {selectedProductIds.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setLinkMode("interest")}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium ${
                      linkMode === "interest" ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-muted"
                    }`}
                  >
                    Let customers express interest
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinkMode("checkout")}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium ${
                      linkMode === "checkout" ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-muted"
                    }`}
                  >
                    Let customers buy now
                  </button>
                </div>
              )}

              {shareUrl && (
                <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <LinkIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{shareUrl}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={copyShareUrl}>
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => handlePublish('draft')}>Save Draft</Button>
            <Button variant="secondary" onClick={() => handlePublish('scheduled')}>
              <CalendarClock className="w-4 h-4 mr-2" />
              Schedule
            </Button>
            <Button onClick={() => handlePublish('published')}>Publish Now</Button>
          </div>
        </div>

        {/* Preview Side */}
        <div className="hidden md:block">
          <Card className="h-full bg-muted/30 border-dashed">
            <CardHeader>
              <CardTitle className="text-muted-foreground text-sm font-medium uppercase tracking-wider text-center">Live Preview</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center p-8">
              {caption || selectedPlatforms.length > 0 ? (
                <div className="w-full max-w-sm bg-card border rounded-xl overflow-hidden shadow-sm">
                  <div className="p-4 border-b flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20"></div>
                    <div>
                      <div className="font-bold text-sm">Awajimaa Connect Suite</div>
                      <div className="text-xs text-muted-foreground">Just now</div>
                    </div>
                  </div>
                  <div className="p-4 text-sm whitespace-pre-wrap">
                    {caption || <span className="text-muted-foreground italic">Your caption will appear here...</span>}
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>Start writing to see preview</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}