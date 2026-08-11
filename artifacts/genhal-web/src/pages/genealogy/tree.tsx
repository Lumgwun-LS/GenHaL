import { useState } from 'react';
import { useParams } from 'wouter';
import {
  useGetGenhalTree,
  useListGenhalTreeMembers,
  useAddGenhalTreeMember,
} from '@workspace/api-client-react';
import { UserPlus, Network, MapPin, Loader2, Plus, Users } from 'lucide-react';

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
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  getListGenhalTreeMembersQueryKey,
  getGetGenhalTreeQueryKey,
} from '@workspace/api-client-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { cn } from '@/lib/utils';

export default function TreeDetail() {
  const params = useParams();
  const treeId = Number(params.id);

  const {
    data: tree,
    isLoading: treeLoading,
    error: treeError,
    refetch: refetchTree,
  } = useGetGenhalTree(treeId);
  const { data: members, isLoading: membersLoading } =
    useListGenhalTreeMembers(treeId);

  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState<
    number | undefined
  >();

  if (treeLoading || membersLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (treeError) {
    return (
      <ErrorState subject="this family tree" onRetry={() => refetchTree()} />
    );
  }

  if (!tree) {
    return (
      <EmptyState
        icon={<Network className="h-5 w-5" />}
        title="Tree not found"
        description="This family tree no longer exists, or you don't have access to it."
      />
    );
  }

  const rootMembers = members?.filter((m) => !m.parentId) || [];
  const origin = [tree.originEthnicGroup, tree.originCountry]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/genealogy"
        backLabel="Back to family trees"
        eyebrow="Family tree"
        title={tree.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {members?.length || 0} members
            </span>
            {origin && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {origin}
              </span>
            )}
          </span>
        }
        actions={
          <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setSelectedParentId(undefined)}>
                <UserPlus className="h-4 w-4" />
                Add member
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[620px]">
              <DialogHeader>
                <DialogTitle>Add family member</DialogTitle>
              </DialogHeader>
              <AddMemberForm
                treeId={treeId}
                parentId={selectedParentId}
                members={members || []}
                onSuccess={() => setIsAddMemberOpen(false)}
              />
            </DialogContent>
          </Dialog>
        }
      />

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
        {members?.length === 0 ? (
          <div className="p-6">
            <EmptyState
              className="border-0 bg-transparent py-10"
              icon={<Network className="h-5 w-5" />}
              title="Start building your tree"
              description="Add the first member to start branching out. Most people begin with themselves, or with their oldest known ancestor."
              action={
                <Button onClick={() => setIsAddMemberOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add first member
                </Button>
              }
            />
          </div>
        ) : (
          <div className="min-w-max p-8">
            <div className="flex flex-col items-center gap-10">
              {rootMembers.map((root) => (
                <TreeNode
                  key={root.id}
                  member={root}
                  allMembers={members || []}
                  onAddChild={(parentId) => {
                    setSelectedParentId(parentId);
                    setIsAddMemberOpen(true);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TreeNode({
  member,
  allMembers,
  onAddChild,
}: {
  member: any;
  allMembers: any[];
  onAddChild: (id: number) => void;
}) {
  const children = allMembers.filter((m) => m.parentId === member.id);
  const spouse = member.spouseId
    ? allMembers.find((m) => m.id === member.spouseId)
    : null;

  return (
    <div className="flex flex-col items-center">
      <div className="relative z-10 flex items-center gap-3">
        <MemberCard member={member} onAddChild={() => onAddChild(member.id)} />
        {spouse && (
          <>
            <div className="w-6 border-t-2 border-dashed border-primary/50" />
            <MemberCard
              member={spouse}
              onAddChild={() => onAddChild(member.id)}
              isSpouse
            />
          </>
        )}
      </div>

      {children.length > 0 && (
        <>
          {/* Stem down from this node */}
          <div className="h-6 w-px bg-border" />
          <div className="flex items-start">
            {children.map((child, index) => (
              <div
                key={child.id}
                className="relative flex flex-col items-center px-3"
              >
                {/* Horizontal connector across siblings */}
                {children.length > 1 && (
                  <div
                    className={cn(
                      'absolute top-0 h-px bg-border',
                      index === 0
                        ? 'left-1/2 right-0'
                        : index === children.length - 1
                          ? 'left-0 right-1/2'
                          : 'left-0 right-0',
                    )}
                  />
                )}
                {/* Stem down into the child */}
                <div className="h-6 w-px bg-border" />
                <TreeNode
                  member={child}
                  allMembers={allMembers}
                  onAddChild={onAddChild}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MemberCard({
  member,
  onAddChild,
  isSpouse = false,
}: {
  member: any;
  onAddChild: () => void;
  isSpouse?: boolean;
}) {
  const ring =
    member.gender === 'female'
      ? 'ring-rose-300 dark:ring-rose-500/50'
      : member.gender === 'male'
        ? 'ring-sky-300 dark:ring-sky-500/50'
        : 'ring-border';

  const lifespan = `${member.birthDate ? new Date(member.birthDate).getFullYear() : '?'} – ${
    member.isLiving
      ? 'Present'
      : member.deathDate
        ? new Date(member.deathDate).getFullYear()
        : '?'
  }`;

  return (
    <div className="group relative w-44 rounded-xl border border-border bg-card p-4 text-center shadow-card transition-shadow hover:shadow-card-hover">
      <button
        onClick={onAddChild}
        title="Add child"
        className="absolute -right-2.5 -top-2.5 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-primary opacity-0 shadow-sm transition-all hover:bg-primary hover:text-primary-foreground group-hover:opacity-100"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      <div
        className={cn(
          'mx-auto mb-3 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-muted ring-2',
          ring,
        )}
      >
        {member.photoUrl ? (
          <img
            src={member.photoUrl}
            alt={member.firstName}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-lg font-bold text-muted-foreground">
            {member.firstName.charAt(0)}
          </span>
        )}
      </div>

      <p className="truncate text-sm font-semibold leading-tight text-foreground">
        {member.firstName} {member.lastName}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{lifespan}</p>

      {isSpouse && (
        <span className="mt-2 inline-block rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Spouse
        </span>
      )}
    </div>
  );
}

function AddMemberForm({
  treeId,
  parentId,
  members,
  onSuccess,
}: {
  treeId: number;
  parentId?: number;
  members: any[];
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const addMember = useAddGenhalTreeMember();

  const [formData, setFormData] = useState({
    parentId: parentId || undefined,
    firstName: '',
    lastName: '',
    gender: 'male',
    isLiving: true,
    birthDate: '',
    birthPlace: '',
    bio: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstName) return;

    // The tree id travels as a path parameter, not in the body.
    addMember.mutate(
      {
        id: treeId,
        data: {
          ...formData,
          birthDate: formData.birthDate
            ? new Date(formData.birthDate).toISOString()
            : undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: 'Member added successfully' });
          queryClient.invalidateQueries({
            queryKey: getListGenhalTreeMembersQueryKey(treeId),
          });
          queryClient.invalidateQueries({
            queryKey: getGetGenhalTreeQueryKey(treeId),
          });
          onSuccess();
        },
        onError: () => {
          toast({ variant: 'destructive', title: 'Failed to add member' });
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First name *</Label>
          <Input
            id="firstName"
            value={formData.firstName}
            onChange={(e) =>
              setFormData({ ...formData, firstName: e.target.value })
            }
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            value={formData.lastName}
            onChange={(e) =>
              setFormData({ ...formData, lastName: e.target.value })
            }
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Gender</Label>
          <Select
            value={formData.gender}
            onValueChange={(val) => setFormData({ ...formData, gender: val })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Living status</Label>
          <Select
            value={formData.isLiving ? 'living' : 'deceased'}
            onValueChange={(val) =>
              setFormData({ ...formData, isLiving: val === 'living' })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="living">Living</SelectItem>
              <SelectItem value="deceased">Deceased</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="birthDate">Birth date</Label>
          <Input
            id="birthDate"
            type="date"
            value={formData.birthDate}
            onChange={(e) =>
              setFormData({ ...formData, birthDate: e.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="birthPlace">Birth place</Label>
          <Input
            id="birthPlace"
            value={formData.birthPlace}
            onChange={(e) =>
              setFormData({ ...formData, birthPlace: e.target.value })
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Parent</Label>
        <Select
          value={formData.parentId?.toString() || 'none'}
          onValueChange={(val) =>
            setFormData({
              ...formData,
              parentId: val === 'none' ? undefined : Number(val),
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select parent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No parent (root node)</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id.toString()}>
                {m.firstName} {m.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">Biography / notes</Label>
        <Textarea
          id="bio"
          value={formData.bio}
          onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
          placeholder="Significant life events, occupation, legacy…"
          rows={3}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={addMember.isPending || !formData.firstName}
        >
          {addMember.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save member
        </Button>
      </div>
    </form>
  );
}
