import { useState } from 'react';
import { useParams, Link } from 'wouter';
import { useGetGenhalCommunity, useListGenhalCommunityPosts, useCreateGenhalHeritagePost } from '@workspace/api-client-react';
import { ArrowLeft, Plus, MapPin, Users, Loader2, Image as ImageIcon, Music, Type } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { getListGenhalCommunityPostsQueryKey, getGetGenhalCommunityQueryKey } from '@workspace/api-client-react';

export default function CommunityDetail() {
  const params = useParams();
  const communityId = Number(params.id);
  
  const { data: community, isLoading: communityLoading } = useGetGenhalCommunity(communityId);
  const { data: posts, isLoading: postsLoading } = useListGenhalCommunityPosts(communityId);
  
  const [isPostOpen, setIsPostOpen] = useState(false);

  if (communityLoading || postsLoading) {
    return <div className="p-20 flex justify-center"><Loader2 className="h-10 w-10 animate-spin text-secondary" /></div>;
  }

  if (!community) {
    return <div>Community not found</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-card border shadow-sm">
        <div className="h-48 md:h-64 bg-secondary/20 relative">
          {community.coverImageUrl && (
            <img src={community.coverImageUrl} alt={community.name} className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
          <div className="absolute top-4 left-4">
            <Link href="/heritage">
              <Button variant="outline" size="icon" className="rounded-full bg-white/10 backdrop-blur border-white/20 text-white hover:bg-white/20">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
          </div>
          <div className="absolute bottom-6 left-6 md:left-8 right-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="text-white">
                <div className="flex items-center gap-2 text-sm font-medium mb-2 opacity-90">
                  <MapPin className="h-4 w-4" />
                  {community.ethnicGroup}, {community.country}
                </div>
                <h1 className="text-3xl md:text-5xl font-serif font-bold leading-tight">{community.name}</h1>
              </div>
              <Dialog open={isPostOpen} onOpenChange={setIsPostOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-secondary hover:bg-secondary/90 text-white rounded-full shrink-0 shadow-lg">
                    <Plus className="mr-2 h-4 w-4" />
                    Share Story
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[600px]">
                  <DialogHeader>
                    <DialogTitle className="font-serif text-2xl text-secondary">Share with {community.name}</DialogTitle>
                  </DialogHeader>
                  <CreatePostForm communityId={communityId} onSuccess={() => setIsPostOpen(false)} />
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
        <div className="p-6 md:p-8 bg-card flex flex-col md:flex-row gap-8">
          <div className="md:w-2/3">
            <h3 className="text-lg font-bold mb-2">About</h3>
            <p className="text-muted-foreground whitespace-pre-line leading-relaxed">{community.description}</p>
          </div>
          <div className="md:w-1/3 bg-muted/30 rounded-2xl p-6 border">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-medium">Members</span>
                <span className="font-bold flex items-center gap-1"><Users className="h-4 w-4 text-secondary" /> {community.memberCount || 1}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-medium">Stories & Posts</span>
                <span className="font-bold flex items-center gap-1"><Type className="h-4 w-4 text-secondary" /> {community.postCount || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground font-medium">Founded</span>
                <span className="font-bold">{format(new Date(community.createdAt), 'MMM yyyy')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Posts Feed */}
      <div className="space-y-6 max-w-3xl mx-auto">
        <h2 className="text-2xl font-serif font-bold text-center mb-8">Community Stories & Archives</h2>
        
        {posts?.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-2xl border border-dashed">
            <Type className="h-10 w-10 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No posts yet.</p>
            <p className="text-muted-foreground mb-6">Contribute the first story, photo, or oral history.</p>
            <Button variant="outline" onClick={() => setIsPostOpen(true)} className="rounded-full">Share a Story</Button>
          </div>
        ) : (
          <div className="space-y-8">
            {posts?.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PostCard({ post }: { post: any }) {
  const getIcon = () => {
    switch(post.type) {
      case 'story': return <Type className="h-5 w-5 text-blue-500" />;
      case 'photo': return <ImageIcon className="h-5 w-5 text-green-500" />;
      case 'oral_history': return <Music className="h-5 w-5 text-purple-500" />;
      default: return <Type className="h-5 w-5 text-secondary" />;
    }
  };

  return (
    <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-secondary/10 flex items-center justify-center">
              {getIcon()}
            </div>
            <div>
              <p className="font-bold text-sm text-foreground">{post.authorName || 'Community Member'}</p>
              <p className="text-xs text-muted-foreground">{format(new Date(post.createdAt), 'MMMM d, yyyy')}</p>
            </div>
          </div>
          <Badge variant="secondary" className="capitalize bg-secondary/10 text-secondary">{post.type.replace('_', ' ')}</Badge>
        </div>
        
        <h3 className="text-xl font-serif font-bold mb-3">{post.title}</h3>
        <p className="text-foreground/90 whitespace-pre-line leading-relaxed mb-4">{post.body}</p>
        
        {post.mediaUrl && (
          <div className="mt-4 rounded-xl overflow-hidden bg-muted">
            <img src={post.mediaUrl} alt={post.title} className="w-full max-h-96 object-contain" />
          </div>
        )}
        
        {post.audioUrl && (
          <div className="mt-4 p-4 bg-muted rounded-xl flex items-center gap-4">
            <Music className="h-6 w-6 text-secondary" />
            <audio controls className="w-full h-10">
              <source src={post.audioUrl} type="audio/mpeg" />
              Your browser does not support the audio element.
            </audio>
          </div>
        )}

        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t">
            {post.tags.map((tag: string, i: number) => (
              <span key={i} className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CreatePostForm({ communityId, onSuccess }: { communityId: number, onSuccess: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createPost = useCreateGenhalHeritagePost();
  
  const [formData, setFormData] = useState({
    communityId,
    title: '',
    body: '',
    type: 'story',
    mediaUrl: '',
    audioUrl: '',
    tags: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.body) return;
    
    const payload = {
      ...formData,
      tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : []
    };
    
    createPost.mutate({ id: communityId, data: { title: payload.title, body: payload.body, type: payload.type, mediaUrl: payload.mediaUrl || undefined, audioUrl: payload.audioUrl || undefined, tags: payload.tags } }, {
      onSuccess: () => {
        toast({ title: "Post published successfully" });
        queryClient.invalidateQueries({ queryKey: getListGenhalCommunityPostsQueryKey(communityId) });
        queryClient.invalidateQueries({ queryKey: getGetGenhalCommunityQueryKey(communityId) });
        onSuccess();
      },
      onError: () => {
        toast({ variant: "destructive", title: "Failed to publish post" });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="grid grid-cols-3 gap-4 mb-2">
        {['story', 'photo', 'oral_history'].map((type) => (
          <div 
            key={type}
            onClick={() => setFormData({...formData, type})}
            className={`cursor-pointer rounded-xl border p-3 text-center transition-colors ${formData.type === type ? 'bg-secondary/10 border-secondary text-secondary' : 'bg-card text-muted-foreground hover:bg-muted'}`}
          >
            <div className="mx-auto mb-2 flex justify-center">
              {type === 'story' && <Type className="h-5 w-5" />}
              {type === 'photo' && <ImageIcon className="h-5 w-5" />}
              {type === 'oral_history' && <Music className="h-5 w-5" />}
            </div>
            <span className="text-xs font-bold uppercase tracking-wider">{type.replace('_', ' ')}</span>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input 
          id="title" 
          value={formData.title}
          onChange={(e) => setFormData({...formData, title: e.target.value})}
          placeholder="e.g., The founding of our village"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="body">Story Content</Label>
        <Textarea 
          id="body" 
          value={formData.body}
          onChange={(e) => setFormData({...formData, body: e.target.value})}
          placeholder="Share the details..."
          rows={6}
          required
        />
      </div>

      {formData.type === 'photo' && (
        <div className="space-y-2">
          <Label htmlFor="mediaUrl">Image URL</Label>
          <Input 
            id="mediaUrl" 
            type="url"
            value={formData.mediaUrl}
            onChange={(e) => setFormData({...formData, mediaUrl: e.target.value})}
            placeholder="https://..."
            required={formData.type === 'photo'}
          />
        </div>
      )}

      {formData.type === 'oral_history' && (
        <div className="space-y-2">
          <Label htmlFor="audioUrl">Audio Recording URL</Label>
          <Input 
            id="audioUrl" 
            type="url"
            value={formData.audioUrl}
            onChange={(e) => setFormData({...formData, audioUrl: e.target.value})}
            placeholder="Link to audio file (mp3, wav)..."
            required={formData.type === 'oral_history'}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="tags">Tags (comma separated)</Label>
        <Input 
          id="tags" 
          value={formData.tags}
          onChange={(e) => setFormData({...formData, tags: e.target.value})}
          placeholder="tradition, festival, elders"
        />
      </div>

      <div className="pt-4 flex justify-end">
        <Button type="submit" disabled={createPost.isPending || !formData.title || !formData.body} className="bg-secondary rounded-full px-8 text-white">
          {createPost.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Publish
        </Button>
      </div>
    </form>
  );
}