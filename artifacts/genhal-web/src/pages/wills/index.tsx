/**
 * WillsTab — Family will & testament management.
 *
 * Three-layer access system:
 *   1. Owner passphrase (legacy + split-key)
 *   2. Executor recovery code (split-key only)
 *   3. Platform admin escrow (last resort — death cert required)
 */
import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Plus, Trash2, Eye, EyeOff, Shield, User, Clock,
  AlertCircle, CheckCircle2, Lock, Unlock, UserPlus, X,
  Loader2, ChevronDown, ChevronUp, Printer, Info, Users,
  CreditCard, Copy, Check, Key, ShieldAlert, Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { getApiBaseUrl } from '@/lib/api';
import { format } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthorizedPerson { name: string; email: string; relationship: string; }
interface Executor { name: string; email: string; }
interface SecretAccount {
  id: number; currency: string; provider: string; accountNumber: string;
  accountName: string; bankName?: string | null; routingNumber?: string | null; isActive: boolean;
}
interface FamilyWill {
  id: number; familyId: number; authorClerkId: string; authorName: string;
  title: string; summary?: string; accessCondition?: string;
  authorizedPersons: AuthorizedPerson[]; linkedAccountIds: number[];
  linkedAccountCount: number; hasEncryptedContent: boolean;
  executors: Executor[]; hasRecovery: boolean; hasPlatformEscrow: boolean;
  adminUnlockPending: boolean; adminUnlockGranted: boolean;
  status: string; createdAt: string; updatedAt: string; revokedAt?: string;
}
interface WillsData { count: number; currentUserClerkId: string; wills: FamilyWill[]; }
interface DecryptedWill {
  willId: number; title: string; authorName: string; accessCondition?: string;
  accessedAt: string; content: string; linkedAccounts: SecretAccount[];
  accessMethod: 'passphrase' | 'recovery' | 'platform-escrow';
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WillsTab({ familyId }: { familyId: number }) {
  const base = getApiBaseUrl();
  const { toast } = useToast();
  const [data, setData] = useState<WillsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [addDlg, setAddDlg]     = useState(false);
  const [editWill, setEditWill] = useState<FamilyWill | null>(null);
  const [accessWill, setAccessWill] = useState<FamilyWill | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${base}/genhal/families/${familyId}/wills`);
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      setData(await res.json());
    } catch (err: any) {
      toast({ variant: 'destructive', title: err.message ?? 'Failed to load wills' });
    } finally { setLoading(false); }
  }, [familyId, base]);

  useEffect(() => { load(); }, [load]);

  const userId  = data?.currentUserClerkId ?? null;
  const myWill  = userId ? (data?.wills.find(w => w.authorClerkId === userId) ?? null) : null;
  const others  = data?.wills.filter(w => w.authorClerkId !== userId) ?? [];

  const handleRevoke = async (will: FamilyWill) => {
    if (!confirm(`Revoke "${will.title}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${base}/genhal/families/${familyId}/wills/${will.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      toast({ title: 'Will revoked' });
      load();
    } catch (err: any) { toast({ variant: 'destructive', title: err.message }); }
  };

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-8 pb-10">
      {/* Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-stone-900 via-amber-950 to-stone-900 text-white p-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-amber-500/20 rounded-xl border border-amber-500/30">
            <Shield className="h-7 w-7 text-amber-300" />
          </div>
          <div>
            <p className="text-2xl font-serif font-bold">
              {data?.count ?? 0} Will{(data?.count ?? 0) !== 1 ? 's' : ''} Registered
            </p>
            <p className="text-white/60 text-sm mt-0.5">
              Family members' last wills &amp; testaments, encrypted and securely stored.
            </p>
          </div>
        </div>
        {!myWill && (
          <Button onClick={() => setAddDlg(true)}
            className="bg-amber-500 hover:bg-amber-400 text-amber-950 font-semibold rounded-full shrink-0">
            <Plus className="mr-2 h-4 w-4" /> Register My Will
          </Button>
        )}
      </div>

      {/* Encryption notice */}
      <div className="flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-200 p-4 dark:bg-blue-500/10 dark:border-blue-500/30">
        <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5 dark:text-blue-300" />
        <div className="text-sm text-blue-800 dark:text-blue-300">
          <p className="font-semibold">End-to-end encrypted with three access layers</p>
          <p className="text-blue-700 mt-0.5 dark:text-blue-300">
            Will content is encrypted with AES-256-GCM. Your passphrase is never stored.
            If you name executors, each receives a one-time recovery code so they can
            access the will even if your passphrase is unknown. A platform admin escrow
            path is the final fallback, requiring death certificate verification.
          </p>
        </div>
      </div>

      {/* My will */}
      {myWill ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-bold flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-600 dark:text-amber-300" /> My Will
            </h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditWill(myWill)}>Edit</Button>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setAccessWill(myWill)}>
                <Eye className="mr-1.5 h-3.5 w-3.5" /> Read
              </Button>
              <Button variant="outline" size="sm" className="rounded-full text-destructive hover:bg-destructive/10 border-destructive/30"
                onClick={() => handleRevoke(myWill)}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Revoke
              </Button>
            </div>
          </div>
          <WillCard will={myWill} isMine onAccess={() => setAccessWill(myWill)} />
        </section>
      ) : (
        <section className="rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50/40 p-8 text-center space-y-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <FileText className="h-12 w-12 text-amber-300 mx-auto" />
          <p className="font-semibold text-amber-900 dark:text-amber-300">You haven't registered a will yet</p>
          <p className="text-sm text-amber-700 max-w-sm mx-auto dark:text-amber-300">
            Register your last will &amp; testament so your wishes are preserved for your family.
          </p>
          <Button onClick={() => setAddDlg(true)} className="rounded-full bg-amber-600 hover:bg-amber-700 text-white mt-2">
            <Plus className="mr-2 h-4 w-4" /> Register My Will
          </Button>
        </section>
      )}

      {/* Others */}
      {others.length > 0 && (
        <section className="space-y-4">
          <h3 className="font-serif text-lg font-bold flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" /> Other Family Members' Wills
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {others.map(w => <WillCard key={w.id} will={w} isMine={false} onAccess={() => setAccessWill(w)} />)}
          </div>
        </section>
      )}

      {data?.count === 0 && (
        <p className="text-center text-muted-foreground py-8 text-sm">
          No other family members have registered a will yet.
        </p>
      )}

      {addDlg && (
        <AddWillDialog open familyId={familyId}
          onClose={() => setAddDlg(false)}
          onSuccess={() => { setAddDlg(false); load(); }} />
      )}
      {editWill && (
        <EditWillDialog open will={editWill} familyId={familyId}
          onClose={() => setEditWill(null)}
          onSuccess={() => { setEditWill(null); load(); }} />
      )}
      {accessWill && (
        <AccessWillDialog open will={accessWill} familyId={familyId}
          onClose={() => setAccessWill(null)} />
      )}
    </div>
  );
}

