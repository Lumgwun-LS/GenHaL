/**
 * Members & Roles tab — for both Kingdom and Family views.
 */
import { useState, useEffect } from 'react';
import { Users, Plus, Crown, Shield, ChevronDown, Loader2, UserCheck, UserX, X, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { getApiBaseUrl } from '@/lib/api';

export interface MembersProps {
  unitType: 'kingdom' | 'family';
  unitId: number;
  rulerTitle?: string;
  userRole?: string | null;
}

interface Member {
  id: number; clerkUserId: string; role: string; customTitle?: string;
  status: string; joinedAt: string; notes?: string;
}

const KINGDOM_ROLES = [
  { value: 'king',          label: '👑 King / Ruler',        rank: 9 },
  { value: 'queen_mother',  label: '👑 Queen Mother',         rank: 8 },
  { value: 'council_chief', label: '⚔️  Council Chief',        rank: 7 },
  { value: 'elder',         label: '🌿 Elder',                rank: 6 },
  { value: 'cdc_member',    label: '🏛 CDC Member',           rank: 5 },
  { value: 'family_head',   label: '🏠 Family Head',          rank: 4 },
  { value: 'member',        label: '👤 Member',               rank: 2 },
  { value: 'viewer',        label: '👁 Viewer (read-only)',   rank: 1 },
  { value: 'guest',         label: '🚪 Guest',                rank: 0 },
];
const FAMILY_ROLES = [
  { value: 'head',     label: '👑 Head',              rank: 9 },
  { value: 'co_head',  label: '👑 Co-Head',           rank: 8 },
  { value: 'elder',    label: '🌿 Elder',              rank: 6 },
  { value: 'adult',    label: '👤 Adult Member',       rank: 4 },
  { value: 'child',    label: '🧒 Child Member',       rank: 2 },
  { value: 'viewer',   label: '👁 Viewer (read-only)', rank: 1 },
];

const STATUS_BADGES: Record<string, string> = {
  active:    'bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30',
  pending:   'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  suspended: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
  removed:   'bg-stone-100 text-stone-600 border-stone-200 dark:bg-white/10 dark:text-muted-foreground dark:border-white/10',
};

const KINGDOM_ROLE_RANK: Record<string, number> = Object.fromEntries(KINGDOM_ROLES.map(r => [r.value, r.rank]));

export default function MembersTab({ unitType, unitId, rulerTitle = 'King', userRole }: MembersProps) {
  const base = getApiBaseUrl();
  const { toast } = useToast();
  const roles = unitType === 'kingdom' ? KINGDOM_ROLES : FAMILY_ROLES;
  const callerRank = KINGDOM_ROLE_RANK[userRole ?? 'guest'] ?? 0;
  const isAdmin = callerRank >= 7;

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlg, setDlg] = useState<'add' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<Member | null>(null);
  const [form, setForm] = useState({ clerkUserId: '', role: 'member', customTitle: '', status: 'active', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const url = unitType === 'kingdom'
        ? `${base}/genhal/kingdoms/${unitId}/members`
        : `${base}/genhal/families/${unitId}`;
      const data = await fetch(url).then(r => r.json());
      setMembers(Array.isArray(data) ? data : (data.members ?? []));
    } catch { toast({ variant: 'destructive', title: 'Failed to load members' }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [unitId]);

  const addMember = async () => {
    if (!form.clerkUserId) return;
    setSaving(true);
    try {
      const url = unitType === 'kingdom'
        ? `${base}/genhal/kingdoms/${unitId}/members`
        : `${base}/genhal/families/${unitId}/members`;
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      toast({ title: 'Member added!' });
      setDlg(null);
      setForm({ clerkUserId:'', role:'member', customTitle:'', status:'active', notes:'' });
      load();
    } catch (err: any) { toast({ variant:'destructive', title: err.message ?? 'Failed' }); }
    finally { setSaving(false); }
  };

  const updateMember = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const url = unitType === 'kingdom'
        ? `${base}/genhal/kingdoms/${unitId}/members/${editTarget.id}`
        : `${base}/genhal/families/${unitId}/members/${editTarget.id}`;
      const res = await fetch(url, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: form.role, customTitle: form.customTitle, status: form.status, notes: form.notes }),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      toast({ title: 'Member updated!' });
      setDlg(null); setEditTarget(null);
      load();
    } catch (err: any) { toast({ variant:'destructive', title: err.message ?? 'Failed' }); }
    finally { setSaving(false); }
  };

  const removeMember = async (m: Member) => {
    if (!confirm('Remove this member?')) return;
    const url = unitType === 'kingdom'
      ? `${base}/genhal/kingdoms/${unitId}/members/${m.id}`
      : `${base}/genhal/families/${unitId}/members/${m.id}`;
    await fetch(url, { method: 'DELETE' });
    toast({ title: 'Member removed' });
    load();
  };

  const openEdit = (m: Member) => {
    setEditTarget(m);
    setForm({ clerkUserId: m.clerkUserId, role: m.role, customTitle: m.customTitle ?? '', status: m.status, notes: m.notes ?? '' });
    setDlg('edit');
  };

  const grouped = roles.map(r => ({ ...r, members: members.filter(m => m.role === r.value) })).filter(g => g.members.length > 0);
  const pending = members.filter(m => m.status === 'pending');

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-bold">Members & Roles</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            {members.filter(m => m.status === 'active').length} active member{members.filter(m=>m.status==='active').length!==1?'s':''} · Role-based access controls the vault and governance
          </p>
        </div>
        {isAdmin && (
          <Button className="rounded-full bg-amber-600 hover:bg-amber-500 text-white shrink-0" onClick={() => { setForm({ clerkUserId:'', role:'member', customTitle:'', status:'active', notes:'' }); setDlg('add'); }}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Member
          </Button>
        )}
      </div>

      {pending.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30">
          <p className="text-sm text-amber-800 font-medium dark:text-amber-300">{pending.length} pending member{pending.length!==1?'s':''} awaiting approval</p>
          <div className="flex gap-2 mt-2 flex-wrap">
            {pending.map(m => (
              <div key={m.id} className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-2.5 py-1 text-xs dark:bg-card dark:border-amber-500/30">
                <span className="font-mono text-muted-foreground">{m.clerkUserId.slice(0,12)}…</span>
                <Button variant="ghost" size="sm" className="h-5 px-1.5 text-green-600 dark:text-green-300" onClick={() => { setEditTarget(m); setForm({...form, role:m.role, status:'active'}); updateMember(); }}>
                  <UserCheck className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" className="h-5 px-1.5 text-destructive" onClick={() => removeMember(m)}>
                  <UserX className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : (
        <div className="space-y-6">
          {grouped.length === 0 ? (
            <div className="text-center py-20 rounded-2xl border border-dashed space-y-3">
              <Users className="h-12 w-12 text-muted mx-auto" />
              <div><p className="font-serif text-xl font-bold">No members yet</p><p className="text-sm text-muted-foreground mt-1">Add members and assign roles to control vault access and governance.</p></div>
              {isAdmin && <Button className="rounded-full" onClick={() => setDlg('add')}>Add first member</Button>}
            </div>
          ) : grouped.map(group => (
            <div key={group.value}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">{group.label.split(' ')[0]}</span>
                <span className="font-semibold text-sm">{group.label.split(' ').slice(1).join(' ')}</span>
                <span className="text-xs text-muted-foreground">({group.members.length})</span>
                <div className="flex-1 border-t border-muted/50" />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {group.members.map(m => (
                  <Card key={m.id} className={`border shadow-sm ${m.status !== 'active' ? 'opacity-60' : ''}`}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-700 flex items-center justify-center text-white text-sm font-bold shrink-0">
                        {m.clerkUserId.charAt(5)?.toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate font-mono">{m.clerkUserId.slice(0, 16)}…</p>
                        {m.customTitle && <p className="text-xs text-amber-700 italic dark:text-amber-300">{m.customTitle}</p>}
                        <span className={`inline-flex text-[10px] px-1.5 py-0.5 rounded-full border font-medium mt-0.5 ${STATUS_BADGES[m.status] ?? STATUS_BADGES.active}`}>{m.status}</span>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(m)} className="p-1 text-muted-foreground hover:text-foreground"><Edit2 className="h-3.5 w-3.5" /></button>
                          <button onClick={() => removeMember(m)} className="p-1 text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={dlg === 'add' || dlg === 'edit'} onOpenChange={o => { if (!o) { setDlg(null); setEditTarget(null); } }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader><DialogTitle className="font-serif text-xl">{dlg === 'add' ? 'Add Member' : 'Edit Member'}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            {dlg === 'add' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Clerk User ID *</Label>
                <Input value={form.clerkUserId} onChange={e => setForm(f => ({ ...f, clerkUserId: e.target.value }))}
                  placeholder="user_…" className="rounded-lg font-mono text-sm" />
                <p className="text-[11px] text-muted-foreground">The member must already have a GenHaL account. Find their user ID in the platform admin.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <div className="grid grid-cols-1 gap-1.5 max-h-52 overflow-y-auto">
                {roles.map(r => (
                  <button key={r.value} onClick={() => setForm(f => ({ ...f, role: r.value }))}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-sm text-left transition-all
                      ${form.role === r.value ? 'border-amber-500 bg-amber-50 font-medium dark:border-amber-500/50 dark:bg-amber-500/10' : 'border-border hover:border-amber-300 dark:hover:border-amber-500/30'}`}>
                    <span>{r.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Custom title <span className="text-muted-foreground">(optional — e.g. "Royal Historian")</span></Label>
              <Input value={form.customTitle} onChange={e => setForm(f => ({ ...f, customTitle: e.target.value }))} className="rounded-lg" />
            </div>
            {dlg === 'edit' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                  {['active','pending','suspended','removed'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes" className="rounded-lg" />
            </div>
            <Button className="w-full rounded-full bg-amber-600 hover:bg-amber-500 text-white" onClick={dlg === 'add' ? addMember : updateMember} disabled={saving || (dlg === 'add' && !form.clerkUserId)}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
              {saving ? 'Saving…' : dlg === 'add' ? 'Add Member' : 'Update Member'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
