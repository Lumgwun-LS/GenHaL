import { useState, useEffect, lazy, Suspense } from 'react';
import { Link } from 'wouter';
import {
  Plus, MapPin, Users, ChevronRight, Search, Loader2, Home, Scroll, Crown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { getApiBaseUrl } from '@/lib/api';
import type { LocationValue } from '@/components/location-selector';

/*
 * country-state-city carries a 7.7 MB worldwide city table. Loading it
 * statically put the whole dataset in the entry bundle for every visitor,
 * including the ones who never open this dialog — so it is split out and
 * fetched when the form actually mounts.
 */
const LocationSelector = lazy(() => import('@/components/location-selector'));

interface Family {
  id: number; name: string; localName?: string; description?: string;
  country?: string; region?: string; district?: string;
  coverImageUrl?: string; emblemImageUrl?: string;
  isPublic: boolean; createdAt: string;
}

export default function FamiliesList() {
  const base = getApiBaseUrl();
  const { toast } = useToast();
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', localName: '', description: '', isPublic: false });
  const [location, setLocation] = useState<LocationValue>({ country:'', countryCode:'', region:'', regionCode:'', district:'' });

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetch(`${base}/genhal/families`).then(r => r.json());
      setFamilies(Array.isArray(data) ? data : []);
    } catch { toast({ variant: 'destructive', title: 'Failed to load' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const res = await fetch(`${base}/genhal/families`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, country: location.country, region: location.region, district: location.district }),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      toast({ title: `${form.name} family created!` });
      setCreating(false);
      setForm({ name:'', localName:'', description:'', isPublic: false });
      setLocation({ country:'', countryCode:'', region:'', regionCode:'', district:'' });
      load();
    } catch (err: any) { toast({ variant: 'destructive', title: err.message ?? 'Failed' }); }
    finally { setSaving(false); }
  };

  const filtered = families.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.country?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-stone-900 via-stone-800 to-amber-950 text-white p-8 md:p-12">
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23f59e0b' fill-opacity='1' fill-rule='evenodd'%3E%3Cpath d='M0 40L40 0H20L0 20M40 40V20L20 40'/%3E%3C/g%3E%3C/svg%3E")` }} />
        <div className="relative">
          <div className="flex items-center gap-2 text-amber-400 text-sm font-medium mb-3">
            <Home className="h-4 w-4" /> Family Registry
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-3">Family Accounts</h1>
          <p className="text-amber-100/75 text-lg max-w-2xl mb-6">
            Each family account has its own secure vault — store wills, land titles, birth records, family videos, and any document that matters. Members access documents based on their role.
          </p>
          <Button onClick={() => setCreating(true)} className="rounded-full bg-amber-500 hover:bg-amber-400 text-stone-900 font-semibold shadow-lg">
            <Plus className="mr-2 h-4 w-4" /> Create Family Account
          </Button>
        </div>
      </div>

      {/* Feature badges */}
      <div className="flex flex-wrap gap-3">
        {[
          { icon: <Scroll className="h-3.5 w-3.5" />, text: 'Store wills & testaments' },
          { icon: <Crown className="h-3.5 w-3.5" />, text: 'Role-based access control' },
          { icon: <Users className="h-3.5 w-3.5" />, text: 'Invite family members' },
          { icon: <MapPin className="h-3.5 w-3.5" />, text: 'Track family homeland' },
        ].map((b, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-full font-medium dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300">
            {b.icon} {b.text}
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search families…" className="pl-9 rounded-full" />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} {filtered.length === 1 ? 'family' : 'families'}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 rounded-3xl border border-dashed space-y-4">
          <Home className="h-14 w-14 text-muted mx-auto" />
          <div>
            <p className="font-serif text-2xl font-bold">No family accounts yet</p>
            <p className="text-muted-foreground mt-2 max-w-sm mx-auto">Create your family account and start preserving documents, photos, and history for future generations.</p>
          </div>
          <Button className="rounded-full" onClick={() => setCreating(true)}>Create your family account</Button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(f => (
            <Link key={f.id} href={`/families/${f.id}`}>
              <Card className="group cursor-pointer border hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                <div className="h-28 relative bg-gradient-to-br from-stone-800 to-amber-900 flex items-center justify-center">
                  {f.coverImageUrl
                    ? <img src={f.coverImageUrl} alt={f.name} className="w-full h-full object-cover opacity-75 group-hover:scale-105 transition-transform duration-500" />
                    : <Home className="h-10 w-10 text-amber-300/40" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  {!f.isPublic && <div className="absolute top-2 right-2 text-[10px] bg-stone-800/80 text-white px-2 py-0.5 rounded-full">Private</div>}
                </div>
                <CardContent className="p-4">
                  <h3 className="font-serif font-bold text-lg leading-tight group-hover:text-amber-700 transition-colors dark:group-hover:text-amber-300">{f.name}</h3>
                  {f.localName && <p className="text-xs text-muted-foreground italic mt-0.5">{f.localName}</p>}
                  {(f.district || f.region || f.country) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
                      <MapPin className="h-3 w-3" />
                      {[f.district, f.region, f.country].filter(Boolean).join(', ')}
                    </div>
                  )}
                  {f.description && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{f.description}</p>}
                  <div className="flex justify-end mt-3">
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-amber-600 transition-colors dark:group-hover:text-amber-300" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-[520px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Create Family Account</DialogTitle>
            <p className="text-sm text-muted-foreground">Your family gets a private vault, member roles, and a subscription plan.</p>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Family name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. The Okonkwo Family" className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label>Local / indigenous name</Label>
              <Input value={form.localName} onChange={e => setForm(f => ({ ...f, localName: e.target.value }))} placeholder="Name in the family's language" className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label>About this family</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief history or background…" rows={2} className="rounded-lg" />
            </div>

            <Suspense
              fallback={
                <div className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading locations…
                </div>
              }
            >
              <LocationSelector value={location} onChange={setLocation} />
            </Suspense>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-stone-50 border dark:bg-white/5">
              <Switch checked={form.isPublic} onCheckedChange={v => setForm(f => ({ ...f, isPublic: v }))} />
              <div>
                <p className="text-sm font-medium">Make family publicly discoverable</p>
                <p className="text-xs text-muted-foreground">Others can find and request to join this family</p>
              </div>
            </div>

            <Button className="w-full rounded-full bg-amber-600 hover:bg-amber-500 text-white" onClick={create} disabled={saving || !form.name}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Home className="mr-2 h-4 w-4" />}
              {saving ? 'Creating…' : 'Create Family Account'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
