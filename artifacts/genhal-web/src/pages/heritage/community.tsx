import { useState } from 'react';
import { useParams } from 'wouter';
import {
  useGetGenhalCommunity,
  useListGenhalCommunityPosts,
  useCreateGenhalHeritagePost,
} from '@workspace/api-client-react';
import {
  Plus,
  MapPin,
  Users,
  Loader2,
  Image as ImageIcon,
  Music,
  Type,
  BookOpen,
  CalendarDays,
} from 'lucide-react';
import { format } from 'date-fns';

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
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListGenhalCommunityPostsQueryKey,
  getGetGenhalCommunityQueryKey,
} from '@workspace/api-client-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Reveal, stagger } from '@/components/reveal';
import { cn } from '@/lib/utils';

const POST_TYPES = [
  { value: 'story', label: 'Story', icon: Type },
  { value: 'photo', label: 'Photo', icon: ImageIcon },
  { value: 'oral_history', label: 'Oral history', icon: Music },
] as const;

export default function CommunityDetail() {
  const params = useParams();
  const communityId = Number(params.id);

  const {
    data: community,
    isLoading: communityLoading,
    error: communityError,
    refetch: refetchCommunity,
  } = useGetGenhalCommunity(communityId);
  const { data: posts, isLoading: postsLoading } =
    useListGenhalCommunityPosts(communityId);

  const [isPostOpen, setIsPostOpen] = useState(false);

  if (communityLoading || postsLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-secondary" />
      </div>
    );
  }

  if (communityError) {
    return (
      <ErrorState subject="this community" onRetry={() => refetchCommunity()} />
    );
  }

  if (!community) {
    return (
      <EmptyState
        icon={<BookOpen className="h-5 w-5" />}
        title="Community not found"
        description="This heritage community no longer exists, or you don't have access to it."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/heritage"
        backLabel="Back to Heritage Hub"
        eyebrow="Heritage community"
        title={community.name}
        description={
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {community.ethnicGroup}, {community.country}
          </span>
        }
        actions={
          <Dialog open={isPostOpen} onOpenChange={setIsPostOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Share story
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[620px]">
              <DialogHeader>
                <DialogTitle>Share with {community.name}</DialogTitle>
              </DialogHeader>
              <CreatePostForm
                communityId={communityId}
                onSuccess={() => setIsPostOpen(false)}
              />
            </DialogContent>
          </Dialog>
        }
      />

      {/* Overview */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Reveal
          animation="fade-up"
          className="overflow-hidden rounded-xl border border-border bg-card shadow-card lg:col-span-2"
        >
          {community.coverImageUrl && (
            <div className="h-40 w-full overflow-hidden bg-muted md:h-48">
              <img
                src={community.coverImageUrl}
                alt={community.name}
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <div className="p-5">
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              About
            </h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
              {community.description}
            </p>
          </div>
        </Reveal>

        <Reveal
          animation="fade-up"
          delay={stagger(1)}
          className="rounded-xl border border-border bg-card p-5 shadow-card"
        >
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            At a glance
          </h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="inline-flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4 text-secondary" />
                Members
              </dt>
              <dd className="font-semibold text-foreground">
                {community.memberCount || 1}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="inline-flex items-center gap-2 text-muted-foreground">
                <Type className="h-4 w-4 text-secondary" />
                Stories &amp; posts
              </dt>
              <dd className="font-semibold text-foreground">
                {community.postCount || 0}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="inline-flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="h-4 w-4 text-secondary" />
                Founded
              </dt>
              <dd className="font-semibold text-foreground">
                {format(new Date(community.createdAt), 'MMM yyyy')}
              </dd>
            </div>
          </dl>
        </Reveal>
      </div>

      {/* Feed */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Stories &amp; archives
        </h3>

        {!posts?.length ? (
          <EmptyState
            icon={<Type className="h-5 w-5" />}
            title="No posts yet"
            description="Contribute the first story, photo, or oral history to this community."
            action={
              <Button variant="outline" onClick={() => setIsPostOpen(true)}>
                Share a story
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {posts?.map((post, i) => (
              <Reveal key={post.id} animation="fade-up" delay={stagger(i, 40)}>
                <PostCard post={post} />
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PostCard({ post }: { post: any }) {
  const typeIcon = () => {
    switch (post.type) {
      case 'photo':
        return <ImageIcon className="h-4 w-4" />;
      case 'oral_history':
        return <Music className="h-4 w-4" />;
      default:
        return <Type className="h-4 w-4" />;
    }
  };

  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
            {typeIcon()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {post.authorName || 'Community member'}
            </p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(post.createdAt), 'MMMM d, yyyy')}
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0 capitalize">
          {post.type.replace('_', ' ')}
        </Badge>
      </div>

      <h4 className="text-base font-semibold text-foreground">{post.title}</h4>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
        {post.body}
      </p>

      {post.mediaUrl && (
        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-muted">
          <img
            src={post.mediaUrl}
            alt={post.title}
            className="max-h-96 w-full object-contain"
          />
        </div>
      )}

      {post.audioUrl && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-3">
          <Music className="h-5 w-5 shrink-0 text-secondary" />
          <audio controls className="h-9 w-full">
            <source src={post.audioUrl} type="audio/mpeg" />
            Your browser does not support the audio element.
          </audio>
        </div>
      )}

      {post.tags && post.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          {post.tags.map((tag: string, i: number) => (
            <span
              key={i}
              className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function CreatePostForm({
  communityId,
  onSuccess,
}: {
  communityId: number;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createPost = useCreateGenhalHeritagePost();

  const [formData, setFormData] = useState({
    title: '',
    body: '',
    type: 'story',
    mediaUrl: '',
    audioUrl: '',
    tags: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.body) return;

    // The community id travels as a path parameter, not in the body.
    createPost.mutate(
      {
        id: communityId,
        data: {
          ...formData,
          tags: formData.tags
            ? formData.tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
            : [],
        },
      },
      {
        onSuccess: () => {
          toast({ title: 'Post published successfully' });
          queryClient.invalidateQueries({
            queryKey: getListGenhalCommunityPostsQueryKey(communityId),
          });
          queryClient.invalidateQueries({
            queryKey: getGetGenhalCommunityQueryKey(communityId),
          });
          onSuccess();
        },
        onError: () => {
          toast({ variant: 'destructive', title: 'Failed to publish post' });
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label>Post type</Label>
        <div className="grid grid-cols-3 gap-2">
          {POST_TYPES.map((type) => {
            const active = formData.type === type.value;
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => setFormData({ ...formData, type: type.value })}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-colors',
                  active
                    ? 'border-secondary bg-secondary/10 text-secondary'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted',
                )}
              >
                <type.icon className="h-4 w-4" />
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  {type.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="e.g. The founding of our village"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="body">Story content</Label>
        <Textarea
          id="body"
          value={formData.body}
          onChange={(e) => setFormData({ ...formData, body: e.target.value })}
          placeholder="Share the details…"
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
            onChange={(e) =>
              setFormData({ ...formData, mediaUrl: e.target.value })
            }
            placeholder="https://…"
            required
          />
        </div>
      )}

      {formData.type === 'oral_history' && (
        <div className="space-y-2">
          <Label htmlFor="audioUrl">Audio recording URL</Label>
          <Input
            id="audioUrl"
            type="url"
            value={formData.audioUrl}
            onChange={(e) =>
              setFormData({ ...formData, audioUrl: e.target.value })
            }
            placeholder="Link to audio file (mp3, wav)…"
            required
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="tags">Tags (comma separated)</Label>
        <Input
          id="tags"
          value={formData.tags}
          onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
          placeholder="tradition, festival, elders"
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={createPost.isPending || !formData.title || !formData.body}
        >
          {createPost.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Publish
        </Button>
      </div>
    </form>
  );
}
