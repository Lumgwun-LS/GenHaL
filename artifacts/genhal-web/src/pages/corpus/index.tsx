import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, FileText, Music, Video, Image, BookOpen,
  CheckCircle2, XCircle, Clock, Play, Loader2, Plus,
  Globe2, Filter, Trash2, ChevronRight, Brain, Zap,
  RefreshCw, AlertTriangle, Download, ExternalLink, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useListGenhalLanguages } from '@workspace/api-client-react';
import { getApiBaseUrl } from '@/lib/api';
import { Switch } from '@/components/ui/switch';

// ─── types ────────────────────────────────────────────────────────────────────
type MaterialType = 'bible' | 'audio' | 'video' | 'text' | 'image';

interface Dataset {
  id: number; languageCode: string; type: MaterialType;
  title: string; description?: string; fileUrl: string; fileName: string;
  fileMimeType?: string; fileSizeBytes?: number; durationSeconds?: number;
  pageCount?: number; wordCount?: number; status: string;
  approvedForTraining: boolean; createdAt: string;
}

interface TrainingRun {
  id: number; name: string; languageCode: string; modelType: string;
  platformType: string; status: string; datasetIds: number[];
  platformJobId?: string; datasetManifestUri?: string; outputModelUri?: string;
  errorMessage?: string; progressPercent?: number;
  startedAt?: string; completedAt?: string; createdAt: string;
}

interface CorpusStats {
  totalMaterials: number; approvedMaterials: number;
  totalRuns: number; completedRuns: number;
  byType: Record<string, number>;
  vertexConfigured: boolean; gcpProject?: string; vertexRegion: string;
}

