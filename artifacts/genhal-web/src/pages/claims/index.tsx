/**
 * Ownership Claims — dispute filing and status tracking for a kingdom, family, or compound.
 * Anyone can file. The unit owner and admins can see all; others see only their own.
 */
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scale, Plus, Upload, FileText, Image as ImageIcon, Video,
  Loader2, CheckCircle2, Clock, XCircle, AlertCircle, ChevronDown, ChevronUp,
  Trash2, Eye, Gavel,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getApiBaseUrl } from "@/lib/api";

export interface ClaimsTabProps {
  unitType: "kingdom" | "family" | "compound";
  unitId: number;
  unitName?: string;
  isOwner?: boolean;
}

interface Evidence {
  id: number;
  evidenceType: string;
  fileName: string;
  mimeType?: string;
  uploadStatus: string;
  description?: string;
  createdAt: string;
}

interface Claim {
  id: number;
  position: string;
  claimantName: string;
  claimantEmail: string;
  claimReason: string;
  status: "pending" | "under_review" | "approved" | "rejected";
  adminNotes?: string;
  createdAt: string;
  evidence?: Evidence[];
}

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  pending:      { icon: <Clock className="h-3.5 w-3.5" />,        color: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-300 dark:border-yellow-500/30",  label: "Pending Review" },
  under_review: { icon: <Eye className="h-3.5 w-3.5" />,          color: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",        label: "Under Review" },
  approved:     { icon: <CheckCircle2 className="h-3.5 w-3.5" />, color: "bg-green-100 text-green-800 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30",     label: "Approved" },
  rejected:     { icon: <XCircle className="h-3.5 w-3.5" />,      color: "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30",           label: "Rejected" },
};

const POSITIONS = [
  "King", "Queen Mother", "Chief", "Head Chief", "Council Chief",
  "Elder", "Family Head", "Regent", "Crown Prince / Princess", "Other",
];

function EvidenceTypeIcon({ type }: { type: string }) {
  if (type === "image") return <ImageIcon className="h-4 w-4 text-purple-500 dark:text-purple-300" />;
  if (type === "video") return <Video className="h-4 w-4 text-blue-500 dark:text-blue-300" />;
  return <FileText className="h-4 w-4 text-amber-600 dark:text-amber-300" />;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ── File Claim Dialog ─────────────────────────────────────────────────────────

function FileClaimDialog({
  open, onClose, unitType, unitId, onSuccess,
}: {
  open: boolean; onClose: () => void;
  unitType: string; unitId: number; onSuccess: () => void;
}) {
  const base = getApiBaseUrl();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [claimId, setClaimId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; type: string; status: string }[]>([]);

  const [form, setForm] = useState({
    position: "", claimantName: "", claimantEmail: "",
    claimantPhone: "", claimReason: "",
  });

  const submitClaim = async () => {
    if (!form.position || !form.claimantName || !form.claimantEmail || !form.claimReason) {
      toast({ variant: "destructive", title: "All fields except phone are required" }); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${base}/genhal/claims`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitType, unitId, ...form }),
      }).then(r => r.json());
      if (res.error) throw new Error(res.error);
      setClaimId(res.id);
      setStep(2);
    } catch (err: unknown) {
      toast({ variant: "destructive", title: err instanceof Error ? err.message : "Failed" });
    } finally { setSaving(false); }
  };

  const uploadEvidence = async (files: FileList) => {
    if (!claimId || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const evidenceType = file.type.startsWith("image/") ? "image"
          : file.type.startsWith("video/") ? "video" : "document";

        const { uploadUrl, evidence } = await fetch(`${base}/genhal/claims/${claimId}/evidence/upload-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type, evidenceType }),
        }).then(r => r.json());

        if (!uploadUrl) { toast({ variant: "destructive", title: `Failed to get upload URL for ${file.name}` }); continue; }

        await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        await fetch(`${base}/genhal/claims/${claimId}/evidence/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ evidenceId: evidence.id, fileSize: file.size }),
        });
        setUploadedFiles(prev => [...prev, { name: file.name, type: evidenceType, status: "complete" }]);
      } catch { setUploadedFiles(prev => [...prev, { name: file.name, type: "document", status: "failed" }]); }
    }
    setUploading(false);
  };

  const finish = () => {
    onSuccess(); onClose();
    setStep(1); setClaimId(null); setUploadedFiles([]);
    setForm({ position: "", claimantName: "", claimantEmail: "", claimantPhone: "", claimReason: "" });
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl bg-amber-700 text-white">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="font-serif text-xl">File an Ownership Claim</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Step {step} of 2</p>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex gap-1 mt-1">
            <div className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 1 ? "bg-amber-700" : "bg-muted"}`} />
            <div className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 2 ? "bg-amber-700" : "bg-muted"}`} />
          </div>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4 pt-2">
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300">
                <p className="font-semibold mb-0.5">How this works</p>
                <p className="text-xs">Submit your claim with supporting legal documents, photographs, and videos. Our team will review the evidence and, if satisfied, transfer ownership and control to the rightful holder.</p>
              </div>

              {/* Position */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Position being claimed *</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {POSITIONS.map(p => (
                    <button key={p} onClick={() => setForm(f => ({ ...f, position: p }))}
                      className={`text-xs px-3 py-2 rounded-lg border text-left transition-all ${form.position === p ? "border-amber-600 bg-amber-50 text-amber-800 font-medium dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-300" : "border-border hover:border-amber-300 dark:hover:border-amber-500/30"}`}>
                      {p}
                    </button>
                  ))}
                </div>
                {form.position === "Other" && (
                  <Input placeholder="Specify position…" className="mt-1.5 rounded-lg text-sm"
                    onChange={e => setForm(f => ({ ...f, position: e.target.value }))} />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Your full name *</Label>
                  <Input value={form.claimantName} onChange={e => setForm(f => ({ ...f, claimantName: e.target.value }))} className="rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email *</Label>
                  <Input type="email" value={form.claimantEmail} onChange={e => setForm(f => ({ ...f, claimantEmail: e.target.value }))} className="rounded-lg" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone (optional)</Label>
                <Input value={form.claimantPhone} onChange={e => setForm(f => ({ ...f, claimantPhone: e.target.value }))} placeholder="+234…" className="rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Detailed justification *</Label>
                <Textarea rows={5} value={form.claimReason}
                  onChange={e => setForm(f => ({ ...f, claimReason: e.target.value }))}
                  placeholder="Explain your lineage, historical records, court rulings, or any other basis for your claim…"
                  className="rounded-lg text-sm resize-none" />
              </div>

              <Button className="w-full rounded-full bg-amber-700 hover:bg-amber-600 text-white"
                onClick={submitClaim} disabled={saving || !form.position || !form.claimantName || !form.claimantEmail || !form.claimReason}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</> : "Continue — Upload Evidence →"}
              </Button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4 pt-2">
              <div className="p-3.5 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800 dark:bg-green-500/10 dark:border-green-500/30 dark:text-green-300">
                <p className="font-semibold mb-0.5 flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" />Claim filed (Ref #{claimId})</p>
                <p className="text-xs">Now upload your supporting evidence — court documents, birth certificates, photographs, video testimonies. The more thorough, the better.</p>
              </div>

              {/* Upload area */}
              <div
                className="border-2 border-dashed border-amber-300 rounded-2xl p-8 text-center cursor-pointer hover:border-amber-500 hover:bg-amber-50/30 transition-colors dark:border-amber-500/30 dark:hover:border-amber-500/50 dark:hover:bg-amber-500/10"
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" multiple className="hidden"
                  accept="image/*,video/*,.pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={e => e.target.files && uploadEvidence(e.target.files)} />
                {uploading
                  ? <><Loader2 className="h-8 w-8 animate-spin text-amber-600 mx-auto mb-2 dark:text-amber-300" /><p className="text-sm text-amber-700 dark:text-amber-300">Uploading…</p></>
                  : <>
                    <Upload className="h-8 w-8 text-amber-500 mx-auto mb-2 dark:text-amber-300" />
                    <p className="font-semibold text-sm">Click to upload evidence</p>
                    <p className="text-xs text-muted-foreground mt-1">Documents, images, or videos · Max 200 MB per file</p>
                    <div className="flex justify-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><FileText className="h-3 w-3" />PDF/Word</span>
                      <span className="flex items-center gap-1"><ImageIcon className="h-3 w-3" />Images</span>
                      <span className="flex items-center gap-1"><Video className="h-3 w-3" />Videos</span>
                    </div>
                  </>}
              </div>

              {/* Uploaded files list */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-1.5">
                  {uploadedFiles.map((f, i) => (
                    <div key={i} className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${f.status === "complete" ? "bg-green-50 border-green-200 dark:bg-green-500/10 dark:border-green-500/30" : "bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/30"}`}>
                      <EvidenceTypeIcon type={f.type} />
                      <span className="flex-1 text-xs font-medium truncate">{f.name}</span>
                      {f.status === "complete"
                        ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 dark:text-green-300" />
                        : <XCircle className="h-4 w-4 text-red-500 shrink-0 dark:text-red-300" />}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 rounded-full" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <Upload className="mr-2 h-4 w-4" /> Add more
                </Button>
                <Button className="flex-1 rounded-full bg-amber-700 hover:bg-amber-600 text-white" onClick={finish}>
                  Done — Submit Claim
                </Button>
              </div>

              <p className="text-[11px] text-muted-foreground text-center">
                You can add more evidence later by opening this claim. Our team reviews all submissions carefully.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

