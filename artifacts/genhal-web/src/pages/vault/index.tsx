/**
 * GenHaL Vault — document & media repository for a kingdom or family.
 * Used as an embedded tab component (receives unitType + unitId as props).
 */
import { useState, useCallback, useRef } from 'react';
import {
  Upload, FileText, Image, Video, Music, File, Lock, Globe, Users, Shield,
  Plus, Trash2, Download, Eye, Tag, ChevronDown, ChevronRight, Search,
  Loader2, X, AlertCircle, Check, Crown, Scroll,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { getApiBaseUrl } from '@/lib/api';

export interface VaultProps {
  unitType: 'kingdom' | 'family';
  unitId: number;
  userRole?: string | null;
  kingdomId?: number;
}

interface VaultDoc {
  id: number; title: string; description?: string; accessInstructions?: string;
  fileType: string; fileUrl?: string; fileName?: string; fileSizeBytes?: number;
  mimeType?: string; category?: string; isWill: boolean; tags: string[];
  accessLevel: string; allowedRoles: string[]; uploadStatus: string;
  isArchived: boolean; viewCount: number; downloadCount: number;
  uploadedByClerkUserId: string; createdAt: string;
}

const FILE_TYPE_ICONS: Record<string, React.ReactNode> = {
  document: <FileText className="h-5 w-5" />,
  image: <Image className="h-5 w-5" />,
  video: <Video className="h-5 w-5" />,
  audio: <Music className="h-5 w-5" />,
  other: <File className="h-5 w-5" />,
};
const FILE_TYPE_COLORS: Record<string, string> = {
  document: 'bg-blue-100 text-blue-700',
  image:    'bg-purple-100 text-purple-700',
  video:    'bg-rose-100 text-rose-700',
  audio:    'bg-amber-100 text-amber-700',
  other:    'bg-stone-100 text-stone-700',
};
const ACCESS_ICONS: Record<string, React.ReactNode> = {
  public:            <Globe className="h-3.5 w-3.5" />,
  members:           <Users className="h-3.5 w-3.5" />,
  elders_and_above:  <Crown className="h-3.5 w-3.5" />,
  admins:            <Shield className="h-3.5 w-3.5" />,
  specific_roles:    <Lock className="h-3.5 w-3.5" />,
};
const ACCESS_LABELS: Record<string, string> = {
  public:           'Public',
  members:          'Members only',
  elders_and_above: 'Elders & above',
  admins:           'Admins only',
  specific_roles:   'Specific roles',
};
const CATEGORIES = [
  { value: 'will',          label: '📜 Will / Testament' },
  { value: 'land_title',    label: '🏞 Land Title / Deed' },
  { value: 'birth_record',  label: '👶 Birth Record' },
  { value: 'death_record',  label: '🕯 Death Record' },
  { value: 'marriage_cert', label: '💍 Marriage Certificate' },
  { value: 'constitution',  label: '📗 Constitution / Charter' },
  { value: 'royal_decree',  label: '👑 Royal Decree / Edict' },
  { value: 'history',       label: '📖 Historical Record' },
  { value: 'photo',         label: '📷 Photo / Image Archive' },
  { value: 'video',         label: '🎬 Video Archive' },
  { value: 'other',         label: '📎 Other' },
];
const KINGDOM_ROLES = ['king','queen_mother','council_chief','elder','cdc_member','family_head','member','viewer'];

function formatBytes(bytes?: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function VaultTab({ unitType, unitId, userRole, kingdomId }: VaultProps) {
  const base = getApiBaseUrl();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [dlg, setDlg] = useState<'upload' | 'view' | null>(null);
  const [viewDoc, setViewDoc] = useState<(VaultDoc & { downloadUrl?: string }) | null>(null);

  // upload form
  const [form, setForm] = useState({
    title: '', description: '', accessInstructions: '',
    fileType: 'document', category: '', isWill: false,
    accessLevel: 'members', allowedRoles: [] as string[], tags: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch(`${base}/genhal/vault/documents?unitType=${unitType}&unitId=${unitId}`).then(r => r.json());
      setDocs(Array.isArray(data) ? data : []);
      setLoaded(true);
    } catch { toast({ variant: 'destructive', title: 'Failed to load vault' }); }
    finally { setLoading(false); }
  }, [unitType, unitId, base]);

  // Lazy load on first tab click
  if (!loaded && !loading) load();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setSelectedFile(f);
    // Auto-detect file type
    const mt = f.type;
    let ft = 'document';
    if (mt.startsWith('image/')) ft = 'image';
    else if (mt.startsWith('video/')) ft = 'video';
    else if (mt.startsWith('audio/')) ft = 'audio';
    else if (mt === 'application/pdf' || mt.includes('word') || mt.includes('excel') || mt.includes('powerpoint') || mt.includes('text')) ft = 'document';
    setForm(f2 => ({ ...f2, fileType: ft, title: f2.title || f.name.replace(/\.[^.]+$/, '') }));
  };

  const upload = async () => {
    if (!form.title) return;
    setUploading(true);
    try {
      let r2Key: string | undefined, fileUrl: string | undefined, fileSizeBytes: number | undefined;

      if (selectedFile) {
        // Step 1: get presigned URL
        const { uploadUrl, r2Key: key, fileUrl: url } = await fetch(`${base}/genhal/vault/upload-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unitType, unitId, fileName: selectedFile.name, mimeType: selectedFile.type, fileType: form.fileType }),
        }).then(r => r.json());

        if (!uploadUrl) throw new Error('No upload URL received — check R2 configuration');

        // Step 2: PUT directly to R2
        await fetch(uploadUrl, { method: 'PUT', body: selectedFile, headers: { 'Content-Type': selectedFile.type } });
        r2Key = key; fileUrl = url; fileSizeBytes = selectedFile.size;
      }

      // Step 3: create DB record
      const doc = await fetch(`${base}/genhal/vault/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitType, unitId, kingdomId,
          title: form.title, description: form.description, accessInstructions: form.accessInstructions,
          fileType: form.fileType, mimeType: selectedFile?.type, fileName: selectedFile?.name,
          category: form.category, isWill: form.isWill,
          accessLevel: form.accessLevel, allowedRoles: form.allowedRoles,
          tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          r2Key, fileUrl, fileSizeBytes,
        }),
      }).then(r => r.json());

      if (doc.error) throw new Error(doc.error);
      toast({ title: `"${form.title}" saved to vault!` });
      setDlg(null);
      setSelectedFile(null);
      setForm({ title:'', description:'', accessInstructions:'', fileType:'document', category:'', isWill:false, accessLevel:'members', allowedRoles:[], tags:'' });
      load();
    } catch (err: any) {
      toast({ variant: 'destructive', title: err.message ?? 'Upload failed' });
    } finally { setUploading(false); }
  };

  const openDoc = async (doc: VaultDoc) => {
    try {
      const full = await fetch(`${base}/genhal/vault/documents/${doc.id}`).then(r => r.json());
      setViewDoc(full);
      setDlg('view');
    } catch { toast({ variant: 'destructive', title: 'Failed to load document' }); }
  };

  const archiveDoc = async (doc: VaultDoc) => {
    await fetch(`${base}/genhal/vault/documents/${doc.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isArchived: !doc.isArchived }),
    });
    load();
  };

  const deleteDoc = async (doc: VaultDoc) => {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    await fetch(`${base}/genhal/vault/documents/${doc.id}`, { method: 'DELETE' });
    toast({ title: 'Deleted' });
    load();
  };

  const filtered = docs.filter(d => {
    if (filterType !== 'all' && d.fileType !== filterType) return false;
    if (search && !d.title.toLowerCase().includes(search.toLowerCase()) && !d.category?.includes(search.toLowerCase())) return false;
    return !d.isArchived;
  });

  const wills = docs.filter(d => d.isWill && !d.isArchived);
  const byType = (t: string) => filtered.filter(d => d.fileType === t);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-bold">Document Vault</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            Securely store documents, images, videos, and recordings. Role-based access control keeps sensitive files protected.
          </p>
        </div>
        <Button className="rounded-full bg-amber-600 hover:bg-amber-500 text-white shrink-0" onClick={() => setDlg('upload')}>
          <Upload className="mr-1.5 h-4 w-4" /> Add to Vault
        </Button>
      </div>

      {/* Wills banner */}
      {wills.length > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
          <Scroll className="h-5 w-5 text-amber-700 shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{wills.length} will{wills.length !== 1 ? 's' : ''}</span> stored in this vault.{' '}
            {wills.map(w => w.title).join(', ')}
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vault…" className="pl-8 rounded-full h-8 text-sm" />
        </div>
        {['all','document','image','video','audio'].map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${filterType===t ? 'bg-amber-600 text-white border-amber-600' : 'border-border hover:border-amber-400'}`}>
            {t === 'all' ? 'All' : t.charAt(0).toUpperCase()+t.slice(1)+'s'}
          </button>
        ))}
      </div>

      {loading && <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-20 rounded-2xl border border-dashed space-y-4">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto">
            <FileText className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-serif text-xl font-bold">Vault is empty</p>
            <p className="text-muted-foreground text-sm mt-1 max-w-xs mx-auto">Add documents, images, videos, wills, land titles, royal decrees — anything that matters.</p>
          </div>
          <Button className="rounded-full bg-amber-600 hover:bg-amber-500 text-white" onClick={() => setDlg('upload')}>
            <Upload className="mr-1.5 h-4 w-4" /> Upload first document
          </Button>
        </div>
      )}

      {/* Document grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(doc => (
            <Card key={doc.id} className="group border hover:shadow-md transition-shadow cursor-pointer" onClick={() => openDoc(doc)}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl shrink-0 ${FILE_TYPE_COLORS[doc.fileType] ?? FILE_TYPE_COLORS.other}`}>
                    {FILE_TYPE_ICONS[doc.fileType] ?? FILE_TYPE_ICONS.other}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold leading-tight truncate">{doc.title}</p>
                    {doc.category && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">{doc.category.replace(/_/g, ' ')}</p>
                    )}
                  </div>
                  {doc.isWill && <Badge className="bg-amber-500 text-white text-[10px] shrink-0">Will</Badge>}
                </div>
                {doc.description && <p className="text-xs text-muted-foreground line-clamp-2">{doc.description}</p>}
                <div className="flex items-center justify-between pt-1 border-t border-muted/50">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {ACCESS_ICONS[doc.accessLevel]}
                    <span>{ACCESS_LABELS[doc.accessLevel]}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="flex items-center gap-0.5"><Eye className="h-3 w-3"/>{doc.viewCount}</span>
                    <span>{formatBytes(doc.fileSizeBytes)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Upload Dialog ── */}
      <Dialog open={dlg === 'upload'} onOpenChange={o => { if (!o) setDlg(null); }}>
        <DialogContent className="sm:max-w-[560px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Add to Vault</DialogTitle>
            <p className="text-sm text-muted-foreground">Upload a file or save a document record with access controls.</p>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* File drop */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors
                ${selectedFile ? 'border-amber-400 bg-amber-50/50' : 'border-border hover:border-amber-400 hover:bg-amber-50/30'}`}>
              {selectedFile ? (
                <div className="flex items-center justify-center gap-3">
                  <div className={`p-2 rounded-lg ${FILE_TYPE_COLORS[form.fileType]}`}>{FILE_TYPE_ICONS[form.fileType]}</div>
                  <div className="text-left">
                    <p className="font-medium text-sm">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)}</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setSelectedFile(null); }} className="ml-2 text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium">Click to select a file</p>
                  <p className="text-xs text-muted-foreground mt-1">Documents, images, videos, audio — up to plan limit</p>
                </>
              )}
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.mp3,.wav,.ogg" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Title *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Document title" className="rounded-lg" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                  <option value="">— Select —</option>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">File type</Label>
                <select value={form.fileType} onChange={e => setForm(f => ({ ...f, fileType: e.target.value }))} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                  {['document','image','video','audio','other'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="rounded-lg text-sm" />
            </div>

            {/* Access level */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Who can see this?</Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(ACCESS_LABELS).map(([v, l]) => (
                  <button key={v} onClick={() => setForm(f => ({ ...f, accessLevel: v }))}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-sm text-left transition-all
                      ${form.accessLevel === v ? 'border-amber-500 bg-amber-50 font-medium' : 'border-border hover:border-amber-300'}`}>
                    <span className="text-muted-foreground">{ACCESS_ICONS[v]}</span> {l}
                  </button>
                ))}
              </div>
              {form.accessLevel === 'specific_roles' && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {KINGDOM_ROLES.map(r => (
                    <button key={r} onClick={() => setForm(f => ({ ...f, allowedRoles: f.allowedRoles.includes(r) ? f.allowedRoles.filter(x=>x!==r) : [...f.allowedRoles, r] }))}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-all ${form.allowedRoles.includes(r) ? 'bg-amber-500 text-white border-amber-500' : 'border-border hover:border-amber-400'}`}>
                      {r.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Access instructions <span className="text-muted-foreground">(shown to members who request access)</span></Label>
              <Input value={form.accessInstructions} onChange={e => setForm(f => ({ ...f, accessInstructions: e.target.value }))}
                placeholder="e.g. Contact the family head to request access" className="rounded-lg text-sm" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Tags <span className="text-muted-foreground">(comma-separated)</span></Label>
              <Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="land, 1982, Lagos" className="rounded-lg text-sm" />
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <Switch checked={form.isWill} onCheckedChange={v => setForm(f => ({ ...f, isWill: v }))} />
              <div>
                <p className="text-sm font-medium">Mark as Will / Testament</p>
                <p className="text-xs text-muted-foreground">Adds a special banner and fast-find filter</p>
              </div>
            </div>

            <Button className="w-full rounded-full bg-amber-600 hover:bg-amber-500 text-white" onClick={upload} disabled={uploading || !form.title}>
              {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</> : <><Upload className="mr-2 h-4 w-4" />Save to Vault</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── View Dialog ── */}
      <Dialog open={dlg === 'view'} onOpenChange={o => { if (!o) { setDlg(null); setViewDoc(null); } }}>
        <DialogContent className="sm:max-w-[540px] max-h-[92vh] overflow-y-auto">
          {viewDoc && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${FILE_TYPE_COLORS[viewDoc.fileType]}`}>{FILE_TYPE_ICONS[viewDoc.fileType]}</div>
                  <div>
                    <DialogTitle className="font-serif text-lg">{viewDoc.title}</DialogTitle>
                    {viewDoc.category && <p className="text-xs text-muted-foreground capitalize mt-0.5">{viewDoc.category.replace(/_/g, ' ')}</p>}
                  </div>
                  {viewDoc.isWill && <Badge className="bg-amber-500 text-white ml-auto">Will</Badge>}
                </div>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {viewDoc.description && <p className="text-sm text-muted-foreground bg-muted/30 rounded-xl p-3">{viewDoc.description}</p>}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="space-y-0.5"><p className="text-xs text-muted-foreground">Access</p><p className="font-medium flex items-center gap-1">{ACCESS_ICONS[viewDoc.accessLevel]}{ACCESS_LABELS[viewDoc.accessLevel]}</p></div>
                  <div className="space-y-0.5"><p className="text-xs text-muted-foreground">File size</p><p className="font-medium">{formatBytes(viewDoc.fileSizeBytes)}</p></div>
                  <div className="space-y-0.5"><p className="text-xs text-muted-foreground">Views</p><p className="font-medium">{viewDoc.viewCount}</p></div>
                  <div className="space-y-0.5"><p className="text-xs text-muted-foreground">Downloads</p><p className="font-medium">{viewDoc.downloadCount}</p></div>
                </div>

                {viewDoc.accessInstructions && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div><p className="font-semibold text-xs uppercase tracking-wide mb-0.5">Access Instructions</p>{viewDoc.accessInstructions}</div>
                  </div>
                )}

                {viewDoc.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {viewDoc.tags.map(t => <span key={t} className="text-[11px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">#{t}</span>)}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  {viewDoc.downloadUrl && (
                    <a href={viewDoc.downloadUrl} target="_blank" rel="noreferrer" className="flex-1">
                      <Button className="w-full rounded-full bg-amber-600 hover:bg-amber-500 text-white">
                        <Download className="mr-1.5 h-4 w-4" /> Download
                      </Button>
                    </a>
                  )}
                  {!viewDoc.downloadUrl && viewDoc.fileUrl && (
                    <a href={viewDoc.fileUrl} target="_blank" rel="noreferrer" className="flex-1">
                      <Button variant="outline" className="w-full rounded-full"><Eye className="mr-1.5 h-4 w-4" /> View File</Button>
                    </a>
                  )}
                  <Button variant="outline" className="rounded-full" onClick={() => archiveDoc(viewDoc)}>
                    {viewDoc.isArchived ? 'Unarchive' : 'Archive'}
                  </Button>
                  <Button variant="outline" className="rounded-full text-destructive hover:bg-destructive hover:text-white" onClick={() => { deleteDoc(viewDoc); setDlg(null); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
