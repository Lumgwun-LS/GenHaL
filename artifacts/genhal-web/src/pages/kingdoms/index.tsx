import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import {
  Plus, MapPin, Crown, Users, Building2, ChevronRight,
  Search, Loader2, Globe2, Landmark, Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { getApiBaseUrl } from '@/lib/api';

interface Kingdom {
  id: number; name: string; localName?: string; unitType: string; unitTypeLabel?: string;
  country?: string; region?: string; district?: string; foundedYear?: number;
  description?: string; coverImageUrl?: string; emblemImageUrl?: string; rulerTitle: string;
}

const UNIT_TYPES = [
  { value: 'kingdom',   label: 'Kingdom' },
  { value: 'emirate',   label: 'Emirate' },
  { value: 'sultanate', label: 'Sultanate' },
  { value: 'chiefdom',  label: 'Chiefdom' },
  { value: 'clan',      label: 'Clan' },
  { value: 'custom',    label: 'Custom (define your own)' },
];

const RULER_TITLES: Record<string, string> = {
  kingdom: 'King', emirate: 'Emir', sultanate: 'Sultan',
  chiefdom: 'Chief', clan: 'Elder', custom: 'Ruler',
};

export default function KingdomsList() {
  const base = getApiBaseUrl();
  const { toast } = useToast();
  const [kingdoms, setKingdoms] = useState<Kingdom[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', localName: '', unitType: 'kingdom', unitTypeLabel: '',
    rulerTitle: 'King', country: '', region: '', district: '',
    foundedYear: '', description: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetch(`${base}/genhal/kingdoms`).then(r => r.json());
      setKingdoms(Array.isArray(data) ? data : []);
    } catch { toast({ variant: 'destructive', title: 'Failed to load' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // auto-fill ruler title when unit type changes
  const handleUnitTypeChange = (v: string) => {
    setForm(f => ({ ...f, unitType: v, rulerTitle: RULER_TITLES[v] ?? f.rulerTitle }));
  };

  const create = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const res = await fetch(`${base}/genhal/kingdoms`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: `${form.name} created!` });
      setCreating(false);
      setForm({ name:'',localName:'',unitType:'kingdom',unitTypeLabel:'',rulerTitle:'King',country:'',region:'',district:'',foundedYear:'',description:'' });
      load();
    } catch { toast({ variant: 'destructive', title: 'Failed to create' }); }
    finally { setSaving(false); }
  };

  const filtered = kingdoms.filter(k =>
    k.name.toLowerCase().includes(search.toLowerCase()) ||
    k.country?.toLowerCase().includes(search.toLowerCase()) ||
    k.region?.toLowerCase().includes(search.toLowerCase())
  );

  const unitLabel = (k: Kingdom) => {
    if (k.unitTypeLabel) return k.unitTypeLabel;
    return UNIT_TYPES.find(u => u.value === k.unitType)?.label ?? 'Kingdom';
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-stone-900 via-amber-950 to-stone-900 text-white p-8 md:p-12">
        <div className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23f59e0b' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }} />
        <div className="relative">
          <div className="flex items-center gap-2 text-amber-400 text-sm font-medium mb-3">
            <Landmark className="h-4 w-4" /> Civic Heritage
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-3">Kingdoms & Realms</h1>
          <p className="text-amber-100/75 text-lg max-w-2xl mb-6">
            Record any political structure — kingdoms, emirates, chiefdoms, clans — with its rulers, council of chiefs, compounds, towns, villages, CDC, and living heritage. Every ethnic group can define its own governance model.
          </p>
          <Button onClick={() => setCreating(true)} className="rounded-full bg-amber-500 hover:bg-amber-400 text-stone-900 font-semibold shadow-lg">
            <Plus className="mr-2 h-4 w-4" /> Add a Kingdom
          </Button>
        </div>
      </div>

      {/* search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search kingdoms, regions…" className="pl-9 rounded-full" />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 rounded-3xl border border-dashed space-y-4">
          <Landmark className="h-14 w-14 text-muted mx-auto" />
          <div>
            <p className="font-serif text-2xl font-bold">No kingdoms yet</p>
            <p className="text-muted-foreground mt-2 max-w-sm mx-auto">Add a kingdom, emirate, chiefdom, or any other political structure to begin recording its history.</p>
          </div>
          <Button className="rounded-full" onClick={() => setCreating(true)}>Add your first kingdom</Button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(k => (
            <Link key={k.id} href={`/kingdoms/${k.id}`}>
              <Card className="group cursor-pointer border hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                <div className="h-36 relative bg-gradient-to-br from-amber-900 to-stone-800 flex items-center justify-center overflow-hidden">
                  {k.coverImageUrl
                    ? <img src={k.coverImageUrl} alt={k.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-80" />
                    : <Landmark className="h-12 w-12 text-amber-300/40" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  {k.emblemImageUrl && (
                    <div className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-white shadow-lg overflow-hidden border-2 border-amber-300">
                      <img src={k.emblemImageUrl} alt="emblem" className="w-full h-full object-contain p-0.5" />
                    </div>
                  )}
                  <div className="absolute top-2 left-2">
                    <span className="text-[10px] font-semibold bg-amber-500/80 text-stone-900 px-2 py-0.5 rounded-full backdrop-blur-sm">{unitLabel(k)}</span>
                  </div>
                </div>
                <CardContent className="p-4">
                  <h3 className="font-serif font-bold text-lg leading-tight group-hover:text-amber-700 transition-colors">{k.name}</h3>
                  {k.localName && <p className="text-xs text-muted-foreground italic mt-0.5">{k.localName}</p>}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
                    <MapPin className="h-3 w-3" />
                    {[k.district, k.region, k.country].filter(Boolean).join(', ') || 'Location not set'}
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Crown className="h-3 w-3" />
                      <span>Ruled by a {k.rulerTitle}</span>
                      {k.foundedYear && <span>· Est. {k.foundedYear}</span>}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-amber-600 transition-colors" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Add a Kingdom / Realm</DialogTitle>
            <p className="text-sm text-muted-foreground">Works for any political structure — kingdom, emirate, chiefdom, clan, or custom.</p>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* unit type */}
            <div className="space-y-2">
              <Label>Type of political unit</Label>
              <div className="grid grid-cols-3 gap-2">
                {UNIT_TYPES.map(u => (
                  <button key={u.value} onClick={() => handleUnitTypeChange(u.value)}
                    className={`p-2.5 rounded-xl border text-sm text-left transition-all
                      ${form.unitType === u.value ? 'border-amber-500 bg-amber-50 font-semibold' : 'border-border hover:border-amber-300'}`}>
                    {u.label}
                  </button>
                ))}
              </div>
              {form.unitType === 'custom' && (
                <Input value={form.unitTypeLabel} onChange={e => setForm(f => ({ ...f, unitTypeLabel: e.target.value }))}
                  placeholder="e.g. Confederacy of…, Empire of…" className="rounded-lg mt-2" />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Benin Kingdom, Sokoto Emirate" className="rounded-lg" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Local / indigenous name</Label>
                <Input value={form.localName} onChange={e => setForm(f => ({ ...f, localName: e.target.value }))}
                  placeholder="Name in the local language" className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label>Ruler title</Label>
                <Input value={form.rulerTitle} onChange={e => setForm(f => ({ ...f, rulerTitle: e.target.value }))}
                  placeholder="King · Emir · Oba · Sultan · Chief" className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label>Year founded (approx.)</Label>
                <Input type="number" value={form.foundedYear} onChange={e => setForm(f => ({ ...f, foundedYear: e.target.value }))}
                  placeholder="1440" className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                  placeholder="Nigeria" className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label>State / Region</Label>
                <Input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                  placeholder="Edo State" className="rounded-lg" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief history, origin story, or significance…" rows={3} className="rounded-lg" />
            </div>
            <Button className="w-full rounded-full bg-amber-600 hover:bg-amber-500 text-white" onClick={create} disabled={saving || !form.name}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Landmark className="mr-2 h-4 w-4" />}
              {saving ? 'Creating…' : `Create ${UNIT_TYPES.find(u=>u.value===form.unitType)?.label ?? 'Kingdom'}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
