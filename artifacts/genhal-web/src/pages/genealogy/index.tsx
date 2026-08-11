import { useState } from 'react';
import { Link } from 'wouter';
import {
  useListGenhalTrees,
  useCreateGenhalTree,
} from '@workspace/api-client-react';
import {
  Network,
  Plus,
  MapPin,
  Users,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';

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
import { getListGenhalTreesQueryKey } from '@workspace/api-client-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Reveal, stagger } from '@/components/reveal';

export default function GenealogyList() {
  const { data: trees, isLoading, error, refetch } = useListGenhalTrees();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Family Trees"
        description="Document your lineage and preserve your family history."
        actions={
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Create tree
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Start a new family tree</DialogTitle>
                <DialogDescription>
                  Begin documenting your ancestry. You can add members and
                  richer details later.
                </DialogDescription>
              </DialogHeader>
              <CreateTreeForm onSuccess={() => setIsCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState subject="family trees" onRetry={() => refetch()} />
      ) : !trees?.length ? (
        <EmptyState
          icon={<Network className="h-5 w-5" />}
          title="No trees yet"
          description="Your family's story is waiting to be told. Create your first family tree to begin tracing your roots."
          action={
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create your first tree
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {trees?.map((tree, i) => (
            <Reveal
              key={tree.id}
              animation="fade-up"
              delay={stagger(i)}
              className="h-full"
            >
              <Link
                href={`/genealogy/${tree.id}`}
                className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <div className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-card transition-shadow hover:shadow-card-hover">
                  {tree.coverImageUrl ? (
                    <div className="h-28 w-full overflow-hidden bg-muted">
                      <img
                        src={tree.coverImageUrl}
                        alt={tree.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="h-1 w-full bg-linear-to-r from-primary to-accent opacity-70" />
                  )}

                  <div className="flex flex-1 flex-col gap-3 p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Network className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold text-foreground">
                          {tree.name}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                          {tree.description || 'No description provided.'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-auto flex flex-wrap gap-2 text-xs font-medium">
                      {tree.originCountry && (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {tree.originEthnicGroup
                            ? `${tree.originEthnicGroup}, `
                            : ''}
                          {tree.originCountry}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {tree.memberCount} members
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground">
                    <span>
                      Created {format(new Date(tree.createdAt), 'MMM yyyy')}
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-primary">
                      View tree
                      <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateTreeForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createTree = useCreateGenhalTree();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    originCountry: '',
    originEthnicGroup: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    createTree.mutate(
      { data: formData },
      {
        onSuccess: () => {
          toast({
            title: 'Tree created',
            description: 'Your family tree has been created successfully.',
          });
          queryClient.invalidateQueries({
            queryKey: getListGenhalTreesQueryKey(),
          });
          onSuccess();
        },
        onError: () => {
          toast({
            variant: 'destructive',
            title: 'Error',
            description:
              'Failed to create tree. Please make sure you are signed in.',
          });
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label htmlFor="name">Tree name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g. The Okonkwo Family"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Short description (optional)</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
          placeholder="A brief history or intro…"
          rows={3}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="country">Origin country</Label>
          <Input
            id="country"
            value={formData.originCountry}
            onChange={(e) =>
              setFormData({ ...formData, originCountry: e.target.value })
            }
            placeholder="e.g. Nigeria"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ethnicGroup">Ethnic group</Label>
          <Input
            id="ethnicGroup"
            value={formData.originEthnicGroup}
            onChange={(e) =>
              setFormData({ ...formData, originEthnicGroup: e.target.value })
            }
            placeholder="e.g. Obolo, Igbo"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={createTree.isPending || !formData.name}>
          {createTree.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Create tree
        </Button>
      </div>
    </form>
  );
}
