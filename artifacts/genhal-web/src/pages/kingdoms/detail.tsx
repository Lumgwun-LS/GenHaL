import { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import {
  Crown, MapPin, Calendar, Plus, Trash2, Users, Building2, BookOpen,
  Flame, Sprout, TrendingUp, ChevronLeft, Loader2, X, Globe2, Star,
  Landmark, ShieldCheck, ChevronDown, ChevronUp, Vote, UserCheck,
  Mountain, Home, ArrowRight, FileText, CreditCard,
} from 'lucide-react';
import VaultTab from '@/pages/vault/index';
import MembersTab from '@/pages/members/index';
import SubscriptionTab from '@/pages/subscription/index';
import SecretAccountsTab from '@/pages/accounts/index';
import ClaimsTab from '@/pages/claims/index';
import PublicGallery from '@/pages/vault/public-gallery';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { getApiBaseUrl } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Ruler { id:number; name:string; localName?:string; title:string; reignStart?:number; reignEnd?:number; isCurrent:boolean; bio?:string; achievements?:string; imageUrl?:string; successionNotes?:string; }
interface Chief { id:number; name:string; localName?:string; title:string; reignStart?:number; reignEnd?:number; isCurrent:boolean; bio?:string; successionNotes?:string; }
interface Compound { id:number; name:string; localName?:string; description?:string; chiefTitle:string; chiefs:Chief[]; }
interface Village { id:number; name:string; localName?:string; description?:string; townId?:number; }
interface Town { id:number; name:string; localName?:string; description?:string; villages:Village[]; }
interface CouncilMember { id:number; name:string; title:string; role:string; compoundId?:number; joinedYear?:number; leftYear?:number; isCurrent:boolean; imageUrl?:string; }
interface CdcMember { id:number; name:string; role:string; electedYear?:number; bio?:string; }
interface CdcCommittee { id:number; unitType:string; unitId:number; name:string; termStart?:number; termEnd?:number; isCurrent:boolean; mandate?:string; members:CdcMember[]; }
interface CivicRecord { id:number; type:string; unitType:string; unitId?:number; title:string; content?:string; period?:string; tags:string[]; }
interface Kingdom {
  id:number; name:string; localName?:string; unitType:string; unitTypeLabel?:string;
  country?:string; region?:string; district?:string; foundedYear?:number;
  description?:string; coverImageUrl?:string; emblemImageUrl?:string; rulerTitle:string;
  rulers:Ruler[]; towns:Town[]; directVillages:Village[]; compounds:Compound[];
  council:CouncilMember[]; cdc:CdcCommittee[]; records:CivicRecord[];
}

const RECORD_TYPES: Record<string, { label:string; icon:React.ReactNode; color:string }> = {
  history:           { label:'History',           icon:<BookOpen className="h-4 w-4"/>,   color:'bg-blue-100 text-blue-700 border-blue-200' },
  tradition:         { label:'Tradition',         icon:<Globe2 className="h-4 w-4"/>,     color:'bg-purple-100 text-purple-700 border-purple-200' },
  festival:          { label:'Festival',          icon:<Flame className="h-4 w-4"/>,      color:'bg-orange-100 text-orange-700 border-orange-200' },
  ceremony:          { label:'Ceremony',          icon:<Star className="h-4 w-4"/>,       color:'bg-amber-100 text-amber-700 border-amber-200' },
  natural_resource:  { label:'Natural Resource',  icon:<Sprout className="h-4 w-4"/>,     color:'bg-green-100 text-green-700 border-green-200' },
  economic_activity: { label:'Economic Activity', icon:<TrendingUp className="h-4 w-4"/>, color:'bg-teal-100 text-teal-700 border-teal-200' },
};

function unitDisplayName(k: Kingdom) {
  if (k.unitTypeLabel) return k.unitTypeLabel;
  const map: Record<string,string> = { kingdom:'Kingdom', emirate:'Emirate', sultanate:'Sultanate', chiefdom:'Chiefdom', clan:'Clan', custom:'Realm' };
  return map[k.unitType] ?? 'Kingdom';
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function KingdomDetail() {
  const { id } = useParams<{ id:string }>();
  const [, navigate] = useLocation();
  const base = getApiBaseUrl();
  const { toast } = useToast();

  const [kingdom, setKingdom] = useState<Kingdom | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  // dialog state
  const [dlg, setDlg] = useState<string | null>(null);
  const [selectedCompound, setSelectedCompound] = useState<Compound | null>(null);
  const [selectedCdc, setSelectedCdc] = useState<CdcCommittee | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch(`${base}/genhal/kingdoms/${id}`).then(r => r.json());
      if (data.error) { navigate('/kingdoms'); return; }
      setKingdom(data);
    } catch { toast({ variant:'destructive', title:'Failed to load' }); }
    finally { setLoading(false); }
  }, [id, base]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-40"><Loader2 className="h-10 w-10 animate-spin text-primary"/></div>;
  if (!kingdom) return null;

  const heritageTypes = ['history','tradition','festival','ceremony'];
  const resourceTypes = ['natural_resource','economic_activity'];
  const byType = (t:string) => kingdom.records.filter(r=>r.type===t && r.unitType==='kingdom');
  const kingdomCdc = kingdom.cdc.filter(c=>c.unitType==='kingdom');
  const currentRuler = kingdom.rulers.find(r=>r.isCurrent);

  const del = async (url:string, label:string) => {
    if (!confirm(`Delete ${label}?`)) return;
    await fetch(`${base}${url}`, { method:'DELETE' });
    load();
  };

  return (
    <div className="space-y-0 pb-16 -mx-4 md:-mx-8 animate-in fade-in duration-500">
      {/* ── Hero ── */}
      <div className="relative h-64 md:h-80 bg-gradient-to-br from-stone-900 via-amber-950 to-stone-900 overflow-hidden">
        {kingdom.coverImageUrl && <img src={kingdom.coverImageUrl} alt={kingdom.name} className="absolute inset-0 w-full h-full object-cover opacity-35"/>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"/>
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
          <button onClick={()=>navigate('/kingdoms')} className="flex items-center gap-1 text-white/60 hover:text-white text-sm mb-3">
            <ChevronLeft className="h-4 w-4"/> All Kingdoms
          </button>
          <div className="flex items-end gap-4">
            {kingdom.emblemImageUrl && (
              <div className="w-16 h-16 rounded-xl bg-white shadow-xl overflow-hidden border-2 border-amber-400 shrink-0">
                <img src={kingdom.emblemImageUrl} alt="emblem" className="w-full h-full object-contain p-1"/>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs bg-amber-500/80 text-stone-900 font-bold px-2 py-0.5 rounded-full">{unitDisplayName(kingdom)}</span>
              </div>
              <h1 className="text-3xl md:text-5xl font-serif font-bold text-white">{kingdom.name}</h1>
              {kingdom.localName && <p className="text-amber-300 text-base italic mt-0.5">{kingdom.localName}</p>}
              <div className="flex flex-wrap gap-4 mt-2 text-sm text-white/60">
                {(kingdom.district||kingdom.region||kingdom.country) && (
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5"/>{[kingdom.district,kingdom.region,kingdom.country].filter(Boolean).join(', ')}</span>
                )}
                {kingdom.foundedYear && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5"/>Est. {kingdom.foundedYear}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stat ribbon ── */}
      <div className="bg-amber-50/80 border-y border-amber-200 px-6 md:px-10 py-3 flex gap-6 overflow-x-auto text-sm">
        {[
          { label:`${kingdom.rulerTitle}s`, value:kingdom.rulers.length, icon:<Crown className="h-3.5 w-3.5"/> },
          { label:'Towns', value:kingdom.towns.length, icon:<Home className="h-3.5 w-3.5"/> },
          { label:'Villages', value:kingdom.towns.reduce((a,t)=>a+t.villages.length,0)+kingdom.directVillages.length, icon:<Mountain className="h-3.5 w-3.5"/> },
          { label:'Compounds', value:kingdom.compounds.length, icon:<Building2 className="h-3.5 w-3.5"/> },
          { label:'Council Members', value:kingdom.council.filter(c=>c.isCurrent).length, icon:<Users className="h-3.5 w-3.5"/> },
          { label:'Heritage Records', value:kingdom.records.length, icon:<BookOpen className="h-3.5 w-3.5"/> },
        ].map(s=>(
          <div key={s.label} className="flex items-center gap-1.5 text-amber-800 shrink-0">
            {s.icon}<span className="font-bold">{s.value}</span><span className="text-amber-700">{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="px-4 md:px-8 mt-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="rounded-xl bg-muted/60 p-1 mb-8 flex flex-wrap h-auto gap-1">
            {[
              { v:'overview',      l:'Overview' },
              { v:'rulers',        l:`${kingdom.rulerTitle} Lineage` },
              { v:'settlements',   l:'Towns & Villages' },
              { v:'compounds',     l:'Compounds & Families' },
              { v:'council',       l:'Council of Chiefs' },
              { v:'cdc',           l:'CDC' },
              { v:'heritage',      l:'Heritage' },
              { v:'resources',     l:'Resources' },
              { v:'vault',         l:'📂 Vault' },
              { v:'public',        l:'🌍 Public Archive' },
              { v:'members',       l:'👥 Members' },
              { v:'subscription',  l:'💳 Plan' },
              { v:'accounts',      l:'🏦 Accounts' },
              { v:'claims',        l:'⚖️ Claims' },
            ].map(t=><TabsTrigger key={t.v} value={t.v} className="rounded-lg text-xs">{t.l}</TabsTrigger>)}
          </TabsList>

          {/* ── OVERVIEW ── */}
          <TabsContent value="overview" className="space-y-6">
            {kingdom.description && (
              <Card className="border-0 bg-amber-50/50 shadow-sm">
                <CardContent className="p-6 text-foreground/80 leading-relaxed text-lg">{kingdom.description}</CardContent>
              </Card>
            )}
            <div className="grid md:grid-cols-3 gap-4">
              <InfoCard icon={<Crown className="h-5 w-5 text-amber-600"/>} label={`Current ${kingdom.rulerTitle}`} value={currentRuler ? `${currentRuler.title} ${currentRuler.name}` : 'Not recorded'}/>
              <InfoCard icon={<Users className="h-5 w-5 text-purple-600"/>} label="Council of Chiefs" value={`${kingdom.council.filter(c=>c.isCurrent).length} active members`}/>
              <InfoCard icon={<Vote className="h-5 w-5 text-blue-600"/>} label="Active CDC" value={kingdomCdc.find(c=>c.isCurrent) ? 'Yes' : 'None recorded'}/>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" className="rounded-full text-sm" onClick={()=>{setTab('rulers');setDlg('ruler')}}>
                <Crown className="mr-1.5 h-3.5 w-3.5"/> Add {kingdom.rulerTitle}
              </Button>
              <Button variant="outline" className="rounded-full text-sm" onClick={()=>{setTab('settlements');setDlg('town')}}>
                <Home className="mr-1.5 h-3.5 w-3.5"/> Add Town
              </Button>
              <Button variant="outline" className="rounded-full text-sm" onClick={()=>{setTab('compounds');setDlg('compound')}}>
                <Building2 className="mr-1.5 h-3.5 w-3.5"/> Add Compound
              </Button>
              <Button variant="outline" className="rounded-full text-sm" onClick={()=>{setTab('council');setDlg('council')}}>
                <Users className="mr-1.5 h-3.5 w-3.5"/> Add Council Member
              </Button>
              <Button variant="outline" className="rounded-full text-sm" onClick={()=>{setTab('cdc');setDlg('cdc')}}>
                <Vote className="mr-1.5 h-3.5 w-3.5"/> Add CDC
              </Button>
              <Button variant="outline" className="rounded-full text-sm" onClick={()=>{setTab('heritage');setDlg('record')}}>
                <BookOpen className="mr-1.5 h-3.5 w-3.5"/> Add Heritage Record
              </Button>
            </div>
          </TabsContent>

          {/* ── RULERS ── */}
          <TabsContent value="rulers" className="space-y-6">
            <SectionHeader title={`${kingdom.rulerTitle} Lineage`} sub="Succession timeline from earliest to present"
              btnLabel={`Add ${kingdom.rulerTitle}`} onAdd={()=>setDlg('ruler')}/>
            {kingdom.rulers.length===0 ? <EmptyState icon={<Crown className="h-10 w-10"/>} label={`No ${kingdom.rulerTitle.toLowerCase()}s recorded`} onAdd={()=>setDlg('ruler')}/> : (
              <div className="relative">
                <div className="absolute left-7 top-0 bottom-0 w-0.5 bg-amber-200"/>
                <div className="space-y-4">
                  {kingdom.rulers.map(ruler=>(
                    <div key={ruler.id} className="relative flex gap-5 pl-3">
                      <div className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow
                        ${ruler.isCurrent ? 'bg-amber-500 text-white' : 'bg-white border-2 border-amber-300 text-amber-600'}`}>
                        {ruler.imageUrl ? <img src={ruler.imageUrl} alt={ruler.name} className="w-full h-full rounded-full object-cover"/> : <Crown className="h-4 w-4"/>}
                      </div>
                      <Card className={`flex-1 shadow-sm ${ruler.isCurrent ? 'border-amber-300 bg-amber-50/60':''}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-serif font-bold">{ruler.title} {ruler.name}</span>
                                {ruler.localName && <span className="text-sm text-muted-foreground italic">({ruler.localName})</span>}
                                {ruler.isCurrent && <Badge className="bg-amber-500 text-white text-[10px]">Current</Badge>}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {ruler.reignStart&&ruler.reignEnd ? `${ruler.reignStart}–${ruler.reignEnd} (${ruler.reignEnd-ruler.reignStart} yrs)`
                                  : ruler.reignStart ? `${ruler.reignStart}–present` : 'Reign dates unknown'}
                              </p>
                              {ruler.bio && <p className="text-sm mt-1 text-muted-foreground line-clamp-2">{ruler.bio}</p>}
                              {ruler.achievements && <p className="text-sm mt-1"><span className="font-medium">Achievements:</span> {ruler.achievements}</p>}
                              {ruler.successionNotes && <p className="text-xs text-muted-foreground mt-1 italic">Succession: {ruler.successionNotes}</p>}
                            </div>
                            <button onClick={()=>del(`/genhal/kingdoms/${id}/rulers/${ruler.id}`, ruler.name)} className="text-muted-foreground/40 hover:text-destructive shrink-0 ml-2"><Trash2 className="h-3.5 w-3.5"/></button>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── SETTLEMENTS (Towns + Villages) ── */}
          <TabsContent value="settlements" className="space-y-8">
            <SectionHeader title="Towns & Villages" sub="Settlements within the kingdom" btnLabel="Add Town" onAdd={()=>setDlg('town')}/>

            {/* Towns */}
            {kingdom.towns.length > 0 && (
              <div>
                <h3 className="font-serif text-lg font-bold mb-4 flex items-center gap-2"><Home className="h-5 w-5 text-amber-600"/> Towns ({kingdom.towns.length})</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {kingdom.towns.map(town=>(
                    <Card key={town.id} className="border shadow-sm">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold">{town.name}</p>
                            {town.localName && <p className="text-xs text-muted-foreground italic">{town.localName}</p>}
                            {town.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{town.description}</p>}
                          </div>
                          <div className="flex gap-1.5">
                            <Button variant="outline" size="sm" className="h-7 rounded-full text-xs"
                              onClick={()=>{ setSelectedCompound({id:town.id,name:town.name,localName:'',description:'',chiefTitle:'',chiefs:[]} as any); setDlg('village'); }}>
                              <Plus className="mr-1 h-3 w-3"/> Village
                            </Button>
                            <button onClick={()=>del(`/genhal/kingdoms/${id}/towns/${town.id}`, town.name)} className="text-muted-foreground/40 hover:text-destructive"><Trash2 className="h-3.5 w-3.5"/></button>
                          </div>
                        </div>
                        {town.villages.length > 0 && (
                          <div className="pl-3 border-l-2 border-amber-200 space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Villages</p>
                            {town.villages.map(v=>(
                              <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
                                <div className="flex items-center gap-1.5">
                                  <Mountain className="h-3 w-3 text-amber-600 shrink-0"/>
                                  <span>{v.name}</span>
                                  {v.localName && <span className="text-muted-foreground italic text-xs">({v.localName})</span>}
                                </div>
                                <button onClick={()=>del(`/genhal/kingdoms/${id}/villages/${v.id}`, v.name)} className="text-muted-foreground/30 hover:text-destructive shrink-0"><X className="h-3 w-3"/></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Direct villages (under kingdom, not under a town) */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif text-lg font-bold flex items-center gap-2"><Mountain className="h-5 w-5 text-stone-600"/> Direct Villages ({kingdom.directVillages.length})</h3>
                <Button variant="outline" size="sm" className="rounded-full text-xs" onClick={()=>{ setSelectedCompound(null); setDlg('village'); }}>
                  <Plus className="mr-1 h-3 w-3"/> Add Village
                </Button>
              </div>
              {kingdom.directVillages.length===0 && kingdom.towns.length===0 ? (
                <EmptyState icon={<Mountain className="h-10 w-10"/>} label="No settlements recorded" onAdd={()=>setDlg('town')}/>
              ) : kingdom.directVillages.length > 0 ? (
                <div className="grid md:grid-cols-3 gap-3">
                  {kingdom.directVillages.map(v=>(
                    <Card key={v.id} className="border shadow-sm group">
                      <CardContent className="p-3 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm">{v.name}</p>
                          {v.localName && <p className="text-xs text-muted-foreground italic">{v.localName}</p>}
                        </div>
                        <button onClick={()=>del(`/genhal/kingdoms/${id}/villages/${v.id}`, v.name)} className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive"><Trash2 className="h-3.5 w-3.5"/></button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : null}
            </div>
          </TabsContent>

          {/* ── COMPOUNDS ── */}
          <TabsContent value="compounds" className="space-y-6">
            <SectionHeader title="Compounds & Families" sub="Kinship groups — the same families whose members now live across towns and villages"
              btnLabel="Add Compound" onAdd={()=>setDlg('compound')}/>
            {kingdom.compounds.length===0 ? <EmptyState icon={<Building2 className="h-10 w-10"/>} label="No compounds recorded" onAdd={()=>setDlg('compound')}/> : (
              <div className="grid md:grid-cols-2 gap-5">
                {kingdom.compounds.map(c=>(
                  <CompoundCard key={c.id} compound={c} kingdomId={Number(id)} base={base}
                    onAddChief={()=>{ setSelectedCompound(c); setDlg('chief'); }}
                    onDelete={()=>del(`/genhal/kingdoms/${id}/compounds/${c.id}`, c.name)}
                    onChiefDelete={chiefId=>del(`/genhal/kingdoms/${id}/compounds/${c.id}/chiefs/${chiefId}`, 'chief')}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── COUNCIL OF CHIEFS ── */}
          <TabsContent value="council" className="space-y-6">
            <SectionHeader title="Council of Chiefs" sub="Formal governing body — members are family/compound chiefs who hold titled positions"
              btnLabel="Add Council Member" onAdd={()=>setDlg('council')}/>
            {kingdom.council.length===0 ? <EmptyState icon={<Users className="h-10 w-10"/>} label="No council members recorded" onAdd={()=>setDlg('council')}/> : (
              <div>
                {/* Current */}
                {kingdom.council.filter(c=>c.isCurrent).length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Current Council</p>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {kingdom.council.filter(c=>c.isCurrent).map(m=><CouncilCard key={m.id} member={m} compounds={kingdom.compounds} onDelete={()=>del(`/genhal/kingdoms/${id}/council/${m.id}`, m.name)}/>)}
                    </div>
                  </div>
                )}
                {/* Former */}
                {kingdom.council.filter(c=>!c.isCurrent).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Former Members</p>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {kingdom.council.filter(c=>!c.isCurrent).map(m=><CouncilCard key={m.id} member={m} compounds={kingdom.compounds} onDelete={()=>del(`/genhal/kingdoms/${id}/council/${m.id}`, m.name)}/>)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* ── CDC ── */}
          <TabsContent value="cdc" className="space-y-8">
            <SectionHeader title="Community Development Committee" sub="Elected bodies at kingdom, town, and village level — each serves a defined tenure"
              btnLabel="Add CDC" onAdd={()=>setDlg('cdc')}/>

            {/* Kingdom-level CDCs */}
            {kingdomCdc.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Kingdom Level</p>
                <div className="space-y-4">
                  {kingdomCdc.map(c=>(
                    <CdcCard key={c.id} committee={c} kingdomId={Number(id)} base={base}
                      onAddMember={()=>{ setSelectedCdc(c); setDlg('cdcMember'); }}
                      onDelete={()=>del(`/genhal/kingdoms/${id}/cdc/${c.id}`, c.name)}
                      onMemberDelete={mid=>del(`/genhal/kingdoms/${id}/cdc/${c.id}/members/${mid}`, 'member')}
                    />
                  ))}
                </div>
              </div>
            )}
            {/* Town / village CDCs */}
            {kingdom.cdc.filter(c=>c.unitType!=='kingdom').length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Town & Village Level</p>
                <div className="space-y-4">
                  {kingdom.cdc.filter(c=>c.unitType!=='kingdom').map(c=>(
                    <CdcCard key={c.id} committee={c} kingdomId={Number(id)} base={base}
                      onAddMember={()=>{ setSelectedCdc(c); setDlg('cdcMember'); }}
                      onDelete={()=>del(`/genhal/kingdoms/${id}/cdc/${c.id}`, c.name)}
                      onMemberDelete={mid=>del(`/genhal/kingdoms/${id}/cdc/${c.id}/members/${mid}`, 'member')}
                    />
                  ))}
                </div>
              </div>
            )}
            {kingdom.cdc.length===0 && <EmptyState icon={<Vote className="h-10 w-10"/>} label="No CDCs recorded" onAdd={()=>setDlg('cdc')}/>}
          </TabsContent>

          {/* ── HERITAGE ── */}
          <TabsContent value="heritage" className="space-y-6">
            <SectionHeader title="Heritage & Culture" sub="History, traditions, festivals, and ceremonies of the kingdom"
              btnLabel="Add Record" onAdd={()=>setDlg('record')}/>
            {heritageTypes.every(t=>byType(t).length===0) ? <EmptyState icon={<BookOpen className="h-10 w-10"/>} label="No heritage records yet" onAdd={()=>setDlg('record')}/> : (
              <div className="space-y-8">
                {heritageTypes.filter(t=>byType(t).length>0).map(type=>(
                  <div key={type}>
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium mb-4 ${RECORD_TYPES[type].color}`}>
                      {RECORD_TYPES[type].icon} {RECORD_TYPES[type].label}s
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      {byType(type).map(r=><RecordCard key={r.id} record={r} kingdomId={Number(id)} base={base} onDelete={load}/>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── RESOURCES ── */}
          <TabsContent value="resources" className="space-y-6">
            <SectionHeader title="Resources & Economy" sub="Natural wealth and economic life of the kingdom"
              btnLabel="Add Record" onAdd={()=>setDlg('record')}/>
            {resourceTypes.every(t=>byType(t).length===0) ? <EmptyState icon={<Sprout className="h-10 w-10"/>} label="No resource records yet" onAdd={()=>setDlg('record')}/> : (
              <div className="grid md:grid-cols-2 gap-8">
                {resourceTypes.filter(t=>byType(t).length>0).map(type=>(
                  <div key={type}>
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium mb-4 ${RECORD_TYPES[type].color}`}>
                      {RECORD_TYPES[type].icon} {RECORD_TYPES[type].label}
                    </div>
                    <div className="space-y-3">{byType(type).map(r=><RecordCard key={r.id} record={r} kingdomId={Number(id)} base={base} onDelete={load}/>)}</div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── VAULT ── */}
          <TabsContent value="vault" className="px-6 md:px-10 py-6">
            <VaultTab unitType="kingdom" unitId={kingdom.id} kingdomId={kingdom.id} />
          </TabsContent>

          {/* ── MEMBERS ── */}
          <TabsContent value="members" className="px-6 md:px-10 py-6">
            <MembersTab unitType="kingdom" unitId={kingdom.id} rulerTitle={kingdom.rulerTitle} />
          </TabsContent>

          {/* ── SUBSCRIPTION ── */}
          <TabsContent value="subscription" className="px-6 md:px-10 py-6">
            <SubscriptionTab unitType="kingdom" unitId={kingdom.id} />
          </TabsContent>

          {/* ── ACCOUNTS ── */}
          <TabsContent value="accounts" className="px-6 md:px-10 py-6">
            <SecretAccountsTab unitType="kingdom" unitId={kingdom.id} unitName={kingdom.name} />
          </TabsContent>

          {/* ── PUBLIC ARCHIVE ── */}
          <TabsContent value="public" className="px-6 md:px-10 py-6">
            <PublicGallery unitType="kingdom" unitId={kingdom.id} unitName={kingdom.name} />
          </TabsContent>

          {/* ── CLAIMS ── */}
          <TabsContent value="claims" className="px-6 md:px-10 py-6">
            <ClaimsTab unitType="kingdom" unitId={kingdom.id} unitName={kingdom.name} />
          </TabsContent>
        </Tabs>
      </div>

      {dlg==='ruler'   && <RulerDialog    open onClose={()=>setDlg(null)} kingdomId={Number(id)} rulerTitle={kingdom.rulerTitle} base={base} onSuccess={()=>{setDlg(null);load()}}/>}
      {dlg==='town'    && <TownDialog     open onClose={()=>setDlg(null)} kingdomId={Number(id)} base={base} onSuccess={()=>{setDlg(null);load()}}/>}
      {dlg==='village' && <VillageDialog  open onClose={()=>setDlg(null)} kingdomId={Number(id)} base={base} towns={kingdom.towns} defaultTownId={selectedCompound?.id} onSuccess={()=>{setDlg(null);load()}}/>}
      {dlg==='compound'&& <CompoundDialog open onClose={()=>setDlg(null)} kingdomId={Number(id)} base={base} onSuccess={()=>{setDlg(null);load()}}/>}
      {dlg==='chief'   && selectedCompound && <ChiefDialog open onClose={()=>setDlg(null)} compound={selectedCompound} kingdomId={Number(id)} base={base} onSuccess={()=>{setDlg(null);load()}}/>}
      {dlg==='council' && <CouncilDialog  open onClose={()=>setDlg(null)} kingdomId={Number(id)} compounds={kingdom.compounds} base={base} onSuccess={()=>{setDlg(null);load()}}/>}
      {dlg==='cdc'     && <CdcDialog      open onClose={()=>setDlg(null)} kingdomId={Number(id)} towns={kingdom.towns} villages={[...kingdom.directVillages,...kingdom.towns.flatMap(t=>t.villages)]} base={base} onSuccess={()=>{setDlg(null);load()}}/>}
      {dlg==='cdcMember' && selectedCdc && <CdcMemberDialog open onClose={()=>setDlg(null)} committee={selectedCdc} kingdomId={Number(id)} base={base} onSuccess={()=>{setDlg(null);load()}}/>}
      {dlg==='record'  && <RecordDialog   open onClose={()=>setDlg(null)} kingdomId={Number(id)} base={base} onSuccess={()=>{setDlg(null);load()}}/>}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CompoundCard({ compound:c, kingdomId, base, onAddChief, onDelete, onChiefDelete }: {
  compound:Compound; kingdomId:number; base:string;
  onAddChief:()=>void; onDelete:()=>void; onChiefDelete:(id:number)=>void;
}) {
  const [open, setOpen] = useState(false);
  const current = c.chiefs.find(ch=>ch.isCurrent);
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-serif font-bold">{c.name}</p>
            {c.localName && <p className="text-xs text-muted-foreground italic">{c.localName}</p>}
            {c.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{c.description}</p>}
          </div>
          <button onClick={onDelete} className="text-muted-foreground/30 hover:text-destructive"><Trash2 className="h-3.5 w-3.5"/></button>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Crown className="h-3.5 w-3.5 text-amber-600 shrink-0"/>
          {current ? <span><span className="font-medium">{current.title} {current.name}</span> <span className="text-muted-foreground">(current {c.chiefTitle.toLowerCase()})</span></span>
            : <span className="text-muted-foreground">No current {c.chiefTitle.toLowerCase()} recorded</span>}
        </div>
        <div className="flex items-center justify-between">
          <button onClick={()=>setOpen(o=>!o)} className="flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-600 font-medium">
            {open ? <ChevronUp className="h-3.5 w-3.5"/> : <ChevronDown className="h-3.5 w-3.5"/>}
            {c.chiefs.length} {c.chiefTitle.toLowerCase()}{c.chiefs.length!==1?'s':''} in lineage
          </button>
          <Button variant="outline" size="sm" className="h-7 rounded-full text-xs" onClick={onAddChief}>
            <Plus className="mr-1 h-3 w-3"/> Add {c.chiefTitle}
          </Button>
        </div>
        {open && c.chiefs.length>0 && (
          <div className="pt-1 space-y-2 border-t">
            {c.chiefs.map(ch=>(
              <div key={ch.id} className={`flex items-center gap-2.5 p-2 rounded-lg text-sm ${ch.isCurrent?'bg-amber-50 border border-amber-200':'bg-muted/30'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${ch.isCurrent?'bg-amber-500 text-white':'bg-stone-200 text-stone-600'}`}>
                  {ch.isCurrent?'★':'○'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{ch.title} {ch.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {ch.reignStart&&ch.reignEnd ? `${ch.reignStart}–${ch.reignEnd}` : ch.reignStart ? `${ch.reignStart}–present` : 'Dates unknown'}
                  </p>
                </div>
                <button onClick={()=>onChiefDelete(ch.id)} className="text-muted-foreground/40 hover:text-destructive"><X className="h-3 w-3"/></button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CouncilCard({ member:m, compounds, onDelete }: { member:CouncilMember; compounds:Compound[]; onDelete:()=>void; }) {
  const compound = compounds.find(c=>c.id===m.compoundId);
  return (
    <Card className={`border shadow-sm ${m.isCurrent?'border-amber-200 bg-amber-50/40':''}`}>
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-sm">{m.title} {m.name}</p>
            <p className="text-xs text-muted-foreground">{m.role}</p>
          </div>
          <button onClick={onDelete} className="text-muted-foreground/30 hover:text-destructive"><X className="h-3.5 w-3.5"/></button>
        </div>
        {compound && <p className="text-xs text-amber-700">{compound.name} Compound</p>}
        {(m.joinedYear||m.leftYear) && <p className="text-xs text-muted-foreground">{m.joinedYear??'?'} – {m.leftYear??'present'}</p>}
      </CardContent>
    </Card>
  );
}

function CdcCard({ committee:c, kingdomId, base, onAddMember, onDelete, onMemberDelete }: {
  committee:CdcCommittee; kingdomId:number; base:string;
  onAddMember:()=>void; onDelete:()=>void; onMemberDelete:(id:number)=>void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card className={`border shadow-sm ${c.isCurrent?'border-blue-200 bg-blue-50/30':''}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold">{c.name}</p>
              {c.isCurrent && <Badge className="bg-blue-500 text-white text-[10px]">Current</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {c.unitType.charAt(0).toUpperCase()+c.unitType.slice(1)}-level ·{' '}
              {c.termStart&&c.termEnd ? `${c.termStart}–${c.termEnd}` : c.termStart ? `${c.termStart}–present` : 'Tenure not set'}
            </p>
            {c.mandate && <p className="text-sm text-muted-foreground mt-1">{c.mandate}</p>}
          </div>
          <button onClick={onDelete} className="text-muted-foreground/30 hover:text-destructive"><Trash2 className="h-3.5 w-3.5"/></button>
        </div>
        <div className="flex items-center justify-between">
          <button onClick={()=>setOpen(o=>!o)} className="flex items-center gap-1.5 text-xs text-blue-700 font-medium">
            {open?<ChevronUp className="h-3.5 w-3.5"/>:<ChevronDown className="h-3.5 w-3.5"/>}
            {c.members.length} member{c.members.length!==1?'s':''}
          </button>
          <Button variant="outline" size="sm" className="h-7 rounded-full text-xs" onClick={onAddMember}>
            <Plus className="mr-1 h-3 w-3"/> Add Member
          </Button>
        </div>
        {open && c.members.length>0 && (
          <div className="pt-1 border-t space-y-1.5">
            {c.members.map(m=>(
              <div key={m.id} className="flex items-center gap-2 text-sm p-1.5 rounded-lg bg-muted/30">
                <UserCheck className="h-3.5 w-3.5 text-blue-600 shrink-0"/>
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{m.name}</span> <span className="text-muted-foreground">· {m.role}</span>
                  {m.electedYear && <span className="text-muted-foreground"> · {m.electedYear}</span>}
                </div>
                <button onClick={()=>onMemberDelete(m.id)} className="text-muted-foreground/30 hover:text-destructive"><X className="h-3 w-3"/></button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecordCard({ record:r, kingdomId, base, onDelete }: { record:CivicRecord; kingdomId:number; base:string; onDelete:()=>void; }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className="border shadow-sm group">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold">{r.title}</h4>
              {r.period && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{r.period}</span>}
            </div>
            {r.content && <p className={`text-sm text-muted-foreground mt-1 ${expanded?'':'line-clamp-3'}`}>{r.content}</p>}
            {r.content && r.content.length>180 && (
              <button onClick={()=>setExpanded(e=>!e)} className="text-xs text-amber-700 mt-1 font-medium">{expanded?'Show less':'Read more'}</button>
            )}
          </div>
          <button onClick={async()=>{ if(!confirm(`Delete "${r.title}"?`))return; await fetch(`${base}/genhal/kingdoms/${kingdomId}/records/${r.id}`,{method:'DELETE'}); onDelete(); }}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive shrink-0"><Trash2 className="h-3.5 w-3.5"/></button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Small dialogs ────────────────────────────────────────────────────────────
function useFormDialog<T>(init: T) {
  const [form, setForm] = useState<T>(init);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<T>) => setForm(f => ({ ...f, ...patch }));
  return { form, set, saving, setSaving };
}

function RulerDialog({ open, onClose, kingdomId, rulerTitle, base, onSuccess }: any) {
  const { toast } = useToast();
  const { form, set, saving, setSaving } = useFormDialog({ name:'', localName:'', title:rulerTitle, reignStart:'', reignEnd:'', isCurrent:false, bio:'', achievements:'', successionNotes:'' });
  const submit = async () => {
    if (!form.name) return; setSaving(true);
    try { await fetch(`${base}/genhal/kingdoms/${kingdomId}/rulers`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) }); toast({ title:`${form.title} ${form.name} added!` }); onSuccess(); }
    catch { toast({ variant:'destructive', title:'Failed' }); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-serif text-xl">Add {rulerTitle}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name *" span={2}><Input value={form.name} onChange={e=>set({name:e.target.value})} className="rounded-lg"/></Field>
            <Field label="Title"><Input value={form.title} onChange={e=>set({title:e.target.value})} className="rounded-lg"/></Field>
            <Field label="Local name"><Input value={form.localName} onChange={e=>set({localName:e.target.value})} className="rounded-lg"/></Field>
            <Field label="Reign start"><Input type="number" value={form.reignStart} onChange={e=>set({reignStart:e.target.value})} placeholder="1820" className="rounded-lg"/></Field>
            <Field label="Reign end"><Input type="number" value={form.reignEnd} onChange={e=>set({reignEnd:e.target.value})} placeholder="Leave blank if current" className="rounded-lg"/></Field>
          </div>
          <div className="flex items-center gap-3"><Switch checked={form.isCurrent} onCheckedChange={v=>set({isCurrent:v})}/><Label>This is the current {rulerTitle.toLowerCase()}</Label></div>
          <Field label="Biography"><Textarea value={form.bio} onChange={e=>set({bio:e.target.value})} rows={2} className="rounded-lg"/></Field>
          <Field label="Achievements"><Textarea value={form.achievements} onChange={e=>set({achievements:e.target.value})} rows={2} className="rounded-lg"/></Field>
          <Field label="Succession notes"><Input value={form.successionNotes} onChange={e=>set({successionNotes:e.target.value})} className="rounded-lg"/></Field>
          <SaveBtn saving={saving} disabled={!form.name} onClick={submit} label={`Add ${rulerTitle}`} icon={<Crown className="mr-2 h-4 w-4"/>}/>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TownDialog({ open, onClose, kingdomId, base, onSuccess }: any) {
  const { toast } = useToast();
  const { form, set, saving, setSaving } = useFormDialog({ name:'', localName:'', description:'' });
  const submit = async () => {
    if (!form.name) return; setSaving(true);
    try { await fetch(`${base}/genhal/kingdoms/${kingdomId}/towns`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) }); toast({ title:`${form.name} added!` }); onSuccess(); }
    catch { toast({ variant:'destructive', title:'Failed' }); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader><DialogTitle className="font-serif text-xl">Add Town</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <Field label="Town name *"><Input value={form.name} onChange={e=>set({name:e.target.value})} placeholder="e.g. Ugwunshi Town" className="rounded-lg"/></Field>
          <Field label="Local name"><Input value={form.localName} onChange={e=>set({localName:e.target.value})} className="rounded-lg"/></Field>
          <Field label="Description"><Textarea value={form.description} onChange={e=>set({description:e.target.value})} rows={2} className="rounded-lg"/></Field>
          <SaveBtn saving={saving} disabled={!form.name} onClick={submit} label="Add Town" icon={<Home className="mr-2 h-4 w-4"/>}/>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VillageDialog({ open, onClose, kingdomId, base, towns, defaultTownId, onSuccess }: any) {
  const { toast } = useToast();
  const { form, set, saving, setSaving } = useFormDialog({ name:'', localName:'', townId: defaultTownId ?? '', description:'' });
  const submit = async () => {
    if (!form.name) return; setSaving(true);
    try { await fetch(`${base}/genhal/kingdoms/${kingdomId}/villages`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) }); toast({ title:`${form.name} added!` }); onSuccess(); }
    catch { toast({ variant:'destructive', title:'Failed' }); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader><DialogTitle className="font-serif text-xl">Add Village</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <Field label="Village name *"><Input value={form.name} onChange={e=>set({name:e.target.value})} className="rounded-lg"/></Field>
          <Field label="Local name"><Input value={form.localName} onChange={e=>set({localName:e.target.value})} className="rounded-lg"/></Field>
          <Field label="Parent town (optional — leave blank if directly under the kingdom)">
            <select value={form.townId} onChange={e=>set({townId:e.target.value})} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
              <option value="">— Under the Kingdom directly —</option>
              {towns.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <SaveBtn saving={saving} disabled={!form.name} onClick={submit} label="Add Village" icon={<Mountain className="mr-2 h-4 w-4"/>}/>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CompoundDialog({ open, onClose, kingdomId, base, onSuccess }: any) {
  const { toast } = useToast();
  const { form, set, saving, setSaving } = useFormDialog({ name:'', localName:'', description:'', chiefTitle:'Chief' });
  const submit = async () => {
    if (!form.name) return; setSaving(true);
    try { await fetch(`${base}/genhal/kingdoms/${kingdomId}/compounds`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) }); toast({ title:`${form.name} compound added!` }); onSuccess(); }
    catch { toast({ variant:'destructive', title:'Failed' }); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader><DialogTitle className="font-serif text-xl">Add Compound</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <Field label="Compound name *"><Input value={form.name} onChange={e=>set({name:e.target.value})} placeholder="e.g. Abia Compound" className="rounded-lg"/></Field>
          <Field label="Local name"><Input value={form.localName} onChange={e=>set({localName:e.target.value})} className="rounded-lg"/></Field>
          <Field label="Family leader title"><Input value={form.chiefTitle} onChange={e=>set({chiefTitle:e.target.value})} placeholder="Chief · Elder · Head" className="rounded-lg"/></Field>
          <Field label="Description"><Textarea value={form.description} onChange={e=>set({description:e.target.value})} rows={2} className="rounded-lg"/></Field>
          <SaveBtn saving={saving} disabled={!form.name} onClick={submit} label="Add Compound" icon={<Building2 className="mr-2 h-4 w-4"/>}/>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChiefDialog({ open, onClose, compound, kingdomId, base, onSuccess }: any) {
  const { toast } = useToast();
  const { form, set, saving, setSaving } = useFormDialog({ name:'', localName:'', title:compound.chiefTitle||'Chief', reignStart:'', reignEnd:'', isCurrent:false, bio:'', successionNotes:'' });
  const submit = async () => {
    if (!form.name) return; setSaving(true);
    try { await fetch(`${base}/genhal/kingdoms/${kingdomId}/compounds/${compound.id}/chiefs`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) }); toast({ title:`${form.name} added!` }); onSuccess(); }
    catch { toast({ variant:'destructive', title:'Failed' }); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[460px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-serif text-xl">Add {compound.chiefTitle||'Chief'} — {compound.name}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name *" span={2}><Input value={form.name} onChange={e=>set({name:e.target.value})} className="rounded-lg"/></Field>
            <Field label="Title"><Input value={form.title} onChange={e=>set({title:e.target.value})} className="rounded-lg"/></Field>
            <Field label="Local name"><Input value={form.localName} onChange={e=>set({localName:e.target.value})} className="rounded-lg"/></Field>
            <Field label="Reign start"><Input type="number" value={form.reignStart} onChange={e=>set({reignStart:e.target.value})} placeholder="1910" className="rounded-lg"/></Field>
            <Field label="Reign end"><Input type="number" value={form.reignEnd} onChange={e=>set({reignEnd:e.target.value})} className="rounded-lg"/></Field>
          </div>
          <div className="flex items-center gap-3"><Switch checked={form.isCurrent} onCheckedChange={v=>set({isCurrent:v})}/><Label>Current {form.title}</Label></div>
          <Field label="Biography"><Textarea value={form.bio} onChange={e=>set({bio:e.target.value})} rows={2} className="rounded-lg"/></Field>
          <SaveBtn saving={saving} disabled={!form.name} onClick={submit} label={`Add ${form.title}`}/>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CouncilDialog({ open, onClose, kingdomId, compounds, base, onSuccess }: any) {
  const { toast } = useToast();
  const { form, set, saving, setSaving } = useFormDialog({ name:'', title:'', role:'Member', compoundId:'', joinedYear:'', isCurrent:true });
  const submit = async () => {
    if (!form.name||!form.title) return; setSaving(true);
    try { await fetch(`${base}/genhal/kingdoms/${kingdomId}/council`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) }); toast({ title:`${form.name} added to Council!` }); onSuccess(); }
    catch { toast({ variant:'destructive', title:'Failed' }); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader><DialogTitle className="font-serif text-xl">Add Council Member</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name *" span={2}><Input value={form.name} onChange={e=>set({name:e.target.value})} className="rounded-lg"/></Field>
            <Field label="Title *"><Input value={form.title} onChange={e=>set({title:e.target.value})} placeholder="Chief, Elder…" className="rounded-lg"/></Field>
            <Field label="Role">
              <select value={form.role} onChange={e=>set({role:e.target.value})} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                {['Chairman','Vice Chairman','Secretary','Treasurer','Member','Observer'].map(r=><option key={r}>{r}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Compound (optional)">
            <select value={form.compoundId} onChange={e=>set({compoundId:e.target.value})} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
              <option value="">— Select compound —</option>
              {compounds.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Year joined"><Input type="number" value={form.joinedYear} onChange={e=>set({joinedYear:e.target.value})} className="rounded-lg"/></Field>
          </div>
          <div className="flex items-center gap-3"><Switch checked={form.isCurrent} onCheckedChange={v=>set({isCurrent:v})}/><Label>Currently serving</Label></div>
          <SaveBtn saving={saving} disabled={!form.name||!form.title} onClick={submit} label="Add to Council" icon={<Users className="mr-2 h-4 w-4"/>}/>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CdcDialog({ open, onClose, kingdomId, towns, villages, base, onSuccess }: any) {
  const { toast } = useToast();
  const { form, set, saving, setSaving } = useFormDialog({ name:'Community Development Committee', unitType:'kingdom', unitId:String(kingdomId), termStart:'', termEnd:'', isCurrent:true, mandate:'' });
  const allVillages = [...(villages||[])];
  const submit = async () => {
    setSaving(true);
    try { await fetch(`${base}/genhal/kingdoms/${kingdomId}/cdc`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...form,unitId:Number(form.unitId)||kingdomId}) }); toast({ title:'CDC added!' }); onSuccess(); }
    catch { toast({ variant:'destructive', title:'Failed' }); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-serif text-xl">Add CDC Committee</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Level</Label>
            <div className="grid grid-cols-3 gap-2">
              {[['kingdom','Kingdom'],['town','Town'],['village','Village']].map(([v,l])=>(
                <button key={v} onClick={()=>set({unitType:v,unitId:v==='kingdom'?String(kingdomId):''})}
                  className={`p-2.5 rounded-xl border text-sm transition-all ${form.unitType===v?'border-blue-500 bg-blue-50 font-semibold':'border-border hover:border-blue-300'}`}>{l}</button>
              ))}
            </div>
          </div>
          {form.unitType==='town' && (
            <Field label="Which town?">
              <select value={form.unitId} onChange={e=>set({unitId:e.target.value})} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select town</option>
                {towns.map((t:any)=><option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
          )}
          {form.unitType==='village' && (
            <Field label="Which village?">
              <select value={form.unitId} onChange={e=>set({unitId:e.target.value})} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select village</option>
                {allVillages.map((v:any)=><option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Committee name"><Input value={form.name} onChange={e=>set({name:e.target.value})} className="rounded-lg"/></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Term start (year)"><Input type="number" value={form.termStart} onChange={e=>set({termStart:e.target.value})} placeholder="2022" className="rounded-lg"/></Field>
            <Field label="Term end (year)"><Input type="number" value={form.termEnd} onChange={e=>set({termEnd:e.target.value})} placeholder="Leave blank if current" className="rounded-lg"/></Field>
          </div>
          <Field label="Mandate / goals"><Textarea value={form.mandate} onChange={e=>set({mandate:e.target.value})} rows={2} className="rounded-lg" placeholder="What this CDC was elected to achieve…"/></Field>
          <div className="flex items-center gap-3"><Switch checked={form.isCurrent} onCheckedChange={v=>set({isCurrent:v})}/><Label>This is the current CDC</Label></div>
          <SaveBtn saving={saving} disabled={false} onClick={submit} label="Create CDC" icon={<Vote className="mr-2 h-4 w-4"/>}/>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CdcMemberDialog({ open, onClose, committee, kingdomId, base, onSuccess }: any) {
  const { toast } = useToast();
  const { form, set, saving, setSaving } = useFormDialog({ name:'', role:'Member', electedYear:'', bio:'' });
  const submit = async () => {
    if (!form.name) return; setSaving(true);
    try { await fetch(`${base}/genhal/kingdoms/${kingdomId}/cdc/${committee.id}/members`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) }); toast({ title:`${form.name} added!` }); onSuccess(); }
    catch { toast({ variant:'destructive', title:'Failed' }); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader><DialogTitle className="font-serif text-xl">Add CDC Member</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <Field label="Name *"><Input value={form.name} onChange={e=>set({name:e.target.value})} className="rounded-lg"/></Field>
          <Field label="Role">
            <select value={form.role} onChange={e=>set({role:e.target.value})} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
              {['Chairman','Vice Chairman','Secretary','Assistant Secretary','Treasurer','Financial Secretary','PRO','Member'].map(r=><option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Year elected"><Input type="number" value={form.electedYear} onChange={e=>set({electedYear:e.target.value})} className="rounded-lg"/></Field>
          <SaveBtn saving={saving} disabled={!form.name} onClick={submit} label="Add Member"/>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RecordDialog({ open, onClose, kingdomId, base, onSuccess }: any) {
  const { toast } = useToast();
  const { form, set, saving, setSaving } = useFormDialog({ type:'history', title:'', content:'', period:'' });
  const submit = async () => {
    if (!form.title) return; setSaving(true);
    try { await fetch(`${base}/genhal/kingdoms/${kingdomId}/records`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) }); toast({ title:`"${form.title}" recorded!` }); onSuccess(); }
    catch { toast({ variant:'destructive', title:'Failed' }); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-serif text-xl">Add Heritage / Resource Record</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(RECORD_TYPES).map(([key,m])=>(
              <button key={key} onClick={()=>set({type:key})}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-sm text-left transition-all ${form.type===key?'border-amber-500 bg-amber-50 font-medium':'border-border hover:border-amber-300'}`}>
                <span className={`p-1.5 rounded-lg ${m.color}`}>{m.icon}</span>{m.label}
              </button>
            ))}
          </div>
          <Field label="Title *"><Input value={form.title} onChange={e=>set({title:e.target.value})} placeholder="e.g. Ogun Festival, Palm Oil Trade, Iroko Trees" className="rounded-lg"/></Field>
          <Field label="Period / timing"><Input value={form.period} onChange={e=>set({period:e.target.value})} placeholder="Annually in August · Pre-colonial era" className="rounded-lg"/></Field>
          <Field label="Description"><Textarea value={form.content} onChange={e=>set({content:e.target.value})} rows={4} className="rounded-lg"/></Field>
          <SaveBtn saving={saving} disabled={!form.title} onClick={submit} label="Add Record"/>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
function Field({ label, children, span=1 }: { label:string; children:React.ReactNode; span?:number }) {
  return (
    <div className={span===2 ? 'col-span-2 space-y-1.5' : 'space-y-1.5'}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
function SaveBtn({ saving, disabled, onClick, label, icon }: any) {
  return (
    <Button className="w-full rounded-full bg-amber-600 hover:bg-amber-500 text-white" onClick={onClick} disabled={saving||disabled}>
      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : icon}
      {saving ? 'Saving…' : label}
    </Button>
  );
}
function InfoCard({ icon, label, value }: { icon:React.ReactNode; label:string; value:string }) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-100">{icon}</div>
        <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div>
      </CardContent>
    </Card>
  );
}
function SectionHeader({ title, sub, btnLabel, onAdd }: { title:string; sub:string; btnLabel:string; onAdd:()=>void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div><h2 className="font-serif text-2xl font-bold">{title}</h2><p className="text-muted-foreground text-sm mt-0.5">{sub}</p></div>
      <Button className="rounded-full bg-amber-600 hover:bg-amber-500 text-white shrink-0" onClick={onAdd}>
        <Plus className="mr-1.5 h-4 w-4"/>{btnLabel}
      </Button>
    </div>
  );
}
function EmptyState({ icon, label, onAdd }: { icon:React.ReactNode; label:string; onAdd:()=>void }) {
  return (
    <div className="text-center py-16 rounded-2xl border border-dashed space-y-4">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">{icon}</div>
      <p className="font-serif text-xl font-bold">{label}</p>
      <Button className="rounded-full" onClick={onAdd}>Add one now</Button>
    </div>
  );
}
