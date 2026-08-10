import { useState } from 'react';
import { useParams, Link } from 'wouter';
import { useListGenhalLanguages, useListGenhalLanguageEntries, useCreateGenhalLanguageEntry } from '@workspace/api-client-react';
import { ArrowLeft, Search, Plus, Volume2, BookOpen, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { getListGenhalLanguageEntriesQueryKey, getListGenhalLanguagesQueryKey } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';

export default function Dictionary() {
  const params = useParams();
  const code = params.code || '';
  
  const { data: languages } = useListGenhalLanguages();
  const language = languages?.find(l => l.code === code);
  
  const { data: entries, isLoading } = useListGenhalLanguageEntries(code);
  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);

  const filteredEntries = entries?.filter(e => 
    e.word.toLowerCase().includes(search.toLowerCase()) || 
    e.translation.toLowerCase().includes(search.toLowerCase())
  );

  if (!language && !isLoading) {
    return <div>Language not found</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 border-b pb-6">
        <div className="flex items-center gap-4">
          <Link href="/language">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-serif font-bold flex items-center gap-3">
              {language?.name} Dictionary
            </h1>
            <p className="text-muted-foreground font-medium">{language?.nativeName} • {language?.region}</p>
          </div>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent hover:bg-accent/90 text-accent-foreground rounded-full shadow-md">
              <Plus className="mr-2 h-4 w-4" />
              Add Word
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">Add new word to {language?.name}</DialogTitle>
            </DialogHeader>
            <AddEntryForm languageCode={code} onSuccess={() => setIsAddOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5" />
        <Input 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by word or translation..." 
          className="pl-12 h-14 rounded-2xl bg-card border-border shadow-sm text-lg"
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-card rounded-2xl animate-pulse"></div>)}
        </div>
      ) : filteredEntries?.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-3xl border border-dashed">
          <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-bold font-serif mb-2">No entries found</h3>
          <p className="text-muted-foreground mb-6">Contribute to the dictionary by adding this word.</p>
          <Button onClick={() => setIsAddOpen(true)} className="bg-accent text-accent-foreground rounded-full">Add Word</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEntries?.map((entry) => (
            <Card key={entry.id} className="p-6 rounded-2xl border-none shadow-sm hover:shadow-md transition-shadow bg-card">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div className="flex-1 space-y-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-3xl font-serif font-bold text-foreground">{entry.word}</h3>
                      <Badge variant="outline" className="bg-muted text-muted-foreground border-transparent uppercase text-[10px] font-bold tracking-widest">
                        {entry.partOfSpeech}
                      </Badge>
                      {entry.audioUrl && (
                        <button className="p-2 bg-accent/10 text-accent rounded-full hover:bg-accent hover:text-accent-foreground transition-colors">
                          <Volume2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {entry.pronunciation && (
                      <p className="text-muted-foreground font-mono text-sm tracking-wide">/{entry.pronunciation}/</p>
                    )}
                  </div>
                  
                  <div>
                    <h4 className="font-semibold text-lg text-primary">{entry.translation}</h4>
                    {entry.dialect && (
                      <p className="text-xs text-muted-foreground font-medium mt-1">Dialect: {entry.dialect}</p>
                    )}
                  </div>
                </div>

                {(entry.example || entry.exampleTranslation) && (
                  <div className="md:w-1/2 bg-muted/40 rounded-xl p-4 border border-border/50">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Example</p>
                    <p className="font-serif italic text-foreground text-lg leading-relaxed">"{entry.example}"</p>
                    {entry.exampleTranslation && (
                      <p className="text-sm text-muted-foreground mt-2">— {entry.exampleTranslation}</p>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AddEntryForm({ languageCode, onSuccess }: { languageCode: string, onSuccess: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createEntry = useCreateGenhalLanguageEntry();
  
  const [formData, setFormData] = useState({
    languageCode,
    word: '',
    translation: '',
    pronunciation: '',
    partOfSpeech: 'noun',
    dialect: '',
    example: '',
    exampleTranslation: '',
    audioUrl: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.word || !formData.translation) return;
    
    createEntry.mutate({ code: languageCode, data: { word: formData.word, translation: formData.translation, pronunciation: formData.pronunciation || undefined, partOfSpeech: formData.partOfSpeech || undefined, dialect: formData.dialect || undefined, example: formData.example || undefined, exampleTranslation: formData.exampleTranslation || undefined, audioUrl: formData.audioUrl || undefined } }, {
      onSuccess: () => {
        toast({ title: "Word added to dictionary" });
        queryClient.invalidateQueries({ queryKey: getListGenhalLanguageEntriesQueryKey(languageCode) });
        queryClient.invalidateQueries({ queryKey: getListGenhalLanguagesQueryKey() });
        onSuccess();
      },
      onError: () => {
        toast({ variant: "destructive", title: "Error adding word" });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="word">Word *</Label>
          <Input 
            id="word" 
            value={formData.word}
            onChange={(e) => setFormData({...formData, word: e.target.value})}
            required
            className="font-bold text-lg"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="translation">Translation (English) *</Label>
          <Input 
            id="translation" 
            value={formData.translation}
            onChange={(e) => setFormData({...formData, translation: e.target.value})}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Part of Speech</Label>
          <Select value={formData.partOfSpeech} onValueChange={(val) => setFormData({...formData, partOfSpeech: val})}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="noun">Noun</SelectItem>
              <SelectItem value="verb">Verb</SelectItem>
              <SelectItem value="adjective">Adjective</SelectItem>
              <SelectItem value="adverb">Adverb</SelectItem>
              <SelectItem value="pronoun">Pronoun</SelectItem>
              <SelectItem value="preposition">Preposition</SelectItem>
              <SelectItem value="conjunction">Conjunction</SelectItem>
              <SelectItem value="interjection">Interjection</SelectItem>
              <SelectItem value="phrase">Phrase</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pronunciation">Pronunciation (Phonetic)</Label>
          <Input 
            id="pronunciation" 
            value={formData.pronunciation}
            onChange={(e) => setFormData({...formData, pronunciation: e.target.value})}
            placeholder="e.g. o-bo-lo"
            className="font-mono"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="dialect">Dialect (Optional)</Label>
        <Input 
          id="dialect" 
          value={formData.dialect}
          onChange={(e) => setFormData({...formData, dialect: e.target.value})}
          placeholder="Specific region or dialect variant"
        />
      </div>

      <div className="space-y-4 bg-muted/30 p-4 rounded-xl border">
        <div className="space-y-2">
          <Label htmlFor="example">Example Sentence in Language</Label>
          <Textarea 
            id="example" 
            value={formData.example}
            onChange={(e) => setFormData({...formData, example: e.target.value})}
            rows={2}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="exampleTranslation">Example Translation (English)</Label>
          <Textarea 
            id="exampleTranslation" 
            value={formData.exampleTranslation}
            onChange={(e) => setFormData({...formData, exampleTranslation: e.target.value})}
            rows={2}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="audioUrl">Audio Pronunciation URL (Optional)</Label>
        <Input 
          id="audioUrl" 
          type="url"
          value={formData.audioUrl}
          onChange={(e) => setFormData({...formData, audioUrl: e.target.value})}
          placeholder="Link to audio file..."
        />
      </div>

      <div className="pt-4 flex justify-end">
        <Button type="submit" disabled={createEntry.isPending || !formData.word} className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-full px-8">
          {createEntry.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Add Word
        </Button>
      </div>
    </form>
  );
}