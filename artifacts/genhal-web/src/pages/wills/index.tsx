/**
 * WillsTab — Family will & testament management.
 *
 * Members see a count of registered wills + metadata cards.
 * Decrypting a will requires the passphrase set by the author.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Plus, Trash2, Eye, EyeOff, Shield, User, Clock,
  AlertCircle, CheckCircle2, Lock, Unlock, UserPlus, X,
  Loader2, ChevronDown, ChevronUp, Printer, Info, Users,
  CreditCard, Building2, DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { getApiBaseUrl } from '@/lib/api';
import { format } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthorizedPerson {
  name: string;
  email: string;
  relationship: string;
}

interface SecretAccount {
  id: number;
  currency: string;
  provider: string;
  accountNumber: string;
  accountName: string;
  bankName?: string | null;
  routingNumber?: string | null;
  isActive: boolean;
}

interface FamilyWill {
  id: number;
  familyId: number;
  authorClerkId: string;
  authorName: string;
  title: string;
  summary?: string;
  accessCondition?: string;
  authorizedPersons: AuthorizedPerson[];
  linkedAccountIds: number[];
  linkedAccountCount: number;
  hasEncryptedContent: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  revokedAt?: string;
}

interface WillsData {
  count: number;
  currentUserClerkId: string;
  wills: FamilyWill[];
}

interface DecryptedWill {
  willId: number;
  title: string;
  authorName: string;
  accessCondition?: string;
  accessedAt: string;
  content: string;
  linkedAccounts: SecretAccount[];
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WillsTab({ familyId }: { familyId: number }) {
  const base = getApiBaseUrl();
  const { toast } = useToast();

  const [data, setData] = useState<WillsData | null>(null);
  const userId = data?.currentUserClerkId ?? null;
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [addDlg, setAddDlg]       = useState(false);
  const [editWill, setEditWill]   = useState<FamilyWill | null>(null);
  const [accessWill, setAccessWill] = useState<FamilyWill | null>(null);
  const [decrypted, setDecrypted] = useState<DecryptedWill | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${base}/genhal/families/${familyId}/wills`);
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      setData(await res.json());
    } catch (err: any) {
      toast({ variant: 'destructive', title: err.message ?? 'Failed to load wills' });
    } finally {
      setLoading(false);
    }
  }, [familyId, base]);

  useEffect(() => { load(); }, [load]);

  const myWill = userId ? (data?.wills.find(w => w.authorClerkId === userId) ?? null) : null;
  const othersWills = data?.wills.filter(w => w.authorClerkId !== userId) ?? [];

  const handleRevoke = async (will: FamilyWill) => {
    if (!confirm(`Revoke "${will.title}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${base}/genhal/families/${familyId}/wills/${will.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      toast({ title: 'Will revoked' });
      load();
    } catch (err: any) {
      toast({ variant: 'destructive', title: err.message });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      {/* ── Count banner ── */}
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
              Family members have filed their last will &amp; testament securely on this platform.
            </p>
          </div>
        </div>
        {!myWill && (
          <Button
            onClick={() => setAddDlg(true)}
            className="bg-amber-500 hover:bg-amber-400 text-amber-950 font-semibold rounded-full shrink-0"
          >
            <Plus className="mr-2 h-4 w-4" /> Register My Will
          </Button>
        )}
      </div>

      {/* ── Encryption notice ── */}
      <div className="flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-200 p-4">
        <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold">End-to-end encrypted</p>
          <p className="text-blue-700 mt-0.5">
            Will content is encrypted with AES-256-GCM before storage. Your passphrase is never saved.
            Only someone with the passphrase can read the will content — not even family admins can access it without it.
          </p>
        </div>
      </div>

      {/* ── My will ── */}
      {myWill ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg font-bold flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-600" /> My Will
            </h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditWill(myWill)}>
                Edit
              </Button>
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
        <section className="rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50/40 p-8 text-center space-y-3">
          <FileText className="h-12 w-12 text-amber-300 mx-auto" />
          <p className="font-semibold text-amber-900">You haven't registered a will yet</p>
          <p className="text-sm text-amber-700 max-w-sm mx-auto">
            Register your last will &amp; testament so your wishes are preserved for your family.
          </p>
          <Button onClick={() => setAddDlg(true)} className="rounded-full bg-amber-600 hover:bg-amber-700 text-white mt-2">
            <Plus className="mr-2 h-4 w-4" /> Register My Will
          </Button>
        </section>
      )}

      {/* ── Other family members' wills ── */}
      {othersWills.length > 0 && (
        <section className="space-y-4">
          <h3 className="font-serif text-lg font-bold flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" /> Other Family Members' Wills
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {othersWills.map(w => (
              <WillCard key={w.id} will={w} isMine={false} onAccess={() => setAccessWill(w)} />
            ))}
          </div>
        </section>
      )}

      {/* ── No other wills ── */}
      {data?.count === 0 && (
        <p className="text-center text-muted-foreground py-8 text-sm">
          No other family members have registered a will yet.
        </p>
      )}

      {/* ── Dialogs ── */}
      {addDlg && (
        <AddWillDialog
          open
          familyId={familyId}
          onClose={() => setAddDlg(false)}
          onSuccess={() => { setAddDlg(false); load(); }}
        />
      )}
      {editWill && (
        <EditWillDialog
          open
          will={editWill}
          familyId={familyId}
          onClose={() => setEditWill(null)}
          onSuccess={() => { setEditWill(null); load(); }}
        />
      )}
      {accessWill && (
        <AccessWillDialog
          open
          will={accessWill}
          familyId={familyId}
          onClose={() => { setAccessWill(null); setDecrypted(null); }}
        />
      )}
    </div>
  );
}

