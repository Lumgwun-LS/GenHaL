import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Sparkles, Image as ImageIcon, CalendarClock } from "lucide-react";
import { useCreatePost } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListPostsQueryKey } from "@workspace/api-client-react";
import { toast } from "sonner";

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
  const [, setLocation] = useLocation();
  
  const createPost = useCreatePost();
  const queryClient = useQueryClient();

  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handlePublish = async (status: 'published' | 'draft' | 'scheduled') => {
    if (!caption || selectedPlatforms.length === 0) {
      toast.error("Please enter a caption and select at least one platform");
      return;
    }

    try {
      await createPost.mutateAsync({
        data: {
          vendorId: 1, // hardcoded for demo, normally from context
          caption,
          platforms: selectedPlatforms,
          // status would be passed here if the API supported it in creation, for now it assumes draft or published
        }
      });
      
      queryClient.invalidateQueries({ queryKey: getListPostsQueryKey() });
      toast.success(`Post ${status === 'published' ? 'published' : 'saved'}`);
      setLocation("/social");
    } catch (e) {
      toast.error("Failed to save post");
    }
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
                      <div className="font-bold text-sm">VendorHub Demo</div>
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