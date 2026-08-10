import { useState } from 'react';
import { useParams, Link } from 'wouter';
import { useGetGenhalTree, useListGenhalTreeMembers, useAddGenhalTreeMember } from '@workspace/api-client-react';
import { ArrowLeft, UserPlus, Network, Calendar, MapPin, Heart, ChevronRight, Loader2, Plus } from 'lucide-react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { getListGenhalTreeMembersQueryKey, getGetGenhalTreeQueryKey } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';

export default function TreeDetail() {
  const params = useParams();
  const treeId = Number(params.id);
  
  const { data: tree, isLoading: treeLoading } = useGetGenhalTree(treeId);
  const { data: members, isLoading: membersLoading } = useListGenhalTreeMembers(treeId);
  
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState<number | undefined>();

  if (treeLoading || membersLoading) {
    return <div className="p-20 flex justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }

  if (!tree) {
    return <div>Tree not found</div>;
  }

  // Find root members (those without parents)
  const rootMembers = members?.filter(m => !m.parentId) || [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex items-center gap-4">
        <Link href="/genealogy">
          <Button variant="ghost" size="icon" className="rounded-full bg-card shadow-sm hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-serif font-bold text-foreground">{tree.name}</h1>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              {members?.length || 0} Members
            </Badge>
          </div>
          {(tree.originCountry || tree.originEthnicGroup) && (
            <p className="text-muted-foreground flex items-center gap-2 mt-1">
              <MapPin className="h-4 w-4" />
              {tree.originEthnicGroup ? `${tree.originEthnicGroup}, ` : ''}{tree.originCountry}
            </p>
          )}
        </div>
        <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary rounded-full" onClick={() => setSelectedParentId(undefined)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Member
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">Add Family Member</DialogTitle>
            </DialogHeader>
            <AddMemberForm 
              treeId={treeId} 
              parentId={selectedParentId}
              members={members || []}
              onSuccess={() => setIsAddMemberOpen(false)} 
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card rounded-3xl p-6 shadow-sm border border-border/50 min-h-[60vh] overflow-x-auto">
        {members?.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-20">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Network className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-serif font-semibold">Start building your tree</h3>
            <p className="text-muted-foreground max-w-sm mt-2 mb-6">
              Add the first member of your family to start branching out. Usually, people start with themselves or their oldest known ancestor.
            </p>
            <Button onClick={() => setIsAddMemberOpen(true)} className="rounded-full">Add First Member</Button>
          </div>
        ) : (
          <div className="p-8">
            <div className="flex flex-col items-center">
              {rootMembers.map(root => (
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

function TreeNode({ member, allMembers, onAddChild }: { member: any, allMembers: any[], onAddChild: (id: number) => void }) {
  const children = allMembers.filter(m => m.parentId === member.id);
  const spouse = member.spouseId ? allMembers.find(m => m.id === member.spouseId) : null;

  return (
    <div className="flex flex-col items-center">
      {/* Node Content */}
      <div className="flex items-center gap-4 relative z-10">
        <MemberCard member={member} onAddChild={() => onAddChild(member.id)} />
        {spouse && (
          <>
            <div className="w-8 border-t-2 border-primary border-dashed"></div>
            <MemberCard member={spouse} onAddChild={() => onAddChild(member.id)} isSpouse />
          </>
        )}
      </div>

      {/* Children branches */}
      {children.length > 0 && (
        <>
          <div className="w-px h-8 bg-border"></div>
          <div className="flex gap-8 relative border-t border-border pt-8 mt-[-1px]">
            {children.map((child, index) => (
              <div key={child.id} className="relative flex flex-col items-center">
                {/* Connecting lines for multiple children */}
                {children.length > 1 && (
                  <>
                    {index === 0 && <div className="absolute top-[-32px] right-0 w-1/2 h-8 border-t border-r border-border rounded-tr-lg hidden"></div>}
                  </>
                )}
                <div className="absolute top-[-32px] left-1/2 w-px h-8 bg-border"></div>
                <TreeNode member={child} allMembers={allMembers} onAddChild={onAddChild} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MemberCard({ member, onAddChild, isSpouse = false }: { member: any, onAddChild: () => void, isSpouse?: boolean }) {
  return (
    <div className={`relative group w-48 rounded-xl border p-4 shadow-sm bg-card hover:shadow-md transition-all text-center
      ${isSpouse ? 'border-accent/30 bg-accent/5' : member.gender === 'female' ? 'border-pink-200 bg-pink-50 dark:bg-pink-950/20' : 'border-blue-200 bg-blue-50 dark:bg-blue-950/20'}
    `}>
      <div className="absolute -top-3 -right-3 opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full shadow-md bg-white text-primary hover:bg-primary hover:text-white" onClick={onAddChild} title="Add Child">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="mx-auto w-16 h-16 rounded-full overflow-hidden border-2 border-white shadow-sm mb-3 bg-muted flex items-center justify-center">
        {member.photoUrl ? (
          <img src={member.photoUrl} alt={member.firstName} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xl font-serif text-muted-foreground">{member.firstName.charAt(0)}</span>
        )}
      </div>
      
      <div className="font-serif font-bold text-foreground leading-tight">
        {member.firstName} {member.lastName}
      </div>
      
      <div className="text-xs text-muted-foreground mt-1 font-medium">
        {member.birthDate ? new Date(member.birthDate).getFullYear() : '?'} - {member.isLiving ? 'Present' : (member.deathDate ? new Date(member.deathDate).getFullYear() : '?')}
      </div>
    </div>
  );
}

function AddMemberForm({ treeId, parentId, members, onSuccess }: { treeId: number, parentId?: number, members: any[], onSuccess: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const addMember = useAddGenhalTreeMember();
  
  const [formData, setFormData] = useState({
    treeId,
    parentId: parentId || undefined,
    firstName: '',
    lastName: '',
    gender: 'male',
    isLiving: true,
    birthDate: '',
    birthPlace: '',
    bio: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstName) return;
    
    // Format dates to ISO if present
    const payload = {
      ...formData,
      birthDate: formData.birthDate ? new Date(formData.birthDate).toISOString() : undefined
    };
    
    addMember.mutate({ data: payload }, {
      onSuccess: () => {
        toast({ title: "Member added successfully" });
        queryClient.invalidateQueries({ queryKey: getListGenhalTreeMembersQueryKey(treeId) });
        queryClient.invalidateQueries({ queryKey: getGetGenhalTreeQueryKey(treeId) });
        onSuccess();
      },
      onError: () => {
        toast({ variant: "destructive", title: "Failed to add member" });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name *</Label>
          <Input 
            id="firstName" 
            value={formData.firstName}
            onChange={(e) => setFormData({...formData, firstName: e.target.value})}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last Name</Label>
          <Input 
            id="lastName" 
            value={formData.lastName}
            onChange={(e) => setFormData({...formData, lastName: e.target.value})}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Gender</Label>
          <Select value={formData.gender} onValueChange={(val) => setFormData({...formData, gender: val})}>
            <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Living Status</Label>
          <Select value={formData.isLiving ? "living" : "deceased"} onValueChange={(val) => setFormData({...formData, isLiving: val === "living"})}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="living">Living</SelectItem>
              <SelectItem value="deceased">Deceased</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="birthDate">Birth Date</Label>
          <Input 
            id="birthDate" 
            type="date"
            value={formData.birthDate}
            onChange={(e) => setFormData({...formData, birthDate: e.target.value})}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="birthPlace">Birth Place</Label>
          <Input 
            id="birthPlace" 
            value={formData.birthPlace}
            onChange={(e) => setFormData({...formData, birthPlace: e.target.value})}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Parent</Label>
        <Select value={formData.parentId?.toString() || "none"} onValueChange={(val) => setFormData({...formData, parentId: val === "none" ? undefined : Number(val)})}>
          <SelectTrigger><SelectValue placeholder="Select parent" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Parent (Root Node)</SelectItem>
            {members.map(m => (
              <SelectItem key={m.id} value={m.id.toString()}>{m.firstName} {m.lastName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">Biography / Notes</Label>
        <Textarea 
          id="bio" 
          value={formData.bio}
          onChange={(e) => setFormData({...formData, bio: e.target.value})}
          placeholder="Significant life events, occupation, legacy..."
          rows={3}
        />
      </div>

      <div className="pt-4 flex justify-end">
        <Button type="submit" disabled={addMember.isPending || !formData.firstName} className="bg-primary rounded-full px-8">
          {addMember.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save Member
        </Button>
      </div>
    </form>
  );
}