// ─── constants ────────────────────────────────────────────────────────────────
const TYPE_META: Record<MaterialType, { label: string; icon: React.ReactNode; accept: string; color: string }> = {
  bible:  { label: 'Scripture / Bible',  icon: <BookOpen className="h-5 w-5" />, accept: '.pdf,.epub,.txt,.docx', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  audio:  { label: 'Audio',             icon: <Music     className="h-5 w-5" />, accept: '.mp3,.wav,.ogg,.m4a,.flac', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  video:  { label: 'Video',             icon: <Video     className="h-5 w-5" />, accept: '.mp4,.mov,.avi,.mkv,.webm', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  text:   { label: 'Text / Dictionary', icon: <FileText  className="h-5 w-5" />, accept: '.txt,.csv,.tsv,.json,.docx', color: 'bg-green-100 text-green-700 border-green-200' },
  image:  { label: 'Images / Manuscripts', icon: <Image className="h-5 w-5" />, accept: '.png,.jpg,.jpeg,.webp,.tiff,.pdf', color: 'bg-rose-100 text-rose-700 border-rose-200' },
};

const MODEL_TYPES = [
  { value: 'asr',  label: 'ASR (Speech Recognition)',  desc: 'Transcribes spoken language to text — fine-tunes Whisper' },
  { value: 'lm',   label: 'Language Model (LLM)',      desc: 'Understands and generates text in the language' },
  { value: 'tts',  label: 'TTS (Text-to-Speech)',      desc: 'Synthesises natural-sounding speech from text' },
  { value: 'full', label: 'Full Suite (all three)',    desc: 'Trains ASR + LLM + TTS in one pipeline' },
];

function fmt(bytes?: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    ready: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    queued: 'bg-yellow-100 text-yellow-700',
    running: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-600',
  };
  return map[status] ?? 'bg-muted text-muted-foreground';
}

// ─── main page ────────────────────────────────────────────────────────────────
export default function LanguageCorpus() {
  const { data: languages } = useListGenhalLanguages();
  const { toast } = useToast();
  const base = getApiBaseUrl();

  const [datasets, setDatasets]     = useState<Dataset[]>([]);
  const [runs, setRuns]             = useState<TrainingRun[]>([]);
  const [stats, setStats]           = useState<CorpusStats | null>(null);
  const [loading, setLoading]       = useState(true);
  const [filterLang, setFilterLang] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterApproved, setFilterApproved] = useState('');
  const [tab, setTab]               = useState('materials');
  const [launchOpen, setLaunchOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterLang)    params.set('languageCode', filterLang);
      if (filterType)    params.set('type', filterType);
      if (filterApproved) params.set('approved', filterApproved);

      const [d, r, s] = await Promise.all([
        fetch(`${base}/genhal/corpus/datasets?${params}`).then(r => r.json()),
        fetch(`${base}/genhal/corpus/training`).then(r => r.json()),
        fetch(`${base}/genhal/corpus/stats`).then(r => r.json()),
      ]);
      setDatasets(Array.isArray(d) ? d : []);
      setRuns(Array.isArray(r) ? r : []);
      setStats(s?.totalMaterials !== undefined ? s : null);
    } catch {
      toast({ variant: 'destructive', title: 'Failed to load corpus data' });
    } finally {
      setLoading(false);
    }
  }, [base, filterLang, filterType, filterApproved]);

  useEffect(() => { load(); }, [load]);

  const toggleApproval = async (d: Dataset) => {
    await fetch(`${base}/genhal/corpus/datasets/${d.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvedForTraining: !d.approvedForTraining }),
    });
    load();
  };

  const deleteDataset = async (id: number) => {
    if (!confirm('Delete this material?')) return;
    await fetch(`${base}/genhal/corpus/datasets/${id}`, { method: 'DELETE' });
    load();
  };

  const cancelRun = async (id: number) => {
    await fetch(`${base}/genhal/corpus/training/${id}/cancel`, { method: 'POST' });
    load();
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      {/* header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-serif font-bold">Language Corpus</h1>
          <p className="text-muted-foreground mt-2 text-lg max-w-xl">
            Upload language materials, curate your training dataset, and launch AI model training on Google Vertex AI.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" className="rounded-full" onClick={load}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" className="rounded-full bg-primary" onClick={() => setTab('upload')}>
            <Upload className="mr-1.5 h-4 w-4" /> Upload
          </Button>
        </div>
      </div>

      {/* stats row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Materials" value={stats.totalMaterials} icon={<BookOpen className="h-5 w-5 text-primary" />} />
          <StatCard label="Approved for Training" value={stats.approvedMaterials} icon={<CheckCircle2 className="h-5 w-5 text-green-600" />} />
          <StatCard label="Training Runs" value={stats.totalRuns} icon={<Brain className="h-5 w-5 text-purple-600" />} />
          <StatCard label="Models Trained" value={stats.completedRuns} icon={<Zap className="h-5 w-5 text-amber-600" />} />
        </div>
      )}

      {/* Vertex AI status banner */}
      {stats && !stats.vertexConfigured && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Vertex AI not configured</p>
            <p className="mt-0.5 text-amber-700">
              Set <code className="bg-amber-100 px-1 rounded">GOOGLE_CLOUD_PROJECT</code> and optionally{' '}
              <code className="bg-amber-100 px-1 rounded">VERTEX_AI_REGION</code> (default: us-central1) to enable automatic job submission.
              You can still upload materials and build your dataset now — training jobs will be queued until configured.
            </p>
          </div>
        </div>
      )}
      {stats?.vertexConfigured && (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-green-200 bg-green-50 text-green-800 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            Connected to Google Vertex AI · Project: <strong>{stats.gcpProject}</strong> · Region: <strong>{stats.vertexRegion}</strong>
          </span>
        </div>
      )}

      {/* main tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-xl bg-muted p-1">
          <TabsTrigger value="materials" className="rounded-lg">Materials ({datasets.length})</TabsTrigger>
          <TabsTrigger value="upload" className="rounded-lg">Upload</TabsTrigger>
          <TabsTrigger value="training" className="rounded-lg">Training ({runs.length})</TabsTrigger>
        </TabsList>

        {/* ── MATERIALS tab ── */}
        <TabsContent value="materials" className="space-y-6 mt-6">
          {/* filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={filterLang || 'all'} onValueChange={v => setFilterLang(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-40 rounded-lg"><SelectValue placeholder="All languages" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All languages</SelectItem>
                {languages?.map(l => <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterType || 'all'} onValueChange={v => setFilterType(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-40 rounded-lg"><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {(Object.keys(TYPE_META) as MaterialType[]).map(t => (
                  <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterApproved || 'all'} onValueChange={v => setFilterApproved(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-44 rounded-lg"><SelectValue placeholder="Approval status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Approved for training</SelectItem>
                <SelectItem value="false">Not yet approved</SelectItem>
              </SelectContent>
            </Select>
            {(filterLang || filterType || filterApproved) && (
              <Button variant="ghost" size="sm" className="rounded-full" onClick={() => { setFilterLang(''); setFilterType(''); setFilterApproved(''); }}>
                <X className="mr-1 h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>

          {loading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map(i => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : datasets.length === 0 ? (
            <div className="text-center py-20 bg-card rounded-3xl border border-dashed">
              <Upload className="h-12 w-12 text-muted mx-auto mb-4" />
              <p className="font-serif text-xl font-bold">No materials yet</p>
              <p className="text-muted-foreground mt-2 mb-6">Upload language Bibles, audio, video, or text files to begin.</p>
              <Button className="rounded-full" onClick={() => setTab('upload')}>Upload first material</Button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {datasets.map(d => (
                <MaterialCard key={d.id} dataset={d} onToggleApproval={() => toggleApproval(d)} onDelete={() => deleteDataset(d.id)} />
              ))}
            </div>
          )}

          {datasets.filter(d => d.approvedForTraining).length > 0 && (
            <div className="flex justify-end">
              <Button className="rounded-full bg-primary" onClick={() => { setLaunchOpen(true); }}>
                <Brain className="mr-2 h-4 w-4" />
                Launch Training Run ({datasets.filter(d => d.approvedForTraining).length} approved materials)
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ── UPLOAD tab ── */}
        <TabsContent value="upload" className="mt-6">
          <UploadWizard languages={languages ?? []} onSuccess={() => { load(); setTab('materials'); }} />
        </TabsContent>

        {/* ── TRAINING tab ── */}
        <TabsContent value="training" className="space-y-6 mt-6">
          <div className="flex justify-between items-center">
            <p className="text-muted-foreground text-sm">{runs.length} training {runs.length === 1 ? 'run' : 'runs'}</p>
            <Button className="rounded-full" onClick={() => setLaunchOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> New Training Run
            </Button>
          </div>
          {runs.length === 0 ? (
            <div className="text-center py-20 bg-card rounded-3xl border border-dashed">
              <Brain className="h-12 w-12 text-muted mx-auto mb-4" />
              <p className="font-serif text-xl font-bold">No training runs yet</p>
              <p className="text-muted-foreground mt-2 mb-6">Approve materials then launch a training run to fine-tune AI models on your language.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {runs.map(r => <TrainingRunCard key={r.id} run={r} onCancel={() => cancelRun(r.id)} onRefresh={load} base={base} />)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Launch training dialog */}
      <LaunchTrainingDialog
        open={launchOpen}
        onOpenChange={setLaunchOpen}
        languages={languages ?? []}
        approvedDatasets={datasets.filter(d => d.approvedForTraining)}
        base={base}
        onSuccess={() => { setLaunchOpen(false); load(); setTab('training'); }}
      />
    </div>
  );
}

// ─── MaterialCard ─────────────────────────────────────────────────────────────
function MaterialCard({ dataset: d, onToggleApproval, onDelete }: {
  dataset: Dataset; onToggleApproval: () => void; onDelete: () => void;
}) {
  const meta = TYPE_META[d.type as MaterialType] ?? TYPE_META.text;
  return (
    <Card className="border shadow-sm hover:shadow-md transition-all group">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className={`p-2 rounded-lg border ${meta.color}`}>{meta.icon}</div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <a href={d.fileUrl} target="_blank" rel="noreferrer">
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg"><ExternalLink className="h-3.5 w-3.5" /></Button>
            </a>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div>
          <p className="font-semibold text-foreground text-sm leading-tight line-clamp-2">{d.title}</p>
          <div className="flex gap-2 mt-1.5 flex-wrap">
            <Badge variant="outline" className="text-[10px] px-2">{d.languageCode.toUpperCase()}</Badge>
            <Badge variant="outline" className={`text-[10px] px-2 border ${meta.color}`}>{meta.label}</Badge>
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground space-y-0.5">
          <p>{fmt(d.fileSizeBytes)} · {d.fileName}</p>
          {d.durationSeconds && <p>{Math.round(d.durationSeconds / 60)} min audio/video</p>}
          {d.wordCount && <p>{d.wordCount.toLocaleString()} words</p>}
          {d.pageCount && <p>{d.pageCount} pages</p>}
        </div>

        <div className="flex items-center justify-between pt-1 border-t">
          <div className="flex items-center gap-2 text-xs">
            <Switch
              checked={d.approvedForTraining}
              onCheckedChange={onToggleApproval}
              className="scale-75 origin-left"
            />
            <span className={d.approvedForTraining ? 'text-green-700 font-medium' : 'text-muted-foreground'}>
              {d.approvedForTraining ? 'Approved' : 'Not approved'}
            </span>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusBadge(d.status)}`}>
            {d.status}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── UploadWizard ─────────────────────────────────────────────────────────────
function UploadWizard({ languages, onSuccess }: { languages: any[]; onSuccess: () => void }) {
  const { toast } = useToast();
  const base = getApiBaseUrl();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'type' | 'file' | 'meta' | 'uploading' | 'done'>('type');
  const [selectedType, setSelectedType] = useState<MaterialType>('bible');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [form, setForm] = useState({ languageCode: '', title: '', description: '' });

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); setStep('meta'); if (!form.title) setForm(p => ({ ...p, title: f.name.replace(/\.[^.]+$/, '') })); }
  }, [form.title]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setStep('meta'); if (!form.title) setForm(p => ({ ...p, title: f.name.replace(/\.[^.]+$/, '') })); }
  };

  const doUpload = async () => {
    if (!file || !form.languageCode || !form.title) return;
    setStep('uploading'); setProgress(10);

    try {
      // 1. Get presigned URL
      const urlRes = await fetch(`${base}/genhal/corpus/upload-url`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ languageCode: form.languageCode, type: selectedType, fileName: file.name, mimeType: file.type }),
      });
      const { uploadUrl, fileUrl } = await urlRes.json();
      setProgress(25);

      // 2. Upload to object storage
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = e => { if (e.lengthComputable) setProgress(25 + Math.round((e.loaded / e.total) * 60)); };
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
        xhr.onerror = reject;
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.send(file);
      });
      setProgress(88);

      // 3. Register with API
      await fetch(`${base}/genhal/corpus/datasets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          languageCode: form.languageCode, type: selectedType,
          title: form.title, description: form.description,
          fileUrl, fileName: file.name, fileMimeType: file.type,
          fileSizeBytes: file.size,
        }),
      });
      setProgress(100); setStep('done');
      toast({ title: 'Material uploaded!', description: `${form.title} is ready for review.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Upload failed', description: err.message });
      setStep('meta');
    }
  };

  if (step === 'done') return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4 animate-in fade-in">
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
      </div>
      <div>
        <p className="font-serif text-2xl font-bold">Upload complete!</p>
        <p className="text-muted-foreground mt-1">{form.title} has been added to your corpus.</p>
      </div>
      <div className="flex gap-3">
        <Button className="rounded-full" onClick={() => { setStep('type'); setFile(null); setForm({ languageCode: form.languageCode, title: '', description: '' }); setProgress(0); }}>
          Upload another
        </Button>
        <Button variant="outline" className="rounded-full" onClick={onSuccess}>View materials</Button>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {(['type', 'file', 'meta'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
              ${['type','file','meta','uploading','done'].indexOf(step) >= i ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
              {i + 1}
            </div>
            <span className={['type','file','meta','uploading','done'].indexOf(step) >= i ? 'text-foreground font-medium' : 'text-muted-foreground'}>
              {['Choose type', 'Select file', 'Add details'][i]}
            </span>
            {i < 2 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* step 1: type */}
      {step === 'type' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
          <h2 className="font-serif text-2xl font-bold">What are you uploading?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(Object.entries(TYPE_META) as [MaterialType, any][]).map(([type, m]) => (
              <button key={type} onClick={() => { setSelectedType(type); setStep('file'); }}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all hover:shadow-md
                  ${selectedType === type ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
                <div className={`p-2 rounded-lg ${m.color}`}>{m.icon}</div>
                <div>
                  <p className="font-semibold text-sm">{m.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.accept.replace(/\./g, '').toUpperCase()}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* step 2: file drop */}
      {step === 'file' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setStep('type')} className="text-sm text-muted-foreground hover:text-foreground">← Back</button>
            <h2 className="font-serif text-2xl font-bold">Select {TYPE_META[selectedType].label} file</h2>
          </div>
          <div
            className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all
              ${dragging ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-border hover:border-primary/60 hover:bg-muted/30'}`}
            onDragEnter={e => { e.preventDefault(); setDragging(true); }}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <div className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${TYPE_META[selectedType].color}`}>
              {TYPE_META[selectedType].icon}
            </div>
            <p className="font-semibold text-foreground">Drop your file here, or click to browse</p>
            <p className="text-sm text-muted-foreground mt-1">Accepts: {TYPE_META[selectedType].accept.replace(/\./g, '').toUpperCase()}</p>
            <p className="text-xs text-muted-foreground/60 mt-3">Files up to several GB supported</p>
            <input ref={fileRef} type="file" accept={TYPE_META[selectedType].accept} className="hidden" onChange={onFileChange} />
          </div>
        </div>
      )}

      {/* step 3: metadata */}
      {step === 'meta' && file && (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setStep('file')} className="text-sm text-muted-foreground hover:text-foreground">← Back</button>
            <h2 className="font-serif text-2xl font-bold">Add details</h2>
          </div>

          {/* file preview pill */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border text-sm">
            <div className={`p-2 rounded-lg ${TYPE_META[selectedType].color}`}>{TYPE_META[selectedType].icon}</div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{file.name}</p>
              <p className="text-muted-foreground text-xs">{fmt(file.size)}</p>
            </div>
            <button onClick={() => { setFile(null); setStep('file'); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Language *</Label>
              <Select value={form.languageCode} onValueChange={v => setForm(p => ({ ...p, languageCode: v }))}>
                <SelectTrigger className="rounded-lg"><SelectValue placeholder="Select language" /></SelectTrigger>
                <SelectContent>
                  {languages.map(l => <SelectItem key={l.code} value={l.code}>{l.name} ({l.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Obolo Bible — New Testament" className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Source, year, speaker details, dialect notes…" rows={3} className="rounded-lg" />
            </div>
            <Button className="w-full rounded-full bg-primary" disabled={!form.languageCode || !form.title} onClick={doUpload}>
              <Upload className="mr-2 h-4 w-4" /> Upload Material
            </Button>
          </div>
        </div>
      )}

      {/* uploading */}
      {step === 'uploading' && (
        <div className="flex flex-col items-center py-16 gap-6 animate-in fade-in">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
          </div>
          <div className="w-full max-w-sm space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Uploading {file?.name}</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TrainingRunCard ──────────────────────────────────────────────────────────
function TrainingRunCard({ run, onCancel, onRefresh, base }: {
  run: TrainingRun; onCancel: () => void; onRefresh: () => void; base: string;
}) {
  const isActive = ['queued', 'running'].includes(run.status);
  const statusIcon = {
    queued: <Clock className="h-4 w-4 text-yellow-600" />,
    running: <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />,
    completed: <CheckCircle2 className="h-4 w-4 text-green-600" />,
    failed: <XCircle className="h-4 w-4 text-red-600" />,
    cancelled: <XCircle className="h-4 w-4 text-gray-400" />,
  }[run.status] ?? <Clock className="h-4 w-4" />;

  const modelMeta = MODEL_TYPES.find(m => m.value === run.modelType);

  return (
    <Card className="border shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {statusIcon}
            <div>
              <p className="font-semibold">{run.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {run.languageCode.toUpperCase()} · {modelMeta?.label ?? run.modelType} · {run.platformType.replace('_', ' ')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(run.status)}`}>{run.status}</span>
            {isActive && (
              <Button variant="outline" size="sm" className="rounded-full text-xs h-7" onClick={onCancel}>Cancel</Button>
            )}
            {isActive && (
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={onRefresh}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-muted-foreground">
          <div><span className="font-medium block text-foreground">{run.datasetIds?.length ?? 0}</span>datasets</div>
          {run.startedAt && <div><span className="font-medium block text-foreground">{new Date(run.startedAt).toLocaleString()}</span>started</div>}
          {run.completedAt && <div><span className="font-medium block text-foreground">{new Date(run.completedAt).toLocaleString()}</span>completed</div>}
          {run.platformJobId && <div className="col-span-2 truncate"><span className="font-medium block text-foreground truncate">{run.platformJobId}</span>job ID</div>}
        </div>

        {run.status === 'running' && (
          <div className="mt-3 space-y-1">
            <Progress value={run.progressPercent ?? 30} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground">Training in progress…</p>
          </div>
        )}

        {run.errorMessage && (
          <div className="mt-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {run.errorMessage}
          </div>
        )}

        {run.outputModelUri && (
          <div className="mt-3 flex items-center gap-2 text-xs text-green-700 font-medium">
            <Download className="h-3.5 w-3.5" />
            Model output: <span className="font-mono truncate max-w-xs">{run.outputModelUri}</span>
          </div>
        )}

        {run.datasetManifestUri && (
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <ExternalLink className="h-3 w-3" />
            Manifest: <span className="font-mono truncate max-w-xs">{run.datasetManifestUri}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── LaunchTrainingDialog ─────────────────────────────────────────────────────
function LaunchTrainingDialog({ open, onOpenChange, languages, approvedDatasets, base, onSuccess }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  languages: any[]; approvedDatasets: Dataset[]; base: string; onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: '', languageCode: '', modelType: 'asr',
    platformType: 'vertex_ai', selectedIds: [] as number[],
    epochs: '10', learningRate: '5e-5', batchSize: '8',
  });
  const [submitting, setSubmitting] = useState(false);

  // filter approved datasets by selected language
  const eligible = form.languageCode
    ? approvedDatasets.filter(d => d.languageCode === form.languageCode)
    : approvedDatasets;

  const toggleDataset = (id: number) =>
    setForm(f => ({
      ...f,
      selectedIds: f.selectedIds.includes(id) ? f.selectedIds.filter(x => x !== id) : [...f.selectedIds, id],
    }));

  const submit = async () => {
    if (!form.name || !form.languageCode || !form.modelType || !form.selectedIds.length) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${base}/genhal/corpus/training`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, languageCode: form.languageCode,
          modelType: form.modelType, platformType: form.platformType,
          datasetIds: form.selectedIds,
          config: { epochs: form.epochs, learning_rate: form.learningRate, batch_size: form.batchSize },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const run = await res.json();
      toast({ title: 'Training job submitted!', description: run._warning ?? `Run "${form.name}" is ${run.status}.` });
      onSuccess();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Failed to launch', description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" /> Launch Training Run
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label>Run name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Obolo ASR v1 — Jan 2026" className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label>Language *</Label>
              <Select value={form.languageCode} onValueChange={v => setForm(f => ({ ...f, languageCode: v, selectedIds: [] }))}>
                <SelectTrigger className="rounded-lg"><SelectValue placeholder="Select language" /></SelectTrigger>
                <SelectContent>
                  {languages.map(l => <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Platform</Label>
              <Select value={form.platformType} onValueChange={v => setForm(f => ({ ...f, platformType: v }))}>
                <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vertex_ai">Google Vertex AI</SelectItem>
                  <SelectItem value="sagemaker">AWS SageMaker</SelectItem>
                  <SelectItem value="azure_ml">Azure ML</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* model type */}
          <div className="space-y-2">
            <Label>Model type *</Label>
            <div className="grid grid-cols-2 gap-2">
              {MODEL_TYPES.map(m => (
                <button key={m.value} onClick={() => setForm(f => ({ ...f, modelType: m.value }))}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${form.modelType === m.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                  <p className="font-semibold text-sm">{m.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* dataset picker */}
          {form.languageCode && (
            <div className="space-y-2">
              <Label>Select approved materials * ({form.selectedIds.length} selected)</Label>
              {eligible.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">No approved materials for {form.languageCode}. Approve materials in the Materials tab first.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {eligible.map(d => {
                    const meta = TYPE_META[d.type as MaterialType];
                    const checked = form.selectedIds.includes(d.id);
                    return (
                      <label key={d.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all
                        ${checked ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleDataset(d.id)} className="rounded" />
                        <div className={`p-1.5 rounded-lg ${meta.color}`}>{meta.icon}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{d.title}</p>
                          <p className="text-xs text-muted-foreground">{meta.label} · {fmt(d.fileSizeBytes)}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* hyperparams */}
          <details className="rounded-xl border overflow-hidden">
            <summary className="px-4 py-3 text-sm font-medium cursor-pointer bg-muted/30 hover:bg-muted/50">
              Advanced hyperparameters
            </summary>
            <div className="p-4 grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Epochs</Label>
                <Input value={form.epochs} onChange={e => setForm(f => ({ ...f, epochs: e.target.value }))} className="rounded-lg h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Learning Rate</Label>
                <Input value={form.learningRate} onChange={e => setForm(f => ({ ...f, learningRate: e.target.value }))} className="rounded-lg h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Batch Size</Label>
                <Input value={form.batchSize} onChange={e => setForm(f => ({ ...f, batchSize: e.target.value }))} className="rounded-lg h-8 text-sm" />
              </div>
            </div>
          </details>

          <Button className="w-full rounded-full bg-primary" disabled={submitting || !form.name || !form.languageCode || !form.selectedIds.length} onClick={submit}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
            {submitting ? 'Submitting…' : 'Launch Training Job'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card className="border-none shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
      <CardContent className="p-5 flex items-center gap-4">
        <div className="p-3 bg-muted rounded-xl">{icon}</div>
        <div>
          <p className="text-2xl font-bold font-serif">{value.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
