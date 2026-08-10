import { useState } from 'react';
import { Link } from 'wouter';
import { useListGenhalTrees, useCreateGenhalTree } from '@workspace/api-client-react';
import { Network, Plus, MapPin, Users, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { getListGenhalTreesQueryKey } from '@workspace/api-client-react';

export default function GenealogyList() {
  const { data: trees, isLoading } = useListGenhalTrees();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-serif font-bold text-foreground">Family Trees</h1>
          <p className="text-muted-foreground mt-2 text-lg">Document your lineage and preserve your family history.</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="bg-primary hover:bg-primary/90 rounded-full shadow-md">
              <Plus className="mr-2 h-5 w-5" />
              Create Tree
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">Start a New Family Tree</DialogTitle>
              <DialogDescription>
                Begin documenting your ancestry. You can add members and rich details later.
              </DialogDescription>
            </DialogHeader>
            <CreateTreeForm onSuccess={() => setIsCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse border-none shadow-sm h-64 bg-muted/50"></Card>
          ))}
        </div>
      ) : trees?.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-3xl border border-dashed border-border shadow-sm">
          <div className="mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
            <Network className="h-10 w-10 text-primary" />
          </div>
          <h3 className="text-2xl font-serif font-bold text-foreground">No trees yet</h3>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Your family's story is waiting to be told. Create your first family tree to begin tracing your roots.
          </p>
          <Button onClick={() => setIsCreateOpen(true)} className="mt-6 rounded-full bg-primary" size="lg">
            Create Your First Tree
          </Button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {trees?.map((tree) => (
            <Link key={tree.id} href={`/genealogy/${tree.id}`}>
              <Card className="h-full border-none shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer group bg-card overflow-hidden flex flex-col">
                <div className="h-32 bg-secondary/10 relative overflow-hidden group-hover:bg-secondary/20 transition-colors">
                  {tree.coverImageUrl ? (
                    <img src={tree.coverImageUrl} alt={tree.name} className="w-full h-full object-cover opacity-80 mix-blend-multiply" />
                  ) : (
                    <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?q=80&w=1000&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay grayscale"></div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                  <h3 className="absolute bottom-4 left-4 right-4 text-2xl font-serif font-bold text-white truncate">
                    {tree.name}
                  </h3>
                </div>
                <CardContent className="p-5 flex-1 space-y-4">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {tree.description || "No description provided."}
                  </p>
                  
                  <div className="flex flex-col gap-2 text-sm text-foreground/80 font-medium">
                    {tree.originCountry && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" />
                        {tree.originEthnicGroup ? `${tree.originEthnicGroup}, ` : ''}{tree.originCountry}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-accent" />
                      {tree.memberCount} members
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="px-5 py-4 border-t bg-muted/20 text-xs text-muted-foreground flex justify-between items-center">
                  <span>Created {format(new Date(tree.createdAt), 'MMM yyyy')}</span>
                  <span className="text-primary font-medium group-hover:underline">View Tree →</span>
                </CardFooter>
              </Card>
            </Link>
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
    originEthnicGroup: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    
    createTree.mutate({ data: formData }, {
      onSuccess: () => {
        toast({
          title: "Tree created",
          description: "Your family tree has been created successfully.",
        });
        queryClient.invalidateQueries({ queryKey: getListGenhalTreesQueryKey() });
        onSuccess();
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to create tree. Please make sure you are signed in.",
        });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="space-y-2">
        <Label htmlFor="name">Tree Name (e.g., The Okonkwo Family)</Label>
        <Input 
          id="name" 
          value={formData.name}
          onChange={(e) => setFormData({...formData, name: e.target.value})}
          placeholder="Enter family name"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Short Description (Optional)</Label>
        <Textarea 
          id="description" 
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          placeholder="A brief history or intro..."
          rows={3}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="country">Origin Country</Label>
          <Input 
            id="country" 
            value={formData.originCountry}
            onChange={(e) => setFormData({...formData, originCountry: e.target.value})}
            placeholder="e.g., Nigeria"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ethnicGroup">Ethnic Group</Label>
          <Input 
            id="ethnicGroup" 
            value={formData.originEthnicGroup}
            onChange={(e) => setFormData({...formData, originEthnicGroup: e.target.value})}
            placeholder="e.g., Obolo, Igbo"
          />
        </div>
      </div>
      <div className="pt-4 flex justify-end">
        <Button type="submit" disabled={createTree.isPending || !formData.name} className="bg-primary rounded-full px-8">
          {createTree.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Create Tree
        </Button>
      </div>
    </form>
  );
}