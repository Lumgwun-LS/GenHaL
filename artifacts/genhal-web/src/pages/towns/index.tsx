import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import {
  Plus, MapPin, Crown, Users, Building2,
  Search, Globe2, Loader2, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { getApiBaseUrl } from '@/lib/api';

interface Town {
  id: number; name: string; localName?: string; country?: string;
  region?: string; district?: string; foundedYear?: number;
  description?: string; coverImageUrl?: string; emblemImageUrl?: string;
  rulerTitle: string; chiefTitle: string; languageCode?: string;
}

export default function TownsList() {
  const base = getApiBaseUrl();
  const { toast } = useToast();
  const [towns, setTowns] = useState<Town[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '', localName: '', country: '', region: '', district: '',
    foundedYear: '', description: '', rulerTitle: 'King', chiefTitle: 'Chief',
    languageCode: '',
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetch(`${base}/genhal/towns`).then(r => r.json());
      setTowns(Array.isArray(data) ? data : []);
    } catch { toast({ variant: 'destructive', title: 'Failed to load towns' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const res = await fetch(`${base}/genhal/towns`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: `${form.name} created!` });
      setCreating(false);
      setForm({ name:'',localName:'',country:'',region:'',district:'',foundedYear:'',description:'',rulerTitle:'King',chiefTitle:'Chief',languageCode:'' });
      load();
    } catch { toast({ variant: 'destructive', title: 'Failed to create town' }); }
    finally { setSaving(false); }
  };

  const filtered = towns.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.country?.toLowerCase().includes(search.toLowerCase()) ||
    t.region?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      {/* hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-900 via-amber-800 to-stone-900 text-white p-8 md:p-12">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #fbbf24 0%, transparent 60%), radial-gradient(circle at 80% 20%, #f59e0b 0%, transparent 50%)' }} />
        <div className="relative">
          <div className="flex items-center gap-2 text-amber-300 text-sm font-medium mb-3">
            <Crown className="h-4 w-4" /> Civic Heritage
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-3">Towns & Kingdoms</h1>
          <p className="text-amber-100/80 text-lg max-w-xl mb-6">
            Record the governance, compounds, families, and living heritage of every town — kings who ruled, chiefs who led, and the traditions that endure.
          </p>
          <Button onClick={() => setCreating(true)} className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
            <Plus className="mr-2 h-4 w-4" /> Add a Town
          </Button>
        </div>
      </div>

      {/* search + count */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search towns, regions…" className="pl-9 rounded-full" />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} {filtered.length === 1 ? 'town' : 'towns'}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 rounded-3xl border border-dashed space-y-4">
          <Building2 className="h-14 w-14 text-muted mx-auto" />
          <div>
            <p className="font-serif text-2xl font-bold">No towns yet</p>
            <p className="text-muted-foreground mt-2">Add a town to start recording its kings, compounds, and heritage.</p>
          </div>
          <Button className="rounded-full" onClick={() => setCreating(true)}>Add your first town</Button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(town => <TownCard key={town.id} town={town} />)}
        </div>
      )}

      {/* create dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Add a Town</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label>Town name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Ugwunshi" className="rounded-lg" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Local / indigenous name</Label>
                <Input value={form.localName} onChange={e => setForm(f => ({ ...f, localName: e.target.value }))} placeholder="Name in the local language" className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} placeholder="Nigeria" className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label>State / Region</Label>
                <Input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} placeholder="Rivers State" className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label>District / LGA</Label>
                <Input value={form.district} onChange={e => setForm(f => ({ ...f, district: e.target.value }))} placeholder="Eleme LGA" className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label>Year founded (approx.)</Label>
                <Input type="number" value={form.foundedYear} onChange={e => setForm(f => ({ ...f, foundedYear: e.target.value }))} placeholder="1450" className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label>Ruler title</Label>
                <Input value={form.rulerTitle} onChange={e => setForm(f => ({ ...f, rulerTitle: e.target.value }))} placeholder="King / Emir / Oba / Sultan" className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label>Compound chief title</Label>
                <Input value={form.chiefTitle} onChange={e => setForm(f => ({ ...f, chiefTitle: e.target.value }))} placeholder="Chief / Elder / Obi" className="rounded-lg" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief overview of the town's significance, origin, or character…" rows={3} className="rounded-lg" />
            </div>
            <Button className="w-full rounded-full bg-primary hover:bg-primary/90 text-primary-foreground" onClick={create} disabled={saving || !form.name}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crown className="mr-2 h-4 w-4" />}
              {saving ? 'Creating…' : 'Create Town'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TownCard({ town }: { town: Town }) {
  return (
    <Link href={`/towns/${town.id}`}>
      <Card className="group cursor-pointer border hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden" style={{ borderRadius: 'var(--theme-card-radius, 12px)' }}>
        <div className="h-36 bg-gradient-to-br from-amber-800 to-stone-700 relative flex items-center justify-center overflow-hidden">
          {town.coverImageUrl ? (
            <img src={town.coverImageUrl} alt={town.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <Crown className="h-12 w-12 text-amber-300/60" />
          )}
          {town.emblemImageUrl && (
            <div className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-white shadow-lg overflow-hidden border-2 border-amber-300 dark:bg-card dark:border-amber-500/30">
              <img src={town.emblemImageUrl} alt="emblem" className="w-full h-full object-contain p-0.5" />
            </div>
          )}
        </div>
        <CardContent className="p-5">
          <h3 className="font-serif font-bold text-lg leading-tight group-hover:text-primary transition-colors">{town.name}</h3>
          {town.localName && <p className="text-xs text-muted-foreground italic mt-0.5">{town.localName}</p>}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
            <MapPin className="h-3 w-3" />
            <span>{[town.district, town.region, town.country].filter(Boolean).join(', ') || 'Location not set'}</span>
          </div>
          <div className="flex items-center justify-between mt-3">
            <div className="flex gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Crown className="h-3 w-3" />{town.rulerTitle}</span>
              <span className="flex items-center gap-1"><Users className="h-3 w-3" />{town.chiefTitle}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-amber-600 transition-colors dark:group-hover:text-amber-300" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
