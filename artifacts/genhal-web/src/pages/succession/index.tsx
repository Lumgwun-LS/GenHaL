/**
 * Succession tab for Family Accounts.
 * - Family head: set next of kin / successor.
 * - Anyone: file a succession claim (takes over after head's death) with ID upload.
 * - Admin (or head): view all succession claims.
 */
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserCheck, HeartHandshake, Upload, FileText, Loader2,
  CheckCircle2, Clock, XCircle, Eye, AlertCircle, Pencil,
  ShieldCheck, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getApiBaseUrl } from "@/lib/api";

export interface SuccessionTabProps {
  familyId: number;
  isHead?: boolean;
}

interface NextOfKin {
  nextOfKinName?: string;
  nextOfKinEmail?: string;
  nextOfKinPhone?: string;
  nextOfKinRelationship?: string;
  nextOfKinNotes?: string;
}

interface SuccessionClaim {
  id: number;
  claimerName: string;
  claimerEmail: string;
  relationshipToOwner: string;
  statement?: string;
  idUploadStatus: string;
  status: string;
  adminNotes?: string;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  pending:      { color: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-300 dark:border-yellow-500/30", label: "Pending",      icon: <Clock className="h-3 w-3" /> },
  under_review: { color: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",       label: "Under Review", icon: <Eye className="h-3 w-3" /> },
  approved:     { color: "bg-green-100 text-green-800 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30",    label: "Approved",     icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected:     { color: "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",          label: "Rejected",     icon: <XCircle className="h-3 w-3" /> },
};

// ── Edit Next-of-Kin Dialog ───────────────────────────────────────────────────

function EditNextOfKinDialog({
  open, initial, familyId, onClose, onSaved,
}: {
  open: boolean; initial: NextOfKin; familyId: number;
  onClose: () => void; onSaved: () => void;
}) {
  const base = getApiBaseUrl();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...initial });
  useEffect(() => { setForm({ ...initial }); }, [initial]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${base}/genhal/families/${familyId}/next-of-kin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      toast({ title: "Next of kin updated" });
      onSaved(); onClose();
    } catch (err: unknown) {
      toast({ variant: "destructive", title: err instanceof Error ? err.message : "Failed" });
    } finally { setSaving(false); }
  };

