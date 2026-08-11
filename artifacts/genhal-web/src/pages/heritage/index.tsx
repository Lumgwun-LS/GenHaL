import { useState } from 'react';
import { Link } from 'wouter';
import {
  useListGenhalCommunities,
  useCreateGenhalCommunity,
} from '@workspace/api-client-react';
import {
  BookOpen,
  MapPin,
  Users,
  Plus,
  MessageSquare,
  Loader2,
  Image as ImageIcon,
  ChevronRight,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { getListGenhalCommunitiesQueryKey } from '@workspace/api-client-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Reveal, stagger } from '@/components/reveal';

export default function HeritageHub() {
  const {
    data: communities,
    isLoading,
    error,
    refetch,
  } = useListGenhalCommunities();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Heritage Hub"
        description="Discover and document the traditions, stories, and histories of pan-African communities."
        actions={
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Start a community
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Create a heritage community</DialogTitle>
                <DialogDescription>
                  Give the community a home so members can contribute oral
                  histories and cultural knowledge.
                </DialogDescription>
              </DialogHeader>
              <CreateCommunityForm onSuccess={() => setIsCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        }
      />

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Communities
        </h3>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <ErrorState subject="communities" onRetry={() => refetch()} />
        ) : !communities?.length ? (
          <EmptyState
            icon={<BookOpen className="h-5 w-5" />}
            title="No communities yet"
            description="Be the first to start a heritage community and invite others to contribute."
            action={
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Start a community
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {communities?.map((community, i) => (
              <Reveal
                key={community.id}
                animation="fade-up"
                delay={stagger(i)}
                className="h-full"
              >
                <Link
                  href={`/heritage/${community.id}`}
                  className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <div className="group flex h-full overflow-hidden rounded-xl border border-border bg-card shadow-card transition-shadow hover:shadow-card-hover">
                    <div className="w-28 shrink-0 bg-muted sm:w-36">
                      {community.coverImageUrl ? (
                        <img
                          src={community.coverImageUrl}
                          alt={community.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-secondary/10 text-secondary">
                          <ImageIcon className="h-6 w-6" />
                        </div>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex-1 space-y-2 p-5">
                        <p className="truncate text-base font-semibold text-foreground">
                          {community.name}
                        </p>
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary/10 px-2 py-1 text-xs font-semibold text-secondary">
                          <MapPin className="h-3 w-3" />
                          {community.ethnicGroup
                            ? `${community.ethnicGroup}, `
                            : ''}
                          {community.country}
                        </span>
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                          {community.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-4">
                          <span className="inline-flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5" />
                            {community.memberCount || 1} members
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <MessageSquare className="h-3.5 w-3.5" />
                            {community.postCount || 0} stories
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </div>
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

function CreateCommunityForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createCommunity = useCreateGenhalCommunity();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    country: '',
    ethnicGroup: '',
    coverImageUrl: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    createCommunity.mutate(
      { data: formData },
      {
        onSuccess: () => {
          toast({ title: 'Community created successfully' });
          queryClient.invalidateQueries({
            queryKey: getListGenhalCommunitiesQueryKey(),
          });
          onSuccess();
        },
        onError: () => {
          toast({ variant: 'destructive', title: 'Error creating community' });
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label htmlFor="name">Community name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g. Obolo Heritage Group"
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ethnicGroup">Ethnic group</Label>
          <Input
            id="ethnicGroup"
            value={formData.ethnicGroup}
            onChange={(e) =>
              setFormData({ ...formData, ethnicGroup: e.target.value })
            }
            placeholder="e.g. Obolo"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="country">Country</Label>
          <Input
            id="country"
            value={formData.country}
            onChange={(e) =>
              setFormData({ ...formData, country: e.target.value })
            }
            placeholder="e.g. Nigeria"
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">About this community</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
          placeholder="What is the focus of this heritage group?"
          rows={4}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="coverImage">Cover image URL (optional)</Label>
        <Input
          id="coverImage"
          type="url"
          value={formData.coverImageUrl}
          onChange={(e) =>
            setFormData({ ...formData, coverImageUrl: e.target.value })
          }
          placeholder="https://…"
        />
      </div>
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={createCommunity.isPending}>
          {createCommunity.isPending && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          Create community
        </Button>
      </div>
    </form>
  );
}