// ── Claims Tab ────────────────────────────────────────────────────────────────

function ClaimCard({ claim, base, onRefresh }: { claim: Claim; base: string; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [evidence, setEvidence] = useState<Evidence[]>(claim.evidence ?? []);
  const { toast } = useToast();

  const loadEvidence = async () => {
    if (expanded || evidence.length > 0) { setExpanded(v => !v); return; }
    setLoading(true);
    try {
      const data = await fetch(`${base}/genhal/claims/${claim.id}`).then(r => r.json());
      setEvidence(data.evidence ?? []);
      setExpanded(true);
    } catch { toast({ variant: "destructive", title: "Failed to load evidence" }); }
    setLoading(false);
  };

  return (
    <Card className="border overflow-hidden">
      <CardContent className="p-0">
        <button className="w-full p-4 text-left hover:bg-muted/30 transition-colors" onClick={loadEvidence}>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Gavel className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                <p className="font-semibold text-sm">Claim for: <span className="text-amber-800 dark:text-amber-300">{claim.position}</span></p>
              </div>
              <p className="text-xs text-muted-foreground">By {claim.claimantName} · {new Date(claim.createdAt).toLocaleDateString()}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={claim.status} />
              {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{claim.claimReason}</p>
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="border-t px-4 py-3 space-y-3 bg-muted/20">
                {claim.adminNotes && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/30">
                    <p className="text-xs font-semibold text-blue-800 mb-0.5 dark:text-blue-300">Admin response</p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">{claim.adminNotes}</p>
                  </div>
                )}

                {evidence.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground">Evidence ({evidence.length} files)</p>
                    {evidence.map(ev => (
                      <div key={ev.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-background border">
                        <EvidenceTypeIcon type={ev.evidenceType} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{ev.fileName}</p>
                          {ev.description && <p className="text-[10px] text-muted-foreground">{ev.description}</p>}
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ev.uploadStatus === "complete" ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300"}`}>
                          {ev.uploadStatus}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No evidence uploaded yet.</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

export default function ClaimsTab({ unitType, unitId, unitName, isOwner }: ClaimsTabProps) {
  const base = getApiBaseUrl();
  const { toast } = useToast();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetch(`${base}/genhal/claims/unit/${unitType}/${unitId}`).then(r => r.json());
      setClaims(Array.isArray(data) ? data : []);
    } catch { toast({ variant: "destructive", title: "Failed to load claims" }); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [unitType, unitId]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-serif text-2xl font-bold">Ownership Claims</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            Dispute a kingship stool or file for recognition as the rightful holder of a title. All claims are reviewed with supporting legal evidence.
          </p>
        </div>
        <Button className="rounded-full bg-amber-700 hover:bg-amber-600 text-white shrink-0"
          onClick={() => setShowDialog(true)}>
          <Scale className="mr-2 h-4 w-4" /> File a Claim
        </Button>
      </div>

      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex gap-3 dark:bg-amber-500/10 dark:border-amber-500/30">
        <AlertCircle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5 dark:text-amber-300" />
        <div className="text-sm text-amber-800 dark:text-amber-300">
          <p className="font-semibold mb-0.5">How ownership transfer works</p>
          <p className="text-xs">File a claim with your legal basis and supporting evidence. Our team reviews documentation and, if satisfied, transfers control of the kingdom or family account to the verified rightful holder. Frivolous claims may result in account suspension.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : claims.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <Scale className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="font-semibold text-muted-foreground">No claims on record</p>
          <p className="text-xs text-muted-foreground">File a claim if there is a dispute about the rightful leadership of this unit.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {claims.map(c => (
            <ClaimCard key={c.id} claim={c} base={base} onRefresh={load} />
          ))}
        </div>
      )}

      <FileClaimDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        unitType={unitType}
        unitId={unitId}
        onSuccess={load}
      />
    </div>
  );
}
