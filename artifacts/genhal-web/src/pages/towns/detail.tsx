import { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import {
  Crown, MapPin, Calendar, Plus, Pencil, Trash2, Users,
  Building2, BookOpen, Flame, Music, Sprout, TrendingUp,
  ChevronLeft, Loader2, X, Check, Globe2, Swords, Star,
  ArrowRight, Info, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { getApiBaseUrl } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Ruler {
  id: number; name: string; localName?: string; title: string;
  reignStart?: number; reignEnd?: number; isCurrent: boolean;
  bio?: string; achievements?: string; imageUrl?: string; successionNotes?: string;
}
interface Chief {
  id: number; name: string; localName?: string; title: string;
  reignStart?: number; reignEnd?: number; isCurrent: boolean;
  bio?: string; imageUrl?: string; successionNotes?: string;
}
interface Compound {
  id: number; name: string; localName?: string; description?: string;
  imageUrl?: string; chiefTitle?: string; chiefs: Chief[];
}
interface TownRecord {
  id: number; type: string; title: string; content?: string;
  period?: string; imageUrl?: string; tags: string[];
}
interface Town {
  id: number; name: string; localName?: string; country?: string;
  region?: string; district?: string; foundedYear?: number;
  description?: string; coverImageUrl?: string; emblemImageUrl?: string;
  rulerTitle: string; chiefTitle: string; languageCode?: string;
  rulers: Ruler[]; compounds: Compound[]; records: TownRecord[];
}

// ─── Record type meta ─────────────────────────────────────────────────────────
const RECORD_TYPES: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  history:           { label: 'History',           icon: <BookOpen className="h-4 w-4" />,    color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30' },
  tradition:         { label: 'Tradition',         icon: <Globe2 className="h-4 w-4" />,      color: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30' },
  festival:          { label: 'Festival',          icon: <Flame className="h-4 w-4" />,       color: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30' },
  ceremony:          { label: 'Ceremony',          icon: <Star className="h-4 w-4" />,        color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30' },
  natural_resource:  { label: 'Natural Resource',  icon: <Sprout className="h-4 w-4" />,      color: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30' },
  economic_activity: { label: 'Economic Activity', icon: <TrendingUp className="h-4 w-4" />,  color: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30' },
};

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function TownDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const base = getApiBaseUrl();
  const { toast } = useToast();

  const [town, setTown] = useState<Town | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  // dialogs
  const [rulerDialog, setRulerDialog]     = useState(false);
  const [compoundDialog, setCompoundDialog] = useState(false);
  const [chiefDialog, setChiefDialog]     = useState<number | null>(null); // compound id
  const [recordDialog, setRecordDialog]   = useState(false);
  const [selectedCompound, setSelectedCompound] = useState<Compound | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch(`${base}/genhal/towns/${id}`).then(r => r.json());
      if (data.error) { toast({ variant:'destructive', title:'Town not found' }); navigate('/towns'); return; }
      setTown(data);
    } catch { toast({ variant:'destructive', title:'Failed to load' }); }
    finally { setLoading(false); }
  }, [id, base]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex justify-center py-40"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
  );
  if (!town) return null;

  const byType = (type: string) => town.records.filter(r => r.type === type);
  const heritageTypes = ['history','tradition','festival','ceremony'];
  const resourceTypes = ['natural_resource','economic_activity'];

  return (
    <div className="space-y-0 pb-16 -mx-4 md:-mx-8 animate-in fade-in duration-500">
      {/* Hero banner */}
      <div className="relative h-56 md:h-72 bg-gradient-to-br from-amber-900 via-stone-800 to-amber-950 overflow-hidden">
        {town.coverImageUrl && (
          <img src={town.coverImageUrl} alt={town.name} className="absolute inset-0 w-full h-full object-cover opacity-40" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
          <button onClick={() => navigate('/towns')} className="flex items-center gap-1 text-white/70 hover:text-white text-sm mb-3 transition-colors">
            <ChevronLeft className="h-4 w-4" /> All Towns
          </button>
          <div className="flex items-end gap-4">
            {town.emblemImageUrl && (
              <div className="w-16 h-16 rounded-xl bg-white shadow-xl overflow-hidden border-2 border-amber-300 shrink-0 dark:bg-card dark:border-amber-500/30">
                <img src={town.emblemImageUrl} alt="emblem" className="w-full h-full object-contain p-1" />
              </div>
            )}
            <div>
              <h1 className="text-3xl md:text-5xl font-serif font-bold text-white">{town.name}</h1>
              {town.localName && <p className="text-amber-300 text-lg italic mt-0.5">{town.localName}</p>}
              <div className="flex flex-wrap gap-3 mt-2 text-sm text-white/70">
                {(town.district || town.region || town.country) && (
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[town.district,town.region,town.country].filter(Boolean).join(', ')}</span>
                )}
                {town.foundedYear && (
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Est. {town.foundedYear}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* stat ribbon */}
      <div className="bg-amber-50 border-y border-amber-200 px-6 md:px-10 py-3 flex gap-6 text-sm overflow-x-auto dark:bg-amber-500/10 dark:border-amber-500/30">
        {[
          { label: `${town.rulerTitle}s`, value: town.rulers.length, icon: <Crown className="h-3.5 w-3.5" /> },
          { label: 'Compounds', value: town.compounds.length, icon: <Building2 className="h-3.5 w-3.5" /> },
          { label: 'Heritage Records', value: town.records.filter(r=>heritageTypes.includes(r.type)).length, icon: <BookOpen className="h-3.5 w-3.5" /> },
          { label: 'Resources', value: town.records.filter(r=>resourceTypes.includes(r.type)).length, icon: <Sprout className="h-3.5 w-3.5" /> },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-1.5 text-amber-800 shrink-0 dark:text-amber-300">
            {s.icon}<span className="font-bold">{s.value}</span><span className="text-amber-700 dark:text-amber-300">{s.label}</span>
          </div>
        ))}
      </div>

      {/* tabs */}
      <div className="px-4 md:px-8 mt-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="rounded-xl bg-muted/60 p-1 mb-8 flex-wrap h-auto gap-1">
            <TabsTrigger value="overview" className="rounded-lg">Overview</TabsTrigger>
            <TabsTrigger value="rulers" className="rounded-lg">
              {town.rulerTitle}s ({town.rulers.length})
            </TabsTrigger>
            <TabsTrigger value="compounds" className="rounded-lg">
              Compounds ({town.compounds.length})
            </TabsTrigger>
            <TabsTrigger value="heritage" className="rounded-lg">Heritage</TabsTrigger>
            <TabsTrigger value="resources" className="rounded-lg">Resources</TabsTrigger>
          </TabsList>

          {/* ── OVERVIEW ── */}
          <TabsContent value="overview" className="space-y-6">
            {town.description && (
              <Card className="border-0 bg-amber-50/50 shadow-sm dark:bg-amber-500/10">
                <CardContent className="p-6">
                  <p className="text-foreground/80 leading-relaxed text-lg">{town.description}</p>
                </CardContent>
              </Card>
            )}
            <div className="grid md:grid-cols-3 gap-4">
              <InfoCard icon={<Crown className="h-5 w-5 text-amber-600 dark:text-amber-300" />} label={`Current ${town.rulerTitle}`}
                value={town.rulers.find(r=>r.isCurrent)?.name ?? '—'} />
              <InfoCard icon={<Building2 className="h-5 w-5 text-stone-600 dark:text-muted-foreground" />} label="Compounds"
                value={`${town.compounds.length} recorded`} />
              <InfoCard icon={<Globe2 className="h-5 w-5 text-blue-600 dark:text-blue-300" />} label="Language"
                value={town.languageCode?.toUpperCase() ?? '—'} />
            </div>
            {/* quick-add buttons */}
            <div className="flex flex-wrap gap-3 pt-2">
              <Button variant="outline" className="rounded-full" onClick={() => { setTab('rulers'); setRulerDialog(true); }}>
                <Crown className="mr-1.5 h-4 w-4" /> Add {town.rulerTitle}
              </Button>
              <Button variant="outline" className="rounded-full" onClick={() => { setTab('compounds'); setCompoundDialog(true); }}>
                <Building2 className="mr-1.5 h-4 w-4" /> Add Compound
              </Button>
              <Button variant="outline" className="rounded-full" onClick={() => { setTab('heritage'); setRecordDialog(true); }}>
                <BookOpen className="mr-1.5 h-4 w-4" /> Add Heritage Record
              </Button>
            </div>
          </TabsContent>

          {/* ── RULERS / KINGS ── */}
          <TabsContent value="rulers" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-serif text-2xl font-bold">{town.rulerTitle} Lineage</h2>
                <p className="text-muted-foreground text-sm mt-0.5">Succession timeline from earliest to present</p>
              </div>
              <Button className="rounded-full bg-amber-600 hover:bg-amber-500 text-white" onClick={() => setRulerDialog(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Add {town.rulerTitle}
              </Button>
            </div>

            {town.rulers.length === 0 ? (
              <EmptyState icon={<Crown className="h-10 w-10" />} label={`No ${town.rulerTitle.toLowerCase()}s recorded`}
                action="Add the first ruler" onAction={() => setRulerDialog(true)} />
            ) : (
              <div className="relative">
                {/* timeline spine */}
                <div className="absolute left-7 top-0 bottom-0 w-0.5 bg-amber-200 dark:bg-amber-500/20" />
                <div className="space-y-4">
                  {town.rulers.map((ruler, i) => (
                    <div key={ruler.id} className="relative flex gap-5 pl-3">
                      {/* dot */}
                      <div className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow
                        ${ruler.isCurrent ? 'bg-amber-500 text-white' : 'bg-white border-2 border-amber-300 text-amber-600 dark:bg-card dark:border-amber-500/30 dark:text-amber-300'}`}>
                        {ruler.imageUrl
                          ? <img src={ruler.imageUrl} alt={ruler.name} className="w-full h-full rounded-full object-cover" />
                          : <Crown className="h-4 w-4" />}
                      </div>
                      <Card className={`flex-1 border shadow-sm ${ruler.isCurrent ? 'border-amber-300 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10' : ''}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-serif font-bold text-base">{ruler.title} {ruler.name}</span>
                                {ruler.localName && <span className="text-sm text-muted-foreground italic">({ruler.localName})</span>}
                                {ruler.isCurrent && <Badge className="bg-amber-500 text-white text-[10px] px-2">Current</Badge>}
                              </div>
                              <p className="text-sm text-muted-foreground mt-0.5">
                                {ruler.reignStart && ruler.reignEnd
                                  ? `${ruler.reignStart} – ${ruler.reignEnd} (${ruler.reignEnd - ruler.reignStart} yrs)`
                                  : ruler.reignStart
                                  ? `${ruler.reignStart} – present`
                                  : 'Reign dates unknown'}
                              </p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive/60 hover:text-destructive"
                              onClick={async () => {
                                if (!confirm(`Delete ${ruler.name}?`)) return;
                                await fetch(`${base}/genhal/towns/${id}/rulers/${ruler.id}`, { method: 'DELETE' });
                                load();
                              }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {ruler.bio && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{ruler.bio}</p>}
                          {ruler.achievements && (
                            <p className="text-sm mt-2 text-foreground/70">
                              <span className="font-medium">Achievements: </span>{ruler.achievements}
                            </p>
                          )}
                          {ruler.successionNotes && (
                            <p className="text-xs text-muted-foreground mt-1 italic">Succession: {ruler.successionNotes}</p>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── COMPOUNDS ── */}
          <TabsContent value="compounds" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-serif text-2xl font-bold">Compounds</h2>
                <p className="text-muted-foreground text-sm mt-0.5">Family quarters and their {town.chiefTitle.toLowerCase()} lineages</p>
              </div>
              <Button className="rounded-full bg-amber-600 hover:bg-amber-500 text-white" onClick={() => setCompoundDialog(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Compound
              </Button>
            </div>

            {town.compounds.length === 0 ? (
              <EmptyState icon={<Building2 className="h-10 w-10" />} label="No compounds recorded"
                action="Add the first compound" onAction={() => setCompoundDialog(true)} />
            ) : (
              <div className="grid md:grid-cols-2 gap-5">
                {town.compounds.map(compound => (
                  <CompoundCard key={compound.id}
                    compound={compound}
                    defaultChiefTitle={town.chiefTitle}
                    townId={Number(id)}
                    base={base}
                    onAddChief={() => { setSelectedCompound(compound); setChiefDialog(compound.id); }}
                    onDelete={async () => {
                      if (!confirm(`Delete ${compound.name}?`)) return;
                      await fetch(`${base}/genhal/towns/${id}/compounds/${compound.id}`, { method: 'DELETE' });
                      load();
                    }}
                    onChiefDelete={async (chiefId) => {
                      await fetch(`${base}/genhal/towns/${id}/compounds/${compound.id}/chiefs/${chiefId}`, { method: 'DELETE' });
                      load();
                    }}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── HERITAGE ── */}
          <TabsContent value="heritage" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-serif text-2xl font-bold">Heritage & Culture</h2>
                <p className="text-muted-foreground text-sm">History, traditions, festivals, and ceremonies</p>
              </div>
              <Button className="rounded-full bg-amber-600 hover:bg-amber-500 text-white" onClick={() => setRecordDialog(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Record
              </Button>
            </div>
            {heritageTypes.every(t => byType(t).length === 0) ? (
              <EmptyState icon={<BookOpen className="h-10 w-10" />} label="No heritage records yet"
                action="Add history, traditions, festivals, or ceremonies" onAction={() => setRecordDialog(true)} />
            ) : (
              <div className="space-y-8">
                {heritageTypes.filter(t => byType(t).length > 0).map(type => (
                  <div key={type}>
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium mb-4 ${RECORD_TYPES[type].color}`}>
                      {RECORD_TYPES[type].icon} {RECORD_TYPES[type].label}s
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      {byType(type).map(record => (
                        <RecordCard key={record.id} record={record} townId={Number(id)} base={base} onDelete={load} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── RESOURCES ── */}
          <TabsContent value="resources" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-serif text-2xl font-bold">Resources & Economy</h2>
                <p className="text-muted-foreground text-sm">Natural wealth and economic life of {town.name}</p>
              </div>
              <Button className="rounded-full bg-amber-600 hover:bg-amber-500 text-white" onClick={() => setRecordDialog(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Record
              </Button>
            </div>
            {resourceTypes.every(t => byType(t).length === 0) ? (
              <EmptyState icon={<Sprout className="h-10 w-10" />} label="No resource records yet"
                action="Add natural resources or economic activities" onAction={() => setRecordDialog(true)} />
            ) : (
              <div className="grid md:grid-cols-2 gap-8">
                {resourceTypes.filter(t => byType(t).length > 0).map(type => (
                  <div key={type}>
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium mb-4 ${RECORD_TYPES[type].color}`}>
                      {RECORD_TYPES[type].icon} {RECORD_TYPES[type].label}
                    </div>
                    <div className="space-y-3">
                      {byType(type).map(record => (
                        <RecordCard key={record.id} record={record} townId={Number(id)} base={base} onDelete={load} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Dialogs ── */}
      <AddRulerDialog open={rulerDialog} onOpenChange={setRulerDialog}
        townId={Number(id)} rulerTitle={town.rulerTitle} base={base}
        onSuccess={() => { setRulerDialog(false); load(); }} />

      <AddCompoundDialog open={compoundDialog} onOpenChange={setCompoundDialog}
        townId={Number(id)} chiefTitle={town.chiefTitle} base={base}
        onSuccess={() => { setCompoundDialog(false); load(); }} />

      {chiefDialog !== null && (
        <AddChiefDialog open compoundId={chiefDialog}
          compound={selectedCompound}
          townId={Number(id)} chiefTitle={selectedCompound?.chiefTitle ?? town.chiefTitle}
          base={base} onOpenChange={() => setChiefDialog(null)}
          onSuccess={() => { setChiefDialog(null); load(); }} />
      )}

      <AddRecordDialog open={recordDialog} onOpenChange={setRecordDialog}
        townId={Number(id)} base={base}
        onSuccess={() => { setRecordDialog(false); load(); }} />
    </div>
  );
}

// ─── CompoundCard ─────────────────────────────────────────────────────────────
function CompoundCard({ compound, defaultChiefTitle, townId, base, onAddChief, onDelete, onChiefDelete }: {
  compound: Compound; defaultChiefTitle: string; townId: number; base: string;
  onAddChief: () => void; onDelete: () => void; onChiefDelete: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const chiefTitle = compound.chiefTitle ?? defaultChiefTitle;
  const current = compound.chiefs.find(c => c.isCurrent);
  return (
    <Card className="border shadow-sm overflow-hidden">
      <div className="h-24 bg-gradient-to-br from-stone-700 to-amber-900 relative flex items-center justify-center">
        {compound.imageUrl
          ? <img src={compound.imageUrl} alt={compound.name} className="w-full h-full object-cover opacity-70" />
          : <Building2 className="h-8 w-8 text-white/40" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between">
          <div>
            <h3 className="font-serif font-bold text-white text-sm">{compound.name}</h3>
            {compound.localName && <p className="text-white/60 text-[10px] italic">{compound.localName}</p>}
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-white/60 hover:text-red-400" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <CardContent className="p-4 space-y-3">
        {compound.description && <p className="text-sm text-muted-foreground line-clamp-2">{compound.description}</p>}
        {/* current chief */}
        <div className="flex items-center gap-2 text-sm">
          <Crown className="h-3.5 w-3.5 text-amber-600 shrink-0 dark:text-amber-300" />
          {current
            ? <span><span className="font-medium">{current.title} {current.name}</span> <span className="text-muted-foreground">(current {chiefTitle.toLowerCase()})</span></span>
            : <span className="text-muted-foreground">No current {chiefTitle.toLowerCase()} recorded</span>}
        </div>
        {/* chief count */}
        <div className="flex items-center justify-between">
          <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-600 font-medium dark:text-amber-300 dark:hover:text-amber-300">
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {compound.chiefs.length} {chiefTitle.toLowerCase()}{compound.chiefs.length !== 1 ? 's' : ''} in lineage
          </button>
          <Button variant="outline" size="sm" className="h-7 rounded-full text-xs" onClick={onAddChief}>
            <Plus className="mr-1 h-3 w-3" /> Add {chiefTitle}
          </Button>
        </div>
        {/* chief timeline */}
        {open && compound.chiefs.length > 0 && (
          <div className="pt-1 space-y-2 border-t">
            {compound.chiefs.map(chief => (
              <div key={chief.id} className={`flex items-center gap-2.5 p-2 rounded-lg text-sm
                ${chief.isCurrent ? 'bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30' : 'bg-muted/30'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold
                  ${chief.isCurrent ? 'bg-amber-500 text-white' : 'bg-stone-200 text-stone-600 dark:bg-white/[0.14] dark:text-muted-foreground'}`}>
                  {chief.isCurrent ? '★' : '○'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{chief.title} {chief.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {chief.reignStart && chief.reignEnd ? `${chief.reignStart}–${chief.reignEnd}` : chief.reignStart ? `${chief.reignStart}–present` : 'Dates unknown'}
                  </p>
                </div>
                <button onClick={() => onChiefDelete(chief.id)} className="text-muted-foreground/50 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── RecordCard ───────────────────────────────────────────────────────────────
function RecordCard({ record, townId, base, onDelete }: {
  record: TownRecord; townId: number; base: string; onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = RECORD_TYPES[record.type] ?? RECORD_TYPES.history;
  return (
    <Card className="border shadow-sm group">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold text-foreground">{record.title}</h4>
              {record.period && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{record.period}</span>}
            </div>
            {record.content && (
              <p className={`text-sm text-muted-foreground mt-1.5 ${expanded ? '' : 'line-clamp-3'}`}>{record.content}</p>
            )}
            {record.content && record.content.length > 180 && (
              <button onClick={() => setExpanded(e => !e)} className="text-xs text-amber-700 hover:text-amber-600 mt-1 font-medium dark:text-amber-300 dark:hover:text-amber-300">
                {expanded ? 'Show less' : 'Read more'}
              </button>
            )}
            {record.tags?.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-2">
                {record.tags.map(t => <span key={t} className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{t}</span>)}
              </div>
            )}
          </div>
          <button
            onClick={async () => {
              if (!confirm(`Delete "${record.title}"?`)) return;
              await fetch(`${base}/genhal/towns/${townId}/records/${record.id}`, { method: 'DELETE' });
              onDelete();
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/50 hover:text-destructive shrink-0">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Add dialogs ──────────────────────────────────────────────────────────────
function AddRulerDialog({ open, onOpenChange, townId, rulerTitle, base, onSuccess }: {
  open: boolean; onOpenChange: (v:boolean)=>void; townId: number; rulerTitle: string; base: string; onSuccess: ()=>void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name:'', localName:'', title: rulerTitle, reignStart:'', reignEnd:'', isCurrent: false, bio:'', achievements:'', successionNotes:'' });
  const submit = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      await fetch(`${base}/genhal/towns/${townId}/rulers`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form),
      });
      toast({ title: `${form.title} ${form.name} added!` });
      onSuccess();
    } catch { toast({ variant:'destructive', title:'Failed' }); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-serif text-xl">Add {rulerTitle}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder={`${rulerTitle}'s name`} className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label>Local name</Label>
              <Input value={form.localName} onChange={e=>setForm(f=>({...f,localName:e.target.value}))} className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label>Reign start (year)</Label>
              <Input type="number" value={form.reignStart} onChange={e=>setForm(f=>({...f,reignStart:e.target.value}))} placeholder="1820" className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label>Reign end (year)</Label>
              <Input type="number" value={form.reignEnd} onChange={e=>setForm(f=>({...f,reignEnd:e.target.value}))} placeholder="Leave blank if current" className="rounded-lg" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.isCurrent} onCheckedChange={v=>setForm(f=>({...f,isCurrent:v}))} />
            <Label>This is the current {rulerTitle.toLowerCase()}</Label>
          </div>
          <div className="space-y-1.5">
            <Label>Biography</Label>
            <Textarea value={form.bio} onChange={e=>setForm(f=>({...f,bio:e.target.value}))} placeholder={`Background of ${form.name || 'this ruler'}…`} rows={2} className="rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label>Achievements</Label>
            <Textarea value={form.achievements} onChange={e=>setForm(f=>({...f,achievements:e.target.value}))} placeholder="Key accomplishments during their reign…" rows={2} className="rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label>Succession notes</Label>
            <Input value={form.successionNotes} onChange={e=>setForm(f=>({...f,successionNotes:e.target.value}))} placeholder="How they came to power…" className="rounded-lg" />
          </div>
          <Button className="w-full rounded-full bg-amber-600 hover:bg-amber-500 text-white" onClick={submit} disabled={saving||!form.name}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crown className="mr-2 h-4 w-4" />}
            {saving ? 'Saving…' : `Add ${rulerTitle}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddCompoundDialog({ open, onOpenChange, townId, chiefTitle, base, onSuccess }: {
  open: boolean; onOpenChange: (v:boolean)=>void; townId: number; chiefTitle: string; base: string; onSuccess: ()=>void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name:'', localName:'', description:'', chiefTitle:'' });
  const submit = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      await fetch(`${base}/genhal/towns/${townId}/compounds`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form),
      });
      toast({ title: `${form.name} compound added!` });
      onSuccess();
    } catch { toast({ variant:'destructive', title:'Failed' }); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader><DialogTitle className="font-serif text-xl">Add Compound</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Compound name *</Label>
            <Input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Abia Compound" className="rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label>Local name</Label>
            <Input value={form.localName} onChange={e=>setForm(f=>({...f,localName:e.target.value}))} className="rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label>Chief / leader title (if different from town default)</Label>
            <Input value={form.chiefTitle} onChange={e=>setForm(f=>({...f,chiefTitle:e.target.value}))} placeholder={chiefTitle} className="rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={2} className="rounded-lg" />
          </div>
          <Button className="w-full rounded-full bg-amber-600 hover:bg-amber-500 text-white" onClick={submit} disabled={saving||!form.name}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Building2 className="mr-2 h-4 w-4" />}
            {saving ? 'Saving…' : 'Add Compound'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddChiefDialog({ open, onOpenChange, compoundId, compound, townId, chiefTitle, base, onSuccess }: {
  open: boolean; onOpenChange: (v:boolean)=>void; compoundId: number; compound: Compound|null;
  townId: number; chiefTitle: string; base: string; onSuccess: ()=>void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name:'', localName:'', title: chiefTitle, reignStart:'', reignEnd:'', isCurrent: false, bio:'', successionNotes:'' });
  const submit = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      await fetch(`${base}/genhal/towns/${townId}/compounds/${compoundId}/chiefs`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form),
      });
      toast({ title: `${form.title} ${form.name} added!` });
      onSuccess();
    } catch { toast({ variant:'destructive', title:'Failed' }); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Add {chiefTitle} — {compound?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label>Local name</Label>
              <Input value={form.localName} onChange={e=>setForm(f=>({...f,localName:e.target.value}))} className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label>Reign start</Label>
              <Input type="number" value={form.reignStart} onChange={e=>setForm(f=>({...f,reignStart:e.target.value}))} placeholder="1910" className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label>Reign end</Label>
              <Input type="number" value={form.reignEnd} onChange={e=>setForm(f=>({...f,reignEnd:e.target.value}))} placeholder="Leave blank if current" className="rounded-lg" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.isCurrent} onCheckedChange={v=>setForm(f=>({...f,isCurrent:v}))} />
            <Label>This is the current {chiefTitle.toLowerCase()}</Label>
          </div>
          <div className="space-y-1.5">
            <Label>Biography</Label>
            <Textarea value={form.bio} onChange={e=>setForm(f=>({...f,bio:e.target.value}))} rows={2} className="rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label>Succession notes</Label>
            <Input value={form.successionNotes} onChange={e=>setForm(f=>({...f,successionNotes:e.target.value}))} className="rounded-lg" />
          </div>
          <Button className="w-full rounded-full bg-amber-600 hover:bg-amber-500 text-white" onClick={submit} disabled={saving||!form.name}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {saving ? 'Saving…' : `Add ${chiefTitle}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddRecordDialog({ open, onOpenChange, townId, base, onSuccess }: {
  open: boolean; onOpenChange: (v:boolean)=>void; townId: number; base: string; onSuccess: ()=>void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ type:'history', title:'', content:'', period:'' });
  const submit = async () => {
    if (!form.title) return;
    setSaving(true);
    try {
      await fetch(`${base}/genhal/towns/${townId}/records`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form),
      });
      toast({ title: `"${form.title}" recorded!` });
      onSuccess();
    } catch { toast({ variant:'destructive', title:'Failed' }); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-serif text-xl">Add Heritage or Resource Record</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Record type *</Label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(RECORD_TYPES).map(([key, m]) => (
                <button key={key} onClick={()=>setForm(f=>({...f,type:key}))}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-sm text-left transition-all
                    ${form.type===key ? 'border-amber-500 bg-amber-50 font-medium dark:border-amber-500/50 dark:bg-amber-500/10' : 'border-border hover:border-amber-300 dark:hover:border-amber-500/30'}`}>
                  <span className={`p-1.5 rounded-lg ${m.color}`}>{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. New Yam Festival, Palm Oil Trade, Elders' Council" className="rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label>Period / timing</Label>
            <Input value={form.period} onChange={e=>setForm(f=>({...f,period:e.target.value}))} placeholder="Annually in August · Pre-colonial era · 17th century" className="rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={form.content} onChange={e=>setForm(f=>({...f,content:e.target.value}))} placeholder="Detailed description of this heritage record…" rows={4} className="rounded-lg" />
          </div>
          <Button className="w-full rounded-full bg-amber-600 hover:bg-amber-500 text-white" onClick={submit} disabled={saving||!form.title}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {saving ? 'Saving…' : 'Add Record'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-100 dark:bg-amber-500/10 dark:border-amber-500/30">{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-semibold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon, label, action, onAction }: { icon: React.ReactNode; label: string; action: string; onAction: ()=>void }) {
  return (
    <div className="text-center py-16 rounded-2xl border border-dashed space-y-4">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">{icon}</div>
      <p className="font-serif text-xl font-bold">{label}</p>
      <Button className="rounded-full" onClick={onAction}>{action}</Button>
    </div>
  );
}