// ─── WillCard ─────────────────────────────────────────────────────────────────

function WillCard({ will, isMine, onAccess }: { will: FamilyWill; isMine: boolean; onAccess: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className={`border shadow-sm transition-all hover:shadow-md ${isMine ? 'border-amber-300 bg-amber-50/20 dark:border-amber-500/30 dark:bg-amber-500/10' : ''}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl border shrink-0 ${isMine ? 'bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30' : 'bg-stone-50 border-stone-200 dark:bg-white/5 dark:border-white/10'}`}>
              <FileText className={`h-5 w-5 ${isMine ? 'text-amber-600 dark:text-amber-300' : 'text-stone-600 dark:text-muted-foreground'}`} />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight">{will.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                By <span className="font-medium">{will.authorName}</span>{isMine ? ' (you)' : ''}
              </p>
              <p className="text-xs text-muted-foreground">Registered {format(new Date(will.createdAt), 'MMM d, yyyy')}</p>
            </div>
          </div>
          <div className="flex flex-col gap-1 items-end shrink-0">
            {will.hasRecovery && (
              <Badge className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                <Key className="h-2.5 w-2.5 mr-1" /> Recovery enabled
              </Badge>
            )}
            {will.adminUnlockPending && (
              <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
                <Clock className="h-2.5 w-2.5 mr-1" /> Unlock pending
              </Badge>
            )}
            {will.adminUnlockGranted && (
              <Badge className="text-[10px] bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30">
                <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Admin unlocked
              </Badge>
            )}
          </div>
        </div>

        {will.summary && <p className="text-xs text-muted-foreground leading-relaxed">{will.summary}</p>}

        {/* Executors */}
        {will.executors.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground">Executors:</span>
            {will.executors.map((e, i) => (
              <Badge key={i} variant="outline" className="text-[10px] px-2">{e.name}</Badge>
            ))}
          </div>
        )}

        {/* Authorized persons */}
        {will.authorizedPersons.length > 0 && (
          <div className="space-y-1.5">
            <button className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setExpanded(e => !e)}>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {will.authorizedPersons.length} authorized person{will.authorizedPersons.length !== 1 ? 's' : ''}
            </button>
            {expanded && (
              <div className="space-y-1.5 pt-1">
                {will.authorizedPersons.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-muted/40 rounded-lg px-3 py-1.5">
                    <User className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted-foreground">· {p.relationship}</span>
                    {p.email && <span className="text-muted-foreground ml-auto">{p.email}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {will.linkedAccountCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 dark:bg-emerald-500/10 dark:border-emerald-500/30">
            <CreditCard className="h-3.5 w-3.5 text-emerald-600 shrink-0 dark:text-emerald-300" />
            <p className="text-xs text-emerald-800 dark:text-emerald-300">
              <span className="font-semibold">{will.linkedAccountCount}</span> linked account{will.linkedAccountCount !== 1 ? 's' : ''} — revealed after decryption
            </p>
          </div>
        )}

        {will.hasEncryptedContent && (
          <Button variant="outline" size="sm" className="w-full rounded-xl" onClick={onAccess}>
            <Unlock className="mr-2 h-3.5 w-3.5" /> Read Will Content
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── AddWillDialog ────────────────────────────────────────────────────────────

function AddWillDialog({ open, familyId, onClose, onSuccess }: {
  open: boolean; familyId: number; onClose: () => void; onSuccess: () => void;
}) {
  const base = getApiBaseUrl();
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [saving, setSaving] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showPassConfirm, setShowPassConfirm] = useState(false);
  const [persons, setPersons] = useState<AuthorizedPerson[]>([]);
  const [executors, setExecutors] = useState<Executor[]>([]);
  const [linkedAccountIds, setLinkedAccountIds] = useState<number[]>([]);
  const [recoveryResult, setRecoveryResult] = useState<{ code: string; executors: Executor[] } | null>(null);

  const [form, setForm] = useState({
    title: 'My Last Will & Testament',
    authorName: '',
    content: '',
    summary: '',
    passphrase: '',
    passphraseConfirm: '',
    accessCondition: '',
  });
  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

  const addPerson = () => setPersons(p => [...p, { name: '', email: '', relationship: '' }]);
  const removePerson = (i: number) => setPersons(p => p.filter((_, j) => j !== i));
  const setPerson = (i: number, patch: Partial<AuthorizedPerson>) =>
    setPersons(p => p.map((x, j) => j === i ? { ...x, ...patch } : x));

  const addExecutor = () => { if (executors.length < 5) setExecutors(e => [...e, { name: '', email: '' }]); };
  const removeExecutor = (i: number) => setExecutors(e => e.filter((_, j) => j !== i));
  const setExecutor = (i: number, patch: Partial<Executor>) =>
    setExecutors(e => e.map((x, j) => j === i ? { ...x, ...patch } : x));

  const submit = async (): Promise<void> => {
    if (!form.content.trim()) { toast({ variant: 'destructive', title: 'Please write your will content' }); return; }
    if (!form.passphrase) { toast({ variant: 'destructive', title: 'Please set a passphrase' }); return; }
    if (form.passphrase !== form.passphraseConfirm) { toast({ variant: 'destructive', title: 'Passphrases do not match' }); return; }
    if (form.passphrase.length < 8) { toast({ variant: 'destructive', title: 'Passphrase must be at least 8 characters' }); return; }

    const validExecutors = executors.filter(e => e.name.trim() && e.email.trim());
    setSaving(true);
    try {
      const res = await fetch(`${base}/genhal/families/${familyId}/wills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          authorName: form.authorName || undefined,
          content: form.content,
          passphrase: form.passphrase,
          summary: form.summary || undefined,
          accessCondition: form.accessCondition || undefined,
          authorizedPersons: persons.filter(p => p.name && p.relationship),
          linkedAccountIds,
          executors: validExecutors,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      const data = await res.json();
      if (data.recoveryCode && validExecutors.length > 0) {
        // Show recovery code modal before closing
        setRecoveryResult({ code: data.recoveryCode, executors: validExecutors });
      } else {
        toast({ title: 'Will registered and encrypted!' });
        onSuccess();
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: err.message });
    } finally { setSaving(false); }
  };

  if (recoveryResult) {
    return (
      <RecoveryCodeModal
        open
        recoveryCode={recoveryResult.code}
        executors={recoveryResult.executors}
        onConfirmed={() => { setRecoveryResult(null); toast({ title: 'Will registered and encrypted!' }); onSuccess(); }}
      />
    );
  }

  const STEP_LABELS = ['Write Will', 'Set Passphrase', 'Name Executors', 'Persons & Accounts'];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-600 dark:text-amber-300" /> Register Your Will
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 mb-2">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className="flex items-center gap-1.5">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                step === s ? 'bg-amber-500 text-white' :
                step > s   ? 'bg-green-500 text-white' :
                             'bg-muted text-muted-foreground'}`}>
                {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
              </div>
              <span className="text-xs text-muted-foreground hidden sm:block">{STEP_LABELS[s - 1]}</span>
              {s < 4 && <div className="h-px w-4 bg-border" />}
            </div>
          ))}
        </div>

        <div className="space-y-4 pt-2">
          {/* ── Step 1: Content ── */}
          {step === 1 && (
            <>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300">
                <p className="font-semibold mb-1">Your content will be encrypted</p>
                <p>Write your will freely. It is encrypted with AES-256-GCM. No one can read it without the passphrase you set in the next step.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Your full name *">
                  <Input value={form.authorName} onChange={e => set({ authorName: e.target.value })}
                    placeholder="As it should appear on the will" className="rounded-lg" />
                </Field>
                <Field label="Will title">
                  <Input value={form.title} onChange={e => set({ title: e.target.value })} className="rounded-lg" />
                </Field>
              </div>
              <Field label="Will Content *">
                <Textarea value={form.content} onChange={e => set({ content: e.target.value })} rows={12}
                  className="rounded-lg font-mono text-sm resize-none"
                  placeholder={`I, [Your Name], being of sound mind and body, hereby declare this to be my Last Will and Testament...\n\nI appoint [Executor Name] as the executor of this will...\n\nI bequeath the following:\n\n1. To [Name]: ...\n2. To [Name]: ...`} />
                <p className="text-xs text-muted-foreground text-right">{form.content.length} characters</p>
              </Field>
              <Field label="Non-sensitive summary (visible without passphrase)">
                <Input value={form.summary} onChange={e => set({ summary: e.target.value })} className="rounded-lg"
                  placeholder="e.g. Covers property, savings, and guardianship of children" />
              </Field>
              <Button className="w-full rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
                disabled={!form.content.trim()} onClick={() => setStep(2)}>
                Next: Set Passphrase →
              </Button>
            </>
          )}

          {/* ── Step 2: Passphrase ── */}
          {step === 2 && (
            <>
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300">
                <p className="font-semibold mb-1">Choose a strong passphrase</p>
                <p>This passphrase encrypts your will. <strong>It is never stored.</strong> If you name executors in the next step, they will receive a separate one-time recovery code so the will can be accessed even if your passphrase is unknown.</p>
              </div>
              <Field label="Passphrase *">
                <div className="relative">
                  <Input type={showPass ? 'text' : 'password'} value={form.passphrase}
                    onChange={e => set({ passphrase: e.target.value })} className="rounded-lg pr-10"
                    placeholder="At least 8 characters" />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <PassphraseStrength passphrase={form.passphrase} />
              </Field>
              <Field label="Confirm passphrase *">
                <div className="relative">
                  <Input type={showPassConfirm ? 'text' : 'password'} value={form.passphraseConfirm}
                    onChange={e => set({ passphraseConfirm: e.target.value })} className="rounded-lg pr-10" />
                  <button type="button" onClick={() => setShowPassConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {form.passphraseConfirm && form.passphrase !== form.passphraseConfirm && (
                  <p className="text-xs text-destructive mt-1">Passphrases do not match</p>
                )}
              </Field>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setStep(1)}>← Back</Button>
                <Button className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={!form.passphrase || form.passphrase.length < 8 || form.passphrase !== form.passphraseConfirm}
                  onClick={() => setStep(3)}>
                  Next: Name Executors →
                </Button>
              </div>
            </>
          )}

          {/* ── Step 3: Executors ── */}
          {step === 3 && (
            <>
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900 space-y-2 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300">
                <p className="font-semibold flex items-center gap-2"><Key className="h-4 w-4" /> Name your will executors</p>
                <p className="text-emerald-800 leading-relaxed dark:text-emerald-300">
                  Executors receive a <strong>one-time recovery code</strong> by email. If you pass away and
                  your passphrase is unknown, any living executor can use their code to decrypt the will.
                  <strong> This is the recommended path for ensuring your will can always be read.</strong>
                </p>
                <p className="text-emerald-700 text-xs dark:text-emerald-300">
                  Name up to 5 people. The more you name, the safer — if some are also deceased, others can still unlock.
                  Recovery codes are shown once and emailed to each executor. Platform staff cannot read them.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Executors ({executors.length}/5)</Label>
                  {executors.length < 5 && (
                    <Button variant="outline" size="sm" className="rounded-full h-7 text-xs" onClick={addExecutor}>
                      <UserPlus className="mr-1 h-3 w-3" /> Add Executor
                    </Button>
                  )}
                </div>

                {executors.length === 0 ? (
                  <div className="text-center py-6 rounded-xl bg-muted/30 border border-dashed space-y-2">
                    <Key className="h-8 w-8 mx-auto text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No executors added</p>
                    <p className="text-xs text-muted-foreground">
                      Without executors, only someone who knows your passphrase can open the will.
                    </p>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={addExecutor}>
                      <UserPlus className="mr-1 h-3 w-3" /> Add an Executor
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {executors.map((e, i) => (
                      <div key={i} className="p-3 rounded-xl border bg-muted/20 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                            <Mail className="h-3 w-3" /> Executor {i + 1}
                          </p>
                          <button onClick={() => removeExecutor(i)} className="text-muted-foreground/40 hover:text-destructive">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input value={e.name} onChange={ev => setExecutor(i, { name: ev.target.value })}
                            placeholder="Full name *" className="rounded-lg text-sm h-8" />
                          <Input value={e.email} onChange={ev => setExecutor(i, { email: ev.target.value })}
                            placeholder="Email address *" type="email" className="rounded-lg text-sm h-8" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {executors.length === 0 && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <p>Proceeding without executors means this will can only be opened with your passphrase. You can still continue.</p>
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setStep(2)}>← Back</Button>
                <Button className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setStep(4)}>
                  Next: Persons & Accounts →
                </Button>
              </div>
            </>
          )}

          {/* ── Step 4: Authorized persons + accounts ── */}
          {step === 4 && (
            <>
              <Field label="Access condition (optional)">
                <Input value={form.accessCondition} onChange={e => set({ accessCondition: e.target.value })}
                  className="rounded-lg" placeholder="e.g. Upon my death, verified by two family elders" />
              </Field>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Authorized Persons</Label>
                  <Button variant="outline" size="sm" className="rounded-full h-7 text-xs" onClick={addPerson}>
                    <UserPlus className="mr-1 h-3 w-3" /> Add Person
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  People you plan to share the passphrase with — visible to all family members as metadata.
                </p>
                {persons.length === 0 ? (
                  <div className="text-center py-4 rounded-xl bg-muted/30 border border-dashed">
                    <p className="text-sm text-muted-foreground">No persons added</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {persons.map((p, i) => (
                      <div key={i} className="p-3 rounded-xl border bg-muted/20 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-muted-foreground">Person {i + 1}</p>
                          <button onClick={() => removePerson(i)} className="text-muted-foreground/40 hover:text-destructive">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input value={p.name} onChange={e => setPerson(i, { name: e.target.value })}
                            placeholder="Full name *" className="rounded-lg text-sm h-8" />
                          <Input value={p.relationship} onChange={e => setPerson(i, { relationship: e.target.value })}
                            placeholder="Relationship *" className="rounded-lg text-sm h-8" />
                          <Input value={p.email} onChange={e => setPerson(i, { email: e.target.value })}
                            placeholder="Email (optional)" className="rounded-lg text-sm h-8 col-span-2" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <AccountSelector familyId={familyId} selected={linkedAccountIds} onChange={setLinkedAccountIds} />

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setStep(3)}>← Back</Button>
                <Button className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={saving} onClick={submit}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Shield className="mr-2 h-4 w-4" />}
                  {saving ? 'Encrypting & Saving…' : 'Save Will Securely'}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── RecoveryCodeModal ────────────────────────────────────────────────────────

function RecoveryCodeModal({ open, recoveryCode, executors, onConfirmed }: {
  open: boolean; recoveryCode: string; executors: Executor[]; onConfirmed: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Format as groups of 6 for readability
  const formatted = recoveryCode.match(/.{1,6}/g)?.join('  ') ?? recoveryCode;

  const copy = async () => {
    await navigator.clipboard.writeText(recoveryCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-[540px]" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Key className="h-5 w-5 text-amber-600 dark:text-amber-300" /> Save Your Recovery Code
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4 dark:bg-red-500/10 dark:border-red-500/30">
            <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5 dark:text-red-300" />
            <div className="text-sm text-red-900 dark:text-red-300">
              <p className="font-bold">This code is shown ONCE and never stored.</p>
              <p className="text-red-800 mt-1 leading-relaxed dark:text-red-300">
                Copy it now and store it somewhere safe (password manager, printed document, sealed envelope).
                Your named executors have also been sent this code by email.
              </p>
            </div>
          </div>

          {/* The code */}
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5 text-center space-y-3 dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider dark:text-amber-300">Will Recovery Code</p>
            <p className="font-mono text-lg font-bold tracking-widest text-stone-900 break-all leading-relaxed dark:text-foreground">
              {formatted}
            </p>
            <Button variant="outline" size="sm" className="rounded-full" onClick={copy}>
              {copied ? <><Check className="mr-1.5 h-3.5 w-3.5 text-green-600 dark:text-green-300" /> Copied!</> : <><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy to clipboard</>}
            </Button>
          </div>

          {/* Executor emails */}
          {executors.length > 0 && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm dark:bg-emerald-500/10 dark:border-emerald-500/30">
              <p className="font-semibold text-emerald-900 flex items-center gap-2 mb-2 dark:text-emerald-300">
                <Mail className="h-4 w-4" /> Code emailed to your executors:
              </p>
              <div className="space-y-1">
                {executors.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 dark:text-emerald-300" />
                    <span className="font-medium">{e.name}</span>
                    <span className="text-emerald-600 dark:text-emerald-300">— {e.email}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confirmation checkbox */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
              className="mt-0.5 accent-amber-600 w-4 h-4" />
            <span className="text-sm text-foreground leading-relaxed">
              I have saved the recovery code in a secure location. I understand it cannot be retrieved from GenHaL.
            </span>
          </label>

          <Button className="w-full rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
            disabled={!confirmed} onClick={onConfirmed}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> I've saved the code — continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── EditWillDialog ───────────────────────────────────────────────────────────

function EditWillDialog({ open, will, familyId, onClose, onSuccess }: {
  open: boolean; will: FamilyWill; familyId: number; onClose: () => void; onSuccess: () => void;
}) {
  const base = getApiBaseUrl();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [updateContent, setUpdateContent] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [persons, setPersons] = useState<AuthorizedPerson[]>(will.authorizedPersons);
  const [linkedAccountIds, setLinkedAccountIds] = useState<number[]>(will.linkedAccountIds ?? []);
  const [recoveryResult, setRecoveryResult] = useState<{ code: string; executors: Executor[] } | null>(null);

  const [form, setForm] = useState({
    title: will.title, summary: will.summary ?? '',
    accessCondition: will.accessCondition ?? '',
    content: '', passphrase: '',
  });
  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

  const addPerson = () => setPersons(p => [...p, { name: '', email: '', relationship: '' }]);
  const removePerson = (i: number) => setPersons(p => p.filter((_, j) => j !== i));
  const setPerson = (i: number, patch: Partial<AuthorizedPerson>) =>
    setPersons(p => p.map((x, j) => j === i ? { ...x, ...patch } : x));

  const submit = async (): Promise<void> => {
    setSaving(true);
    try {
      const body: Record<string, any> = {
        title: form.title, summary: form.summary || undefined,
        accessCondition: form.accessCondition || undefined,
        authorizedPersons: persons.filter(p => p.name && p.relationship),
        linkedAccountIds,
      };
      if (updateContent) {
        if (!form.content.trim()) { setSaving(false); toast({ variant: 'destructive', title: 'Will content cannot be empty' }); return; }
        if (!form.passphrase) { setSaving(false); toast({ variant: 'destructive', title: 'Passphrase required to update content' }); return; }
        body.content = form.content;
        body.passphrase = form.passphrase;
      }
      const res = await fetch(`${base}/genhal/families/${familyId}/wills/${will.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      const data = await res.json();
      if (data.recoveryCode && will.executors.length > 0) {
        setRecoveryResult({ code: data.recoveryCode, executors: will.executors });
      } else {
        toast({ title: 'Will updated!' });
        onSuccess();
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: err.message });
    } finally { setSaving(false); }
  };

  if (recoveryResult) {
    return (
      <RecoveryCodeModal open recoveryCode={recoveryResult.code} executors={recoveryResult.executors}
        onConfirmed={() => { setRecoveryResult(null); toast({ title: 'Will updated!' }); onSuccess(); }} />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-serif text-xl">Edit Will</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <Field label="Title"><Input value={form.title} onChange={e => set({ title: e.target.value })} className="rounded-lg" /></Field>
          <Field label="Summary"><Input value={form.summary} onChange={e => set({ summary: e.target.value })} className="rounded-lg" /></Field>
          <Field label="Access condition"><Input value={form.accessCondition} onChange={e => set({ accessCondition: e.target.value })} className="rounded-lg" /></Field>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Authorized Persons</Label>
              <Button variant="outline" size="sm" className="rounded-full h-7 text-xs" onClick={addPerson}>
                <UserPlus className="mr-1 h-3 w-3" /> Add
              </Button>
            </div>
            {persons.map((p, i) => (
              <div key={i} className="p-3 rounded-xl border bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">Person {i + 1}</p>
                  <button onClick={() => removePerson(i)} className="text-muted-foreground/40 hover:text-destructive"><X className="h-4 w-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={p.name} onChange={e => setPerson(i, { name: e.target.value })} placeholder="Full name *" className="rounded-lg text-sm h-8" />
                  <Input value={p.relationship} onChange={e => setPerson(i, { relationship: e.target.value })} placeholder="Relationship *" className="rounded-lg text-sm h-8" />
                  <Input value={p.email} onChange={e => setPerson(i, { email: e.target.value })} placeholder="Email" className="rounded-lg text-sm h-8 col-span-2" />
                </div>
              </div>
            ))}
          </div>

          <AccountSelector familyId={familyId} selected={linkedAccountIds} onChange={setLinkedAccountIds} />

          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border">
            <Switch checked={updateContent} onCheckedChange={setUpdateContent} />
            <Label className="text-sm">Update will content (requires passphrase — new recovery codes will be issued)</Label>
          </div>
          {updateContent && (
            <>
              <Field label="New will content *">
                <Textarea value={form.content} onChange={e => set({ content: e.target.value })} rows={8} className="rounded-lg font-mono text-sm resize-none" />
              </Field>
              <Field label="New passphrase *">
                <div className="relative">
                  <Input type={showPass ? 'text' : 'password'} value={form.passphrase}
                    onChange={e => set({ passphrase: e.target.value })} className="rounded-lg pr-10" />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-amber-700 mt-1 dark:text-amber-300">⚠ Replaces the existing passphrase entirely. Old recovery codes are invalidated.</p>
              </Field>
            </>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>Cancel</Button>
            <Button className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white" disabled={saving} onClick={submit}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── AccessWillDialog ─────────────────────────────────────────────────────────

function AccessWillDialog({ open, will, familyId, onClose }: {
  open: boolean; will: FamilyWill; familyId: number; onClose: () => void;
}) {
  const base = getApiBaseUrl();
  const [result, setResult] = useState<DecryptedWill | null>(null);

  const defaultTab = will.adminUnlockGranted ? 'escrow'
    : will.hasRecovery ? 'passphrase'
    : 'passphrase';

  const handleClose = () => { onClose(); setResult(null); };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Unlock className="h-5 w-5 text-amber-600 dark:text-amber-300" />
            {result ? 'Will Content' : 'Access Will'}
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <DecryptedView result={result} onBack={() => setResult(null)} />
        ) : (
          <>
            {/* Will info */}
            <div className="rounded-xl bg-stone-50 border p-4 space-y-2 mt-2 dark:bg-white/5">
              <p className="font-semibold text-sm">{will.title}</p>
              <p className="text-xs text-muted-foreground">By {will.authorName}</p>
              {will.accessCondition && (
                <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 rounded-lg p-2 border border-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {will.accessCondition}
                </div>
              )}
            </div>

            <Tabs defaultValue={defaultTab} className="mt-2">
              <TabsList className={`rounded-xl w-full grid ${
                will.hasRecovery && will.hasPlatformEscrow ? 'grid-cols-3'
                : will.hasRecovery ? 'grid-cols-2'
                : 'grid-cols-1'
              }`}>
                <TabsTrigger value="passphrase" className="rounded-lg text-xs">
                  <Lock className="h-3.5 w-3.5 mr-1.5" /> Passphrase
                </TabsTrigger>
                {will.hasRecovery && (
                  <TabsTrigger value="recovery" className="rounded-lg text-xs">
                    <Key className="h-3.5 w-3.5 mr-1.5" /> Executor Code
                  </TabsTrigger>
                )}
                {will.hasPlatformEscrow && (
                  <TabsTrigger value="escrow" className="rounded-lg text-xs">
                    <ShieldAlert className="h-3.5 w-3.5 mr-1.5" /> Admin Unlock
                  </TabsTrigger>
                )}
              </TabsList>

              {/* Passphrase tab */}
              <TabsContent value="passphrase" className="mt-4">
                <PassphraseAccessForm base={base} will={will} familyId={familyId} onResult={setResult} />
              </TabsContent>

              {/* Recovery code tab */}
              {will.hasRecovery && (
                <TabsContent value="recovery" className="mt-4">
                  <RecoveryAccessForm base={base} will={will} familyId={familyId} onResult={setResult} />
                </TabsContent>
              )}

              {/* Admin escrow tab */}
              {will.hasPlatformEscrow && (
                <TabsContent value="escrow" className="mt-4">
                  <EscrowAccessForm base={base} will={will} familyId={familyId} onResult={setResult} />
                </TabsContent>
              )}
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-forms for AccessWillDialog ──────────────────────────────────────────

function PassphraseAccessForm({ base, will, familyId, onResult }: {
  base: string; will: FamilyWill; familyId: number; onResult: (r: DecryptedWill) => void;
}) {
  const { toast } = useToast();
  const [passphrase, setPassphrase] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!passphrase) return;
    setLoading(true);
    try {
      const res = await fetch(`${base}/genhal/families/${familyId}/wills/${will.id}/access`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      onResult(await res.json());
    } catch (err: any) {
      toast({ variant: 'destructive', title: err.message });
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300">
        <p className="font-semibold mb-0.5">Owner's passphrase</p>
        <p>Enter the passphrase set by {will.authorName} when the will was created. The passphrase is never sent — only a hash is verified.</p>
      </div>
      <Field label="Passphrase">
        <div className="relative">
          <Input type={showPass ? 'text' : 'password'} value={passphrase}
            onChange={e => setPassphrase(e.target.value)} className="rounded-lg pr-10"
            placeholder="Enter the will passphrase" onKeyDown={e => e.key === 'Enter' && submit()} autoFocus />
          <button type="button" onClick={() => setShowPass(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>
      <Button className="w-full rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
        disabled={!passphrase || loading} onClick={submit}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlock className="mr-2 h-4 w-4" />}
        {loading ? 'Decrypting…' : 'Decrypt & Read Will'}
      </Button>
    </div>
  );
}

function RecoveryAccessForm({ base, will, familyId, onResult }: {
  base: string; will: FamilyWill; familyId: number; onResult: (r: DecryptedWill) => void;
}) {
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${base}/genhal/families/${familyId}/wills/${will.id}/recovery-access`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recoveryCode: code.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      onResult(await res.json());
    } catch (err: any) {
      toast({ variant: 'destructive', title: err.message });
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-900 space-y-1 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300">
        <p className="font-semibold flex items-center gap-2"><Key className="h-4 w-4" /> Executor recovery code</p>
        <p className="text-emerald-800 dark:text-emerald-300">
          This path is for named executors. Enter the recovery code that was emailed to you when
          {' '}{will.authorName} registered this will.
        </p>
        {will.executors.length > 0 && (
          <p className="text-xs text-emerald-700 dark:text-emerald-300">
            Named executors: {will.executors.map(e => e.name).join(', ')}
          </p>
        )}
      </div>
      <Field label="Recovery Code">
        <Input value={code} onChange={e => setCode(e.target.value)} className="rounded-lg font-mono"
          placeholder="Paste your recovery code here…" onKeyDown={e => e.key === 'Enter' && submit()} />
      </Field>
      <Button className="w-full rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white"
        disabled={!code.trim() || loading} onClick={submit}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Key className="mr-2 h-4 w-4" />}
        {loading ? 'Verifying…' : 'Unlock with Recovery Code'}
      </Button>
    </div>
  );
}

function EscrowAccessForm({ base, will, familyId, onResult }: {
  base: string; will: FamilyWill; familyId: number; onResult: (r: DecryptedWill) => void;
}) {
  const { toast } = useToast();
  const [certUrl, setCertUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requested, setRequested] = useState(false);
  const [loading, setLoading] = useState(false);

  const submitRequest = async () => {
    if (!certUrl.trim()) { toast({ variant: 'destructive', title: 'Death certificate URL is required' }); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${base}/genhal/families/${familyId}/wills/${will.id}/request-unlock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deathCertUrl: certUrl.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      setRequested(true);
      toast({ title: 'Request submitted', description: 'A platform admin will review the certificate and grant access.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: err.message });
    } finally { setSubmitting(false); }
  };

  const useEscrow = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${base}/genhal/families/${familyId}/wills/${will.id}/escrow-access`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      onResult(await res.json());
    } catch (err: any) {
      toast({ variant: 'destructive', title: err.message });
    } finally { setLoading(false); }
  };

  if (will.adminUnlockGranted) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-900 space-y-1 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300">
          <p className="font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-300" /> Admin unlock approved
          </p>
          <p className="text-blue-800 dark:text-blue-300">
            A platform admin has verified the death certificate and granted access to this will.
            Click below to decrypt using the platform escrow key.
          </p>
        </div>
        <Button className="w-full rounded-xl bg-blue-700 hover:bg-blue-800 text-white" disabled={loading} onClick={useEscrow}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
          {loading ? 'Decrypting…' : 'Access via Admin Escrow'}
        </Button>
      </div>
    );
  }

  if (will.adminUnlockPending || requested) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-5 text-center space-y-3 dark:bg-amber-500/10 dark:border-amber-500/30">
        <Clock className="h-8 w-8 text-amber-600 mx-auto dark:text-amber-300" />
        <p className="font-semibold text-amber-900 dark:text-amber-300">Unlock request under review</p>
        <p className="text-sm text-amber-800 leading-relaxed dark:text-amber-300">
          Your death certificate has been submitted and is awaiting admin review.
          Once approved, return here and use the "Admin Unlock" tab to decrypt the will.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-stone-50 border p-4 text-sm text-stone-800 space-y-2 dark:bg-white/5 dark:text-foreground">
        <p className="font-semibold flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-stone-600 dark:text-muted-foreground" /> Last resort — Admin escrow unlock
        </p>
        <p className="text-stone-700 leading-relaxed dark:text-foreground">
          Use this path only if all named executors are unavailable and the owner's passphrase is unknown.
          A platform admin will verify the death certificate before granting access. This typically takes
          1–3 business days.
        </p>
      </div>
      <Field label="Death certificate URL">
        <Input value={certUrl} onChange={e => setCertUrl(e.target.value)} className="rounded-lg"
          placeholder="Link to a scanned death certificate (cloud storage, Google Drive, etc.)" />
        <p className="text-xs text-muted-foreground mt-1">
          Upload your document to Google Drive, Dropbox, or similar and paste the share link here.
        </p>
      </Field>
      <Button className="w-full rounded-xl bg-stone-800 hover:bg-stone-900 text-white"
        disabled={!certUrl.trim() || submitting} onClick={submitRequest}>
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
        {submitting ? 'Submitting…' : 'Submit for Admin Review'}
      </Button>
    </div>
  );
}

// ─── DecryptedView ────────────────────────────────────────────────────────────

function DecryptedView({ result, onBack }: { result: DecryptedWill; onBack: () => void }) {
  const handlePrint = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><head><title>${result.title}</title>
      <style>body{font-family:serif;max-width:700px;margin:40px auto;padding:20px;line-height:1.8}
      h1{font-size:1.6rem;border-bottom:2px solid #000;padding-bottom:12px}
      .meta{color:#555;font-size:.9rem;margin-bottom:24px}
      pre{white-space:pre-wrap;font-family:serif;font-size:1rem;line-height:1.8}
      .footer{margin-top:40px;border-top:1px solid #ccc;padding-top:12px;color:#888;font-size:.8rem}
      </style></head><body>
      <h1>${result.title}</h1>
      <div class="meta">
        <p>By: ${result.authorName}</p>
        ${result.accessCondition ? `<p>Condition: ${result.accessCondition}</p>` : ''}
        <p>Accessed: ${format(new Date(result.accessedAt), 'MMMM d, yyyy HH:mm')}</p>
        <p>Access method: ${result.accessMethod}</p>
      </div>
      <pre>${result.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
      <div class="footer">Decrypted from the GenHaL Family Heritage Platform</div>
      </body></html>`);
    win.document.close(); win.print();
  };

  const methodLabel = {
    passphrase: 'Owner passphrase',
    recovery: 'Executor recovery code',
    'platform-escrow': 'Platform admin escrow',
  }[result.accessMethod] ?? result.accessMethod;

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 text-green-700 font-semibold dark:text-green-300">
          <CheckCircle2 className="h-3.5 w-3.5" /> Decrypted via {methodLabel}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {format(new Date(result.accessedAt), 'HH:mm, MMM d yyyy')}
        </span>
      </div>

      <div className="rounded-xl border bg-stone-50 overflow-hidden dark:bg-white/5">
        <div className="bg-stone-200/50 px-4 py-3 border-b flex items-center justify-between dark:bg-white/[0.14]">
          <div>
            <p className="font-serif font-bold text-lg">{result.title}</p>
            <p className="text-xs text-muted-foreground">By {result.authorName}</p>
          </div>
          <Button variant="outline" size="sm" className="rounded-full" onClick={handlePrint}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
          </Button>
        </div>
        {result.accessCondition && (
          <div className="px-4 py-2 bg-amber-50 border-b text-xs text-amber-800 flex items-start gap-2 dark:bg-amber-500/10 dark:text-amber-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {result.accessCondition}
          </div>
        )}
        <div className="p-4 max-h-60 overflow-y-auto">
          <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-foreground">{result.content}</pre>
        </div>
      </div>

      {result.linkedAccounts?.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
            Linked Bank Accounts ({result.linkedAccounts.length})
          </p>
          <div className="space-y-2">
            {result.linkedAccounts.map(acc => <LinkedAccountCard key={acc.id} account={acc} />)}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-800 dark:bg-yellow-500/10 dark:border-yellow-500/30 dark:text-yellow-300">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <p>Content shown for this session only — not stored in your browser. Close when done.</p>
      </div>
      <Button variant="outline" className="w-full rounded-xl" onClick={onBack}>← Access Another Will</Button>
    </div>
  );
}

// ─── LinkedAccountCard ────────────────────────────────────────────────────────

function LinkedAccountCard({ account: a }: { account: SecretAccount }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-emerald-50/50 border-emerald-200 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
      <div className="p-1.5 rounded-lg bg-emerald-100 shrink-0 dark:bg-emerald-500/15">
        <CreditCard className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm">{a.accountName}</p>
          <Badge className={`text-[10px] ${a.isActive ? 'bg-emerald-500' : 'bg-muted'} text-white`}>
            {a.isActive ? 'Active' : 'Inactive'}
          </Badge>
          <Badge variant="outline" className="text-[10px]">{a.currency}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{a.provider}{a.bankName ? ` · ${a.bankName}` : ''}</p>
        <p className="text-xs font-mono text-stone-700 mt-0.5 dark:text-foreground">{a.accountNumber}</p>
        {a.routingNumber && <p className="text-xs text-muted-foreground">Routing: {a.routingNumber}</p>}
      </div>
    </div>
  );
}

// ─── PassphraseStrength ───────────────────────────────────────────────────────

function PassphraseStrength({ passphrase }: { passphrase: string }) {
  if (!passphrase) return null;
  const len = passphrase.length;
  const hasUpper = /[A-Z]/.test(passphrase);
  const hasLower = /[a-z]/.test(passphrase);
  const hasDigit = /[0-9]/.test(passphrase);
  const hasSpecial = /[^A-Za-z0-9]/.test(passphrase);
  const score = [len >= 12, hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const colors = ['', 'bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-400', 'bg-emerald-600'];
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex gap-1">{[1,2,3,4,5].map(i => (
        <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= score ? colors[score] : 'bg-muted'}`} />
      ))}</div>
      <p className="text-xs text-muted-foreground">{labels[score]}</p>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}

// ─── AccountSelector ─────────────────────────────────────────────────────────

function AccountSelector({ familyId, selected, onChange }: {
  familyId: number; selected: number[]; onChange: (ids: number[]) => void;
}) {
  const base = getApiBaseUrl();
  const [accounts, setAccounts] = useState<SecretAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${base}/genhal/accounts/family/${familyId}`);
        if (!res.ok) return;
        const data = await res.json();
        setAccounts(Array.isArray(data) ? data : data.accounts ?? []);
      } catch { /* silently skip */ } finally { setLoading(false); }
    })();
  }, [familyId, base]);

  const toggle = (id: number) =>
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);

  if (loading) return (
    <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading family accounts…
    </div>
  );
  if (accounts.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-sm font-semibold flex items-center gap-1.5">
          <CreditCard className="h-4 w-4 text-emerald-600 dark:text-emerald-300" /> Link Secret Accounts
        </Label>
        {selected.length > 0 && <Badge className="bg-emerald-500 text-white text-[10px]">{selected.length} selected</Badge>}
      </div>
      <p className="text-xs text-muted-foreground">
        Account details are only revealed after the will is opened with the correct passphrase or recovery code.
      </p>
      <div className="space-y-2">
        {accounts.map(a => (
          <label key={a.id} className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer hover:bg-muted/20 transition-colors">
            <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} className="accent-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{a.accountName}</p>
              <p className="text-xs text-muted-foreground">{a.provider} · {a.currency} · {a.accountNumber}</p>
            </div>
            <Badge className={`text-[10px] shrink-0 ${a.isActive ? 'bg-emerald-500' : 'bg-muted'} text-white`}>
              {a.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </label>
        ))}
      </div>
    </div>
  );
}
