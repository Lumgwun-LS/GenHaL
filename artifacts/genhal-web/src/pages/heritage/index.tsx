import { useState } from 'react';
import { Link } from 'wouter';
import { useListGenhalCommunities, useCreateGenhalCommunity } from '@workspace/api-client-react';
import { BookOpen, MapPin, Users, Plus, MessageSquare, Loader2, Image as ImageIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { getListGenhalCommunitiesQueryKey } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';

export default function HeritageHub() {
  const { data: communities, isLoading } = useListGenhalCommunities();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="relative rounded-3xl bg-secondary/10 p-8 md:p-12 overflow-hidden border border-secondary/20">
        <div className="absolute right-0 top-0 w-1/3 h-full bg-secondary/20 blur-3xl rounded-full translate-x-1/2 -translate-y-1/4"></div>
        <div className="relative z-10 max-w-2xl space-y-4">
          <Badge className="bg-secondary text-secondary-foreground hover:bg-secondary">Heritage Hub</Badge>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground">Community & Culture</h1>
          <p className="text-muted-foreground text-lg font-medium leading-relaxed">
            Discover and document the rich traditions, stories, and histories of Pan-African communities. Join a community to preserve oral histories and cultural knowledge.
          </p>
          <div className="pt-4">
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="lg" className="bg-secondary hover:bg-secondary/90 text-white rounded-full">
                  <Plus className="mr-2 h-5 w-5" />
                  Start a Community
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle className="font-serif text-2xl text-secondary">Create a Heritage Community</DialogTitle>
                </DialogHeader>
                <CreateCommunityForm onSuccess={() => setIsCreateOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-serif font-bold text-foreground flex items-center gap-2">
          <Users className="text-secondary" /> Featured Communities
        </h2>
        
        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map(i => (
              <Card key={i} className="animate-pulse border-none shadow-sm h-48 bg-muted/50"></Card>
            ))}
          </div>
        ) : communities?.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-2xl border">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium text-foreground">No communities found</p>
            <p className="text-muted-foreground">Be the first to start a heritage community.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {communities?.map((community) => (
              <Link key={community.id} href={`/heritage/${community.id}`}>
                <Card className="h-full border-none shadow-sm hover:shadow-xl transition-shadow cursor-pointer group bg-card flex flex-row overflow-hidden">
                  <div className="w-1/3 bg-muted relative">
                    {community.coverImageUrl ? (
                      <img src={community.coverImageUrl} alt={community.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-secondary/10 flex items-center justify-center">
                        <ImageIcon className="h-8 w-8 text-secondary/40" />
                      </div>
                    )}
                  </div>
                  <div className="w-2/3 flex flex-col">
                    <CardContent className="p-5 flex-1">
                      <h3 className="text-xl font-serif font-bold text-foreground group-hover:text-secondary transition-colors">
                        {community.name}
                      </h3>
                      <div className="flex items-center gap-2 text-xs font-semibold text-secondary mt-2 mb-3 bg-secondary/10 inline-flex px-2 py-1 rounded-md">
                        <MapPin className="h-3 w-3" />
                        {community.ethnicGroup ? `${community.ethnicGroup}, ` : ''}{community.country}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {community.description}
                      </p>
                    </CardContent>
                    <CardFooter className="px-5 py-3 border-t bg-muted/20 text-xs text-muted-foreground flex gap-4">
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {community.memberCount || 1} Members</span>
                      <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {community.postCount || 0} Stories</span>
                    </CardFooter>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
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
    coverImageUrl: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    
    createCommunity.mutate({ data: formData }, {
      onSuccess: () => {
        toast({ title: "Community created successfully" });
        queryClient.invalidateQueries({ queryKey: getListGenhalCommunitiesQueryKey() });
        onSuccess();
      },
      onError: () => {
        toast({ variant: "destructive", title: "Error creating community" });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="space-y-2">
        <Label htmlFor="name">Community Name</Label>
        <Input 
          id="name" 
          value={formData.name}
          onChange={(e) => setFormData({...formData, name: e.target.value})}
          placeholder="e.g., Obolo Heritage Group"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="ethnicGroup">Ethnic Group</Label>
          <Input 
            id="ethnicGroup" 
            value={formData.ethnicGroup}
            onChange={(e) => setFormData({...formData, ethnicGroup: e.target.value})}
            placeholder="e.g., Obolo"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="country">Country</Label>
          <Input 
            id="country" 
            value={formData.country}
            onChange={(e) => setFormData({...formData, country: e.target.value})}
            placeholder="e.g., Nigeria"
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">About This Community</Label>
        <Textarea 
          id="description" 
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          placeholder="What is the focus of this heritage group?"
          rows={4}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="coverImage">Cover Image URL (Optional)</Label>
        <Input 
          id="coverImage" 
          type="url"
          value={formData.coverImageUrl}
          onChange={(e) => setFormData({...formData, coverImageUrl: e.target.value})}
          placeholder="https://..."
        />
      </div>
      <div className="pt-4 flex justify-end">
        <Button type="submit" disabled={createCommunity.isPending} className="bg-secondary hover:bg-secondary/90 rounded-full px-8">
          {createCommunity.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Create Community
        </Button>
      </div>
    </form>
  );
}