  const RELATIONSHIPS = ["Son", "Daughter", "Spouse", "Sibling", "Nephew/Niece", "Grandchild", "Other"];

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-700 text-white"><HeartHandshake className="h-5 w-5" /></div>
            <div>
              <DialogTitle className="font-serif text-xl">Set Next of Kin</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Named person can file a succession claim if you pass on</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Full name</Label>
              <Input value={form.nextOfKinName ?? ""} onChange={e => setForm(f => ({ ...f, nextOfKinName: e.target.value }))} className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Relationship</Label>
              <select
                value={form.nextOfKinRelationship ?? ""}
                onChange={e => setForm(f => ({ ...f, nextOfKinRelationship: e.target.value }))}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select…</option>
                {RELATIONSHIPS.map(r => <option key={r} value={r.toLowerCase()}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input type="email" value={form.nextOfKinEmail ?? ""} onChange={e => setForm(f => ({ ...f, nextOfKinEmail: e.target.value }))} className="rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Phone</Label>
            <Input value={form.nextOfKinPhone ?? ""} onChange={e => setForm(f => ({ ...f, nextOfKinPhone: e.target.value }))} placeholder="+234…" className="rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea rows={2} value={form.nextOfKinNotes ?? ""} onChange={e => setForm(f => ({ ...f, nextOfKinNotes: e.target.value }))} className="rounded-lg resize-none text-sm" placeholder="Any specific instructions…" />
          </div>

          <Button className="w-full rounded-full bg-teal-700 hover:bg-teal-600 text-white" onClick={save} disabled={saving}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Save Next of Kin"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── File Succession Claim Dialog ──────────────────────────────────────────────

function SuccessionClaimDialog({
  open, familyId, onClose, onSuccess,
}: {
  open: boolean; familyId: number; onClose: () => void; onSuccess: () => void;
}) {
  const base = getApiBaseUrl();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [claimId, setClaimId] = useState<number | null>(null);
  const [idUploaded, setIdUploaded] = useState(false);
  const [form, setForm] = useState({
    claimerName: "", claimerEmail: "", claimerPhone: "", relationshipToOwner: "", statement: "",
  });

  const RELATIONSHIPS = ["son","daughter","spouse","sibling","nephew","niece","grandchild","other"];

  const submitClaim = async () => {
    if (!form.claimerName || !form.claimerEmail || !form.relationshipToOwner) {
      toast({ variant: "destructive", title: "Name, email, and relationship are required" }); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${base}/genhal/families/${familyId}/succession`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      setClaimId(res.id);
      setStep(2);
    } catch (err: unknown) {
      toast({ variant: "destructive", title: err instanceof Error ? err.message : "Failed" });
    } finally { setSaving(false); }
  };

  const uploadId = async (file: File) => {
    if (!claimId) return;
    setUploading(true);
    try {
      const { uploadUrl } = await fetch(`${base}/genhal/families/${familyId}/succession/upload-id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId, fileName: file.name, mimeType: file.type }),
      }).then(r => r.json());
      if (!uploadUrl) throw new Error("Failed to get upload URL");
      await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      await fetch(`${base}/genhal/families/${familyId}/succession/confirm-id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId }),
      });
      setIdUploaded(true);
      toast({ title: "ID uploaded successfully" });
    } catch (err: unknown) {
      toast({ variant: "destructive", title: err instanceof Error ? err.message : "Upload failed" });
    } finally { setUploading(false); }
  };

  const finish = () => {
    onSuccess(); onClose();
    setStep(1); setClaimId(null); setIdUploaded(false);
    setForm({ claimerName: "", claimerEmail: "", claimerPhone: "", relationshipToOwner: "", statement: "" });
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl bg-teal-700 text-white"><ShieldCheck className="h-5 w-5" /></div>
            <div>
              <DialogTitle className="font-serif text-xl">File Succession Claim</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Step {step} of 2</p>
            </div>
          </div>
          <div className="flex gap-1">
            <div className={`h-1.5 flex-1 rounded-full ${step >= 1 ? "bg-teal-700" : "bg-muted"}`} />
            <div className={`h-1.5 flex-1 rounded-full ${step >= 2 ? "bg-teal-700" : "bg-muted"}`} />
          </div>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4 pt-2">
              <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-sm text-teal-800 dark:bg-teal-500/10 dark:border-teal-500/30 dark:text-teal-300">
                <p className="font-semibold mb-0.5">For next-of-kin or designated successors</p>
                <p className="text-xs">If the account holder has passed away and named you as their successor, file this claim. You will be asked to upload a government-issued ID for verification.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Your full name *</Label>
                  <Input value={form.claimerName} onChange={e => setForm(f => ({ ...f, claimerName: e.target.value }))} className="rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Relationship to owner *</Label>
                  <select value={form.relationshipToOwner}
                    onChange={e => setForm(f => ({ ...f, relationshipToOwner: e.target.value }))}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="">Select…</option>
                    {RELATIONSHIPS.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email *</Label>
                <Input type="email" value={form.claimerEmail} onChange={e => setForm(f => ({ ...f, claimerEmail: e.target.value }))} className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input value={form.claimerPhone} onChange={e => setForm(f => ({ ...f, claimerPhone: e.target.value }))} placeholder="+234…" className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Statement (optional)</Label>
                <Textarea rows={3} value={form.statement}
                  onChange={e => setForm(f => ({ ...f, statement: e.target.value }))}
                  placeholder="Briefly explain the circumstances and your relationship to the deceased…"
                  className="rounded-lg text-sm resize-none" />
              </div>

              <Button className="w-full rounded-full bg-teal-700 hover:bg-teal-600 text-white"
                onClick={submitClaim}
                disabled={saving || !form.claimerName || !form.claimerEmail || !form.relationshipToOwner}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</> : "Continue — Upload ID →"}
              </Button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4 pt-2">
              <div className="p-3.5 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800 dark:bg-green-500/10 dark:border-green-500/30 dark:text-green-300">
                <p className="font-semibold flex items-center gap-1.5 mb-0.5"><CheckCircle2 className="h-4 w-4" />Claim submitted (Ref #{claimId})</p>
                <p className="text-xs">Upload a government-issued photo ID (passport, national ID, driver's licence) to support your claim.</p>
              </div>

              <input ref={fileInputRef} type="file" className="hidden"
                accept="image/*,.pdf"
                onChange={e => e.target.files?.[0] && uploadId(e.target.files[0])} />

              {idUploaded ? (
                <div className="p-6 rounded-2xl border-2 border-green-300 bg-green-50 text-center space-y-2 dark:border-green-500/30 dark:bg-green-500/10">
                  <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto dark:text-green-300" />
                  <p className="font-semibold text-green-800 dark:text-green-300">ID uploaded successfully</p>
                  <p className="text-xs text-green-700 dark:text-green-300">Our team will review your claim and reach out to the contact details you provided.</p>
                </div>
              ) : (
                <div className="border-2 border-dashed border-teal-300 rounded-2xl p-8 text-center cursor-pointer hover:border-teal-500 hover:bg-teal-50/30 transition-colors dark:border-teal-500/30 dark:hover:border-teal-500/50 dark:hover:bg-teal-500/10"
                  onClick={() => fileInputRef.current?.click()}>
                  {uploading
                    ? <><Loader2 className="h-8 w-8 animate-spin text-teal-600 mx-auto mb-2 dark:text-teal-300" /><p className="text-sm text-teal-700 dark:text-teal-300">Uploading…</p></>
                    : <>
                      <Upload className="h-8 w-8 text-teal-500 mx-auto mb-2 dark:text-teal-300" />
                      <p className="font-semibold text-sm">Upload government-issued ID</p>
                      <p className="text-xs text-muted-foreground mt-1">Passport · National ID · Driver's Licence · PNG, JPG, or PDF</p>
                    </>}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Your ID is stored securely and only accessible to our review team. It will not be shared with third parties.
              </p>

              <Button className="w-full rounded-full bg-teal-700 hover:bg-teal-600 text-white" onClick={finish}>
                {idUploaded ? "Done" : "Submit Without ID (add later)"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

// ── Succession Tab ────────────────────────────────────────────────────────────

export default function SuccessionTab({ familyId, isHead }: SuccessionTabProps) {
  const base = getApiBaseUrl();
  const { toast } = useToast();
  const [kin, setKin] = useState<NextOfKin>({});
  const [claims, setClaims] = useState<SuccessionClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [editKin, setEditKin] = useState(false);
  const [fileClaim, setFileClaim] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [kinData, claimsData] = await Promise.all([
        fetch(`${base}/genhal/families/${familyId}/next-of-kin`).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/genhal/families/${familyId}/succession/claims`).then(r => r.json()).catch(() => []),
      ]);
      setKin(kinData ?? {});
      setClaims(Array.isArray(claimsData) ? claimsData : []);
    } catch { toast({ variant: "destructive", title: "Failed to load" }); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [familyId]);

  const hasKin = kin.nextOfKinName || kin.nextOfKinEmail;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-bold">Succession & Next of Kin</h2>
        <p className="text-muted-foreground text-sm mt-0.5">
          Designate who should take over this family account in the event of the head's death. The named person can later file a succession claim with verified ID.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* Next of kin card */}
          <Card className={`border-2 ${hasKin ? "border-teal-200 bg-teal-50/30 dark:border-teal-500/30 dark:bg-teal-500/10" : "border-dashed border-muted"}`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${hasKin ? "bg-teal-700 text-white" : "bg-muted text-muted-foreground"}`}>
                    <HeartHandshake className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Next of Kin / Successor</p>
                    <p className="text-xs text-muted-foreground">{hasKin ? "Designated" : "Not yet set"}</p>
                  </div>
                </div>
                {isHead && (
                  <Button size="sm" variant="outline" className="rounded-full h-8 text-xs"
                    onClick={() => setEditKin(true)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> {hasKin ? "Edit" : "Set Now"}
                  </Button>
                )}
              </div>

              {hasKin && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 grid grid-cols-2 gap-3">
                  {[
                    { label: "Full Name",     value: kin.nextOfKinName },
                    { label: "Relationship",  value: kin.nextOfKinRelationship },
                    { label: "Email",         value: kin.nextOfKinEmail },
                    { label: "Phone",         value: kin.nextOfKinPhone },
                  ].map(f => f.value ? (
                    <div key={f.label} className="space-y-0.5">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">{f.label}</p>
                      <p className="text-sm font-medium">{f.value}</p>
                    </div>
                  ) : null)}
                  {kin.nextOfKinNotes && (
                    <div className="col-span-2 space-y-0.5">
                      <p className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">Notes</p>
                      <p className="text-sm text-muted-foreground">{kin.nextOfKinNotes}</p>
                    </div>
                  )}
                </motion.div>
              )}

              {!hasKin && !isHead && (
                <p className="text-xs text-muted-foreground mt-3">The family head has not yet designated a next of kin.</p>
              )}
            </CardContent>
          </Card>

          {/* How to claim */}
          <div className="p-4 rounded-xl bg-slate-50 border flex gap-3 dark:bg-white/5">
            <Info className="h-4 w-4 text-slate-600 mt-0.5 shrink-0 dark:text-muted-foreground" />
            <div className="text-sm text-slate-700 dark:text-foreground">
              <p className="font-semibold mb-0.5">Are you the named successor?</p>
              <p className="text-xs">If the account holder has passed away, you can file a succession claim below. You will be required to upload a valid government-issued ID. Our team will review and transfer account ownership upon verification.</p>
            </div>
          </div>

          <Button className="rounded-full bg-teal-700 hover:bg-teal-600 text-white"
            onClick={() => setFileClaim(true)}>
            <ShieldCheck className="mr-2 h-4 w-4" /> File Succession Claim
          </Button>

          {/* Claims list */}
          {claims.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Succession Claims ({claims.length})</h3>
              {claims.map(claim => {
                const cfg = STATUS_CONFIG[claim.status] ?? STATUS_CONFIG.pending;
                return (
                  <Card key={claim.id} className="border">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <UserCheck className="h-4 w-4 text-teal-700 dark:text-teal-300" />
                            <p className="font-semibold text-sm">{claim.claimerName}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{claim.relationshipToOwner} · {new Date(claim.createdAt).toLocaleDateString()}</p>
                        </div>
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.color}`}>
                          {cfg.icon}{cfg.label}
                        </span>
                      </div>
                      {claim.statement && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{claim.statement}</p>}
                      {claim.adminNotes && (
                        <div className="mt-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/30">
                          <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">Admin response</p>
                          <p className="text-xs text-blue-700 dark:text-blue-300">{claim.adminNotes}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${claim.idUploadStatus === "complete" ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300"}`}>
                          ID: {claim.idUploadStatus}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <EditNextOfKinDialog
        open={editKin}
        initial={kin}
        familyId={familyId}
        onClose={() => setEditKin(false)}
        onSaved={load}
      />
      <SuccessionClaimDialog
        open={fileClaim}
        familyId={familyId}
        onClose={() => setFileClaim(false)}
        onSuccess={load}
      />
    </div>
  );
}