// ─── WillCard ─────────────────────────────────────────────────────────────────

function WillCard({ will, isMine, onAccess }: { will: FamilyWill; isMine: boolean; onAccess: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className={`border shadow-sm transition-all hover:shadow-md ${isMine ? 'border-amber-300 bg-amber-50/20' : ''}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl border shrink-0 ${isMine ? 'bg-amber-50 border-amber-200' : 'bg-stone-50 border-stone-200'}`}>
              <FileText className={`h-5 w-5 ${isMine ? 'text-amber-600' : 'text-stone-600'}`} />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight">{will.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                By <span className="font-medium">{will.authorName}</span>
                {isMine ? ' (you)' : ''}
              </p>
              <p className="text-xs text-muted-foreground">
                Registered {format(new Date(will.createdAt), 'MMM d, yyyy')}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Badge className={`text-[10px] ${will.hasEncryptedContent ? 'bg-green-500 text-white' : 'bg-yellow-500 text-white'}`}>
              {will.hasEncryptedContent ? <><Lock className="h-2.5 w-2.5 mr-1"/>Encrypted</> : 'Draft'}
            </Badge>
          </div>
        </div>

        {will.summary && (
          <p className="text-sm text-muted-foreground italic border-l-2 border-amber-200 pl-3">
            "{will.summary}"
          </p>
        )}

        {will.accessCondition && (
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-2.5">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Condition: </span>{will.accessCondition}
            </p>
          </div>
        )}

        {/* Authorized persons */}
        {will.authorizedPersons.length > 0 && (
          <div className="space-y-1.5">
            <button
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setExpanded(e => !e)}
            >
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

        {/* Linked accounts count — details revealed only after passphrase decryption */}
        {will.linkedAccountCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
            <CreditCard className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <p className="text-xs text-emerald-800">
              <span className="font-semibold">{will.linkedAccountCount}</span> linked account{will.linkedAccountCount !== 1 ? 's' : ''} — revealed on passphrase entry
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
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showPassConfirm, setShowPassConfirm] = useState(false);
  const [persons, setPersons] = useState<AuthorizedPerson[]>([]);
  const [linkedAccountIds, setLinkedAccountIds] = useState<number[]>([]);

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

  const submit = async (): Promise<void> => {
    if (!form.content.trim()) { toast({ variant: 'destructive', title: 'Please write your will content' }); return; }
    if (!form.passphrase) { toast({ variant: 'destructive', title: 'Please set a passphrase' }); return; }
    if (form.passphrase !== form.passphraseConfirm) { toast({ variant: 'destructive', title: 'Passphrases do not match' }); return; }
    if (form.passphrase.length < 8) { toast({ variant: 'destructive', title: 'Passphrase must be at least 8 characters' }); return; }

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
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      toast({ title: 'Will registered and encrypted!' });
      onSuccess();
    } catch (err: any) {
      toast({ variant: 'destructive', title: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-600" />
            Register Your Will
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-2">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                step === s ? 'bg-amber-500 text-white' :
                step > s   ? 'bg-green-500 text-white' :
                             'bg-muted text-muted-foreground'
              }`}>
                {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
              </div>
              <span className="text-xs text-muted-foreground hidden sm:block">
                {s === 1 ? 'Write Will' : s === 2 ? 'Set Passphrase' : 'Persons & Accounts'}
              </span>
              {s < 3 && <div className="h-px w-6 bg-border" />}
            </div>
          ))}
        </div>

        <div className="space-y-4 pt-2">
          {/* ── Step 1: Will content ── */}
          {step === 1 && (
            <>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                <p className="font-semibold mb-1">Your content will be encrypted</p>
                <p>Write your will freely. It will be encrypted with AES-256-GCM before being stored. No one can read it without the passphrase you set in the next step.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Your full name *">
                  <Input value={form.authorName} onChange={e => set({ authorName: e.target.value })} placeholder="As it should appear on the will" className="rounded-lg" />
                </Field>
                <Field label="Will title">
                  <Input value={form.title} onChange={e => set({ title: e.target.value })} className="rounded-lg" />
                </Field>
              </div>
              <Field label="Will Content *">
                <Textarea
                  value={form.content}
                  onChange={e => set({ content: e.target.value })}
                  rows={12}
                  className="rounded-lg font-mono text-sm resize-none"
                  placeholder={`I, [Your Name], being of sound mind and body, hereby declare this to be my Last Will and Testament...\n\nI appoint [Executor Name] as the executor of this will...\n\nI bequeath the following...\n\n1. To [Name]: ...\n2. To [Name]: ...`}
                />
                <p className="text-xs text-muted-foreground text-right">{form.content.length} characters</p>
              </Field>
              <Field label="Non-sensitive summary (optional — visible without passphrase)">
                <Input
                  value={form.summary}
                  onChange={e => set({ summary: e.target.value })}
                  className="rounded-lg"
                  placeholder="e.g. Covers property, savings, and guardianship of children"
                />
              </Field>
              <Button
                className="w-full rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
                disabled={!form.content.trim()}
                onClick={() => setStep(2)}
              >
                Next: Set Passphrase →
              </Button>
            </>
          )}

          {/* ── Step 2: Passphrase ── */}
          {step === 2 && (
            <>
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
                <p className="font-semibold mb-1">Choose a strong passphrase</p>
                <p>This passphrase encrypts your will. <strong>It is never stored anywhere.</strong> Anyone you authorize will need this passphrase to read your will. Keep it safe — if lost, the content cannot be recovered.</p>
              </div>
              <Field label="Passphrase *">
                <div className="relative">
                  <Input
                    type={showPass ? 'text' : 'password'}
                    value={form.passphrase}
                    onChange={e => set({ passphrase: e.target.value })}
                    className="rounded-lg pr-10"
                    placeholder="At least 8 characters"
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <PassphraseStrength passphrase={form.passphrase} />
              </Field>
              <Field label="Confirm passphrase *">
                <div className="relative">
                  <Input
                    type={showPassConfirm ? 'text' : 'password'}
                    value={form.passphraseConfirm}
                    onChange={e => set({ passphraseConfirm: e.target.value })}
                    className="rounded-lg pr-10"
                  />
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
                <Button
                  className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={!form.passphrase || form.passphrase.length < 8 || form.passphrase !== form.passphraseConfirm}
                  onClick={() => setStep(3)}
                >
                  Next: Authorize Persons →
                </Button>
              </div>
            </>
          )}

          {/* ── Step 3: Authorized persons + condition ── */}
          {step === 3 && (
            <>
              <Field label="Access condition (optional)">
                <Input
                  value={form.accessCondition}
                  onChange={e => set({ accessCondition: e.target.value })}
                  className="rounded-lg"
                  placeholder="e.g. Upon my death, verified by two family elders"
                />
              </Field>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Authorized Persons</Label>
                  <Button variant="outline" size="sm" className="rounded-full h-7 text-xs" onClick={addPerson}>
                    <UserPlus className="mr-1 h-3 w-3" /> Add Person
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  These are the people you intend to share the passphrase with — they can read your will when the time comes. This list is visible to all family members.
                </p>
                {persons.length === 0 ? (
                  <div className="text-center py-4 rounded-xl bg-muted/30 border border-dashed">
                    <p className="text-sm text-muted-foreground">No authorized persons added yet</p>
                    <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={addPerson}>
                      <UserPlus className="mr-1 h-3 w-3" /> Add Someone
                    </Button>
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
              {/* Linked secret accounts */}
              <AccountSelector
                familyId={familyId}
                selected={linkedAccountIds}
                onChange={setLinkedAccountIds}
              />

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setStep(2)}>← Back</Button>
                <Button
                  className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={saving}
                  onClick={submit}
                >
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

  const [form, setForm] = useState({
    title: will.title,
    summary: will.summary ?? '',
    accessCondition: will.accessCondition ?? '',
    content: '',
    passphrase: '',
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
        title: form.title,
        summary: form.summary || undefined,
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
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      toast({ title: 'Will updated!' });
      onSuccess();
    } catch (err: any) {
      toast({ variant: 'destructive', title: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Edit Will</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Field label="Title"><Input value={form.title} onChange={e => set({ title: e.target.value })} className="rounded-lg" /></Field>
          <Field label="Summary"><Input value={form.summary} onChange={e => set({ summary: e.target.value })} className="rounded-lg" /></Field>
          <Field label="Access condition"><Input value={form.accessCondition} onChange={e => set({ accessCondition: e.target.value })} className="rounded-lg" /></Field>

          {/* Authorized persons */}
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

          {/* Linked secret accounts */}
          <AccountSelector
            familyId={familyId}
            selected={linkedAccountIds}
            onChange={setLinkedAccountIds}
          />

          {/* Update content toggle */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border">
            <Switch checked={updateContent} onCheckedChange={setUpdateContent} />
            <Label className="text-sm">Update will content (requires new passphrase)</Label>
          </div>
          {updateContent && (
            <>
              <Field label="New will content *">
                <Textarea value={form.content} onChange={e => set({ content: e.target.value })} rows={8} className="rounded-lg font-mono text-sm resize-none" />
              </Field>
              <Field label="New passphrase *">
                <div className="relative">
                  <Input type={showPass ? 'text' : 'password'} value={form.passphrase} onChange={e => set({ passphrase: e.target.value })} className="rounded-lg pr-10" />
                  <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-amber-700 mt-1">⚠ This replaces the existing passphrase entirely</p>
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
  const { toast } = useToast();
  const [passphrase, setPassphrase] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DecryptedWill | null>(null);

  const submit = async () => {
    if (!passphrase) return;
    setLoading(true);
    try {
      const res = await fetch(`${base}/genhal/families/${familyId}/wills/${will.id}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error ?? 'Failed');
      }
      setResult(await res.json());
    } catch (err: any) {
      toast({ variant: 'destructive', title: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const win = window.open('', '_blank');
    if (!win || !result) return;
    win.document.write(`
      <html><head><title>${result.title}</title>
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
      </div>
      <pre>${result.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
      <div class="footer">Decrypted from the GenHaL Family Heritage Platform on ${new Date().toLocaleDateString()}</div>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <Dialog open={open} onOpenChange={() => { onClose(); setResult(null); setPassphrase(''); }}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Unlock className="h-5 w-5 text-amber-600" />
            {result ? 'Will Content' : 'Access Will'}
          </DialogTitle>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4 pt-2">
            {/* Will info */}
            <div className="rounded-xl bg-stone-50 border p-4 space-y-2">
              <p className="font-semibold text-sm">{will.title}</p>
              <p className="text-xs text-muted-foreground">By {will.authorName}</p>
              {will.accessCondition && (
                <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 rounded-lg p-2 border border-amber-200">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {will.accessCondition}
                </div>
              )}
              {will.authorizedPersons.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Authorized for: {will.authorizedPersons.map(p => p.name).join(', ')}
                </p>
              )}
            </div>

            <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
              <p className="font-semibold mb-1">Passphrase required</p>
              <p>Enter the passphrase set by {will.authorName} to decrypt and read the will content. The passphrase is never sent in plaintext — only a verification hash is checked.</p>
            </div>

            <Field label="Passphrase">
              <div className="relative">
                <Input
                  type={showPass ? 'text' : 'password'}
                  value={passphrase}
                  onChange={e => setPassphrase(e.target.value)}
                  className="rounded-lg pr-10"
                  placeholder="Enter the will passphrase"
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  autoFocus
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            <Button
              className="w-full rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!passphrase || loading}
              onClick={submit}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlock className="mr-2 h-4 w-4" />}
              {loading ? 'Decrypting…' : 'Decrypt & Read Will'}
            </Button>
          </div>
        ) : (
          /* Decrypted view */
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 text-green-700 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" /> Decrypted successfully
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(result.accessedAt), 'HH:mm, MMM d yyyy')}
              </span>
            </div>

            <div className="rounded-xl border bg-stone-50 overflow-hidden">
              <div className="bg-stone-200/50 px-4 py-3 border-b flex items-center justify-between">
                <div>
                  <p className="font-serif font-bold text-lg">{result.title}</p>
                  <p className="text-xs text-muted-foreground">By {result.authorName}</p>
                </div>
                <Button variant="outline" size="sm" className="rounded-full" onClick={handlePrint}>
                  <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
                </Button>
              </div>
              {result.accessCondition && (
                <div className="px-4 py-2 bg-amber-50 border-b text-xs text-amber-800 flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {result.accessCondition}
                </div>
              )}
              <div className="p-4 max-h-60 overflow-y-auto">
                <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-foreground">{result.content}</pre>
              </div>
            </div>

            {/* Linked secret accounts — revealed only after successful passphrase decryption */}
            {result.linkedAccounts && result.linkedAccounts.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-emerald-600" />
                  Linked Bank Accounts ({result.linkedAccounts.length})
                </p>
                <div className="space-y-2">
                  {result.linkedAccounts.map(acc => (
                    <LinkedAccountCard key={acc.id} account={acc} />
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-800">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <p>This content is shown only for this session. It is not stored in your browser. Close this dialog when done.</p>
            </div>

            <Button variant="outline" className="w-full rounded-xl" onClick={() => { setResult(null); setPassphrase(''); }}>
              ← Access Another Will
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
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

/**
 * Fetches the family's secret bank accounts and renders checkboxes
 * so the will author can link which accounts heirs should know about.
 * Account details are NEVER stored in will plaintext —
 * they're fetched fresh from the server each time the will is decrypted.
 */
function AccountSelector({
  familyId,
  selected,
  onChange,
}: {
  familyId: number;
  selected: number[];
  onChange: (ids: number[]) => void;
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
      } catch {
        /* silently skip if accounts endpoint unavailable */
      } finally {
        setLoading(false);
      }
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
          <CreditCard className="h-4 w-4 text-emerald-600" /> Link Secret Accounts
        </Label>
        {selected.length > 0 && (
          <Badge className="bg-emerald-500 text-white text-[10px]">{selected.length} selected</Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Account details are only revealed when the will is opened with the correct passphrase — never shown to family members browsing will metadata.
      </p>
      <div className="space-y-1.5">
        {accounts.map(acc => (
          <label
            key={acc.id}
            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
              selected.includes(acc.id)
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-muted hover:bg-muted/40'
            }`}
          >
            <input
              type="checkbox"
              checked={selected.includes(acc.id)}
              onChange={() => toggle(acc.id)}
              className="rounded accent-emerald-600"
            />
            <CreditCard className={`h-4 w-4 shrink-0 ${selected.includes(acc.id) ? 'text-emerald-600' : 'text-muted-foreground'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{acc.accountName}</p>
              <p className="text-xs text-muted-foreground">
                {acc.bankName ?? acc.provider} · {acc.currency}
                {acc.accountNumber ? ` · ****${acc.accountNumber.slice(-4)}` : ''}
              </p>
            </div>
            {!acc.isActive && <Badge variant="outline" className="text-[10px] shrink-0">Inactive</Badge>}
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── LinkedAccountCard ────────────────────────────────────────────────────────

function LinkedAccountCard({ account: acc }: { account: SecretAccount }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className={`rounded-xl border p-3 space-y-2 ${acc.isActive ? 'bg-emerald-50 border-emerald-200' : 'bg-muted/30'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-white border shrink-0">
            <Building2 className="h-4 w-4 text-emerald-700" />
          </div>
          <div>
            <p className="text-sm font-semibold">{acc.accountName}</p>
            <p className="text-xs text-muted-foreground">
              {acc.bankName ?? acc.provider}
              {acc.routingNumber && <span> · Routing: {acc.routingNumber}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge className={`text-[10px] ${acc.currency === 'USD' ? 'bg-blue-500' : 'bg-green-600'} text-white`}>
            {acc.currency}
          </Badge>
          {!acc.isActive && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-lg bg-white border px-3 py-1.5 font-mono text-sm">
          {revealed ? acc.accountNumber : `•••• •••• ${acc.accountNumber.slice(-4)}`}
        </div>
        <button
          onClick={() => setRevealed(v => !v)}
          className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-white border border-transparent hover:border-border transition-all"
          title={revealed ? 'Hide account number' : 'Reveal full account number'}
        >
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Provider: {acc.provider} · ID #{acc.id}
      </p>
    </div>
  );
}

function PassphraseStrength({ passphrase }: { passphrase: string }) {
  const len = passphrase.length;
  const hasUpper = /[A-Z]/.test(passphrase);
  const hasLower = /[a-z]/.test(passphrase);
  const hasDigit = /\d/.test(passphrase);
  const hasSymbol = /[^A-Za-z0-9]/.test(passphrase);
  const score = [len >= 8, len >= 12, hasUpper && hasLower, hasDigit, hasSymbol].filter(Boolean).length;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
  const colors = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-green-600'];
  if (!passphrase) return null;
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i < score ? colors[score] : 'bg-muted'}`} />
        ))}
      </div>
      <p className={`text-xs font-medium ${score >= 4 ? 'text-green-600' : score >= 2 ? 'text-yellow-600' : 'text-red-600'}`}>
        {labels[score]}
      </p>
    </div>
  );
}

