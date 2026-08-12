import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Mic, Square, Play, Upload, MapPin, Camera, Video, Book,
  CheckCircle2, Loader2, Globe2, Users, ChevronRight, Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useListGenhalLanguages, useListGenhalCommunities } from '@workspace/api-client-react';
import { getApiBaseUrl } from '@/lib/api';

type RecordingType = 'word' | 'sentence' | 'story' | 'interview' | 'artifact' | 'place';

type CollectForm = {
  type: RecordingType;
  languageCode: string;
  communityId: string;
  textContent: string;
  speakerName: string;
  speakerAgeGroup: string;
  locationDescription: string;
  consentGiven: boolean;
};

const RECORDING_TYPES = [
  {
    key: 'word' as RecordingType,
    label: 'Record a Word',
    icon: '🔤',
    description: 'Pronounce a single word or phrase',
    color: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300',
    activeColor: 'bg-emerald-600 border-emerald-600 text-white dark:border-emerald-500/50',
  },
  {
    key: 'sentence' as RecordingType,
    label: 'Record a Sentence',
    icon: '📝',
    description: 'Speak a full sentence or proverb',
    color: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300',
    activeColor: 'bg-blue-600 border-blue-600 text-white dark:border-blue-500/50',
  },
  {
    key: 'story' as RecordingType,
    label: 'Tell a Story',
    icon: '📖',
    description: 'Share a folk tale, legend, or personal story',
    color: 'bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-500/10 dark:border-purple-500/30 dark:text-purple-300',
    activeColor: 'bg-purple-600 border-purple-600 text-white dark:border-purple-500/50',
  },
  {
    key: 'interview' as RecordingType,
    label: 'Interview an Elder',
    icon: '🎥',
    description: 'Video record knowledge from community elders',
    color: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300',
    activeColor: 'bg-amber-600 border-amber-600 text-white dark:border-amber-500/50',
  },
  {
    key: 'artifact' as RecordingType,
    label: 'Photograph an Artifact',
    icon: '🏺',
    description: 'Document cultural objects, tools, or artworks',
    color: 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-300',
    activeColor: 'bg-rose-600 border-rose-600 text-white dark:border-rose-500/50',
  },
  {
    key: 'place' as RecordingType,
    label: 'Document a Place',
    icon: '📍',
    description: 'GPS-tagged photo + description of a heritage site',
    color: 'bg-teal-50 border-teal-200 text-teal-800 dark:bg-teal-500/10 dark:border-teal-500/30 dark:text-teal-300',
    activeColor: 'bg-teal-600 border-teal-600 text-white dark:border-teal-500/50',
  },
];

function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(async (video = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video,
      });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: video ? 'video/webm' : 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      setIsRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch {
      alert('Please allow microphone access to record.');
    }
  }, []);

  const stop = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const reset = useCallback(() => {
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
  }, []);

  return { isRecording, audioBlob, audioUrl, duration, start, stop, reset };
}

function formatDuration(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function HeritageCollector() {
  const { toast } = useToast();
  const { data: languages } = useListGenhalLanguages();
  const { data: communities } = useListGenhalCommunities();
  const audio = useAudioRecorder();

  const [activeType, setActiveType] = useState<RecordingType>('word');
  const [form, setForm] = useState<CollectForm>({
    type: 'word',
    languageCode: '',
    communityId: '',
    textContent: '',
    speakerName: '',
    speakerAgeGroup: '',
    locationDescription: '',
    consentGiven: true,
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const typeInfo = RECORDING_TYPES.find(t => t.key === activeType)!;
  const isAudioType = ['word', 'sentence', 'story'].includes(activeType);
  const isVideoType = activeType === 'interview';
  const isPhotoType = ['artifact', 'place'].includes(activeType);

  function handleTypeSwitch(type: RecordingType) {
    setActiveType(type);
    setForm(f => ({ ...f, type }));
    audio.reset();
    setPhotoFile(null);
    setPhotoPreview(null);
    setSubmitted(false);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function getLocation() {
    return new Promise<{ lat: number; lng: number }>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        reject
      );
    });
  }

  async function captureLocation() {
    try {
      const loc = await getLocation();
      setLocation(loc);
      toast({ title: 'Location captured', description: `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}` });
    } catch {
      toast({ title: 'Location unavailable', variant: 'destructive' });
    }
  }

  async function uploadBlob(blob: Blob, mediaType: 'audio' | 'video' | 'image'): Promise<string> {
    const base = getApiBaseUrl();

    // Get presigned upload URL
    const urlRes = await fetch(`${base}/genhal/collect/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ mediaType }),
    });
    if (!urlRes.ok) throw new Error('Failed to get upload URL');
    const { uploadUrl, mediaUrl } = await urlRes.json() as { uploadUrl: string; mediaUrl: string };

    // Upload the blob
    setUploadProgress(30);
    await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type } });
    setUploadProgress(80);

    return mediaUrl;
  }

  async function handleSubmit() {
    if (!form.languageCode) {
      toast({ title: 'Select a language', variant: 'destructive' }); return;
    }
    if (!form.consentGiven) {
      toast({ title: 'Consent required', variant: 'destructive' }); return;
    }

    setSubmitting(true);
    setUploadProgress(10);

    try {
      let audioUrl: string | undefined;
      let videoUrl: string | undefined;
      let photoUrl: string | undefined;

      if ((isAudioType || isVideoType) && audio.audioBlob) {
        const url = await uploadBlob(audio.audioBlob, isVideoType ? 'video' : 'audio');
        if (isVideoType) videoUrl = url;
        else audioUrl = url;
      }

      if (isPhotoType && photoFile) {
        photoUrl = await uploadBlob(photoFile, 'image');
      }

      setUploadProgress(90);

      const base = getApiBaseUrl();
      const body: Record<string, unknown> = {
        type: activeType,
        languageCode: form.languageCode,
        communityId: form.communityId ? Number(form.communityId) : undefined,
        textContent: form.textContent || undefined,
        speakerName: form.speakerName || undefined,
        speakerAgeGroup: form.speakerAgeGroup || undefined,
        locationDescription: form.locationDescription || undefined,
        locationLat: location?.lat?.toString(),
        locationLng: location?.lng?.toString(),
        consentGiven: form.consentGiven,
        audioUrl,
        videoUrl,
        photoUrl,
      };

      const res = await fetch(`${base}/genhal/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Submission failed');

      setUploadProgress(100);
      setSubmitted(true);
      audio.reset();
      setPhotoFile(null);
      setPhotoPreview(null);
      setLocation(null);
      setForm(f => ({ ...f, textContent: '', locationDescription: '' }));
      toast({ title: '✅ Contribution saved!', description: 'Thank you for preserving this language.' });
    } catch (err) {
      toast({ title: 'Submission failed', description: String(err), variant: 'destructive' });
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
    }
  }

  const canSubmit = form.languageCode && form.consentGiven && (
    (isAudioType && audio.audioBlob) ||
    (isVideoType && audio.audioBlob) ||
    (isPhotoType && photoFile) ||
    form.textContent
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-accent text-white p-8 md:p-12 shadow-xl">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-8 right-8 text-[200px] leading-none">🎙️</div>
        </div>
        <div className="relative z-10 max-w-2xl space-y-4">
          <Badge className="bg-white/20 text-white border-white/30 font-bold uppercase tracking-wider">
            Heritage Collector
          </Badge>
          <h1 className="text-4xl md:text-5xl font-serif font-bold leading-tight">
            Every Voice.<br />Every Word.<br />Preserved Forever.
          </h1>
          <p className="text-lg opacity-90 max-w-xl">
            Your recordings build the world's most comprehensive African language dataset.
            Words, stories, and voices gathered today train the AI that speaks for your community tomorrow.
          </p>
          <div className="flex gap-6 pt-2 text-sm font-semibold opacity-90">
            <span className="flex items-center gap-1"><Globe2 className="w-4 h-4" /> Language preserved</span>
            <span className="flex items-center gap-1"><Users className="w-4 h-4" /> Community-owned</span>
            <span className="flex items-center gap-1"><Sparkles className="w-4 h-4" /> AI-ready dataset</span>
          </div>
        </div>
      </div>

      {/* Pipeline flow */}
      <Card className="border-primary/10 bg-primary/5">
        <CardContent className="p-6">
          <h3 className="font-serif font-bold text-foreground mb-4 text-lg">How your contribution becomes AI</h3>
          <div className="flex flex-wrap gap-2 items-center text-sm">
            {['Your Recording', 'Noise Removal', 'Transcription', 'Speaker ID', 'Dataset Store', 'Quality Review', 'Model Training', 'Language AI'].map((step, i, arr) => (
              <span key={step} className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-full bg-white border border-primary/20 font-medium text-foreground shadow-sm dark:bg-card">{step}</span>
                {i < arr.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-6">

        {/* Left: Type selector */}
        <div className="md:col-span-1 space-y-3">
          <h2 className="font-serif font-bold text-xl text-foreground">Choose Type</h2>
          {RECORDING_TYPES.map(t => (
            <button
              key={t.key}
              onClick={() => handleTypeSwitch(t.key)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                activeType === t.key ? t.activeColor : `${t.color} hover:opacity-80`
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{t.icon}</span>
                <div>
                  <div className="font-semibold text-sm">{t.label}</div>
                  <div className="text-xs opacity-75 mt-0.5">{t.description}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Right: Recording interface */}
        <div className="md:col-span-2 space-y-6">
          <Card className="border-2 border-primary/10 shadow-lg">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 font-serif">
                <span className="text-3xl">{typeInfo.icon}</span>
                {typeInfo.label}
              </CardTitle>
              <CardDescription>{typeInfo.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Language + Community */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Language *</Label>
                  <Select value={form.languageCode} onValueChange={v => setForm(f => ({ ...f, languageCode: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select language" /></SelectTrigger>
                    <SelectContent>
                      {languages?.map(l => (
                        <SelectItem key={l.code} value={l.code}>{l.name} ({l.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Community</Label>
                  <Select value={form.communityId} onValueChange={v => setForm(f => ({ ...f, communityId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      {communities?.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Text content (for word/sentence types) */}
              {(activeType === 'word' || activeType === 'sentence') && (
                <div className="space-y-2">
                  <Label>
                    {activeType === 'word' ? 'Word or phrase being recorded' : 'Sentence being spoken'}
                  </Label>
                  <Input
                    value={form.textContent}
                    onChange={e => setForm(f => ({ ...f, textContent: e.target.value }))}
                    placeholder={activeType === 'word' ? '"Father" / "Nnaa" / "Baba"' : '"My father went to the river."'}
                    className="text-base"
                  />
                </div>
              )}

              {/* Story / Interview prompt */}
              {(activeType === 'story' || activeType === 'interview') && (
                <div className="space-y-2">
                  <Label>Topic or title <span className="text-muted-foreground">(optional)</span></Label>
                  <Input
                    value={form.textContent}
                    onChange={e => setForm(f => ({ ...f, textContent: e.target.value }))}
                    placeholder={activeType === 'story' ? 'e.g. "How the tortoise got its shell"' : 'e.g. "Elder\'s knowledge of farming seasons"'}
                  />
                </div>
              )}

              {/* Artifact description */}
              {activeType === 'artifact' && (
                <div className="space-y-2">
                  <Label>Artifact name & description</Label>
                  <Textarea
                    value={form.textContent}
                    onChange={e => setForm(f => ({ ...f, textContent: e.target.value }))}
                    placeholder="Describe what this object is, its use, and its cultural significance..."
                    rows={3}
                  />
                </div>
              )}

              {/* Place description */}
              {activeType === 'place' && (
                <div className="space-y-2">
                  <Label>Place name & description</Label>
                  <Textarea
                    value={form.locationDescription}
                    onChange={e => setForm(f => ({ ...f, locationDescription: e.target.value }))}
                    placeholder="Describe this heritage site, its history, and significance..."
                    rows={3}
                  />
                </div>
              )}

              {/* Audio recorder */}
              {(isAudioType || isVideoType) && (
                <div className="space-y-4">
                  <Label className="text-base font-semibold">
                    {isVideoType ? '🎥 Video Recording' : '🎙️ Audio Recording'}
                  </Label>

                  {!audio.audioBlob ? (
                    <div className="flex flex-col items-center gap-4 py-8 border-2 border-dashed border-primary/20 rounded-2xl bg-primary/5">
                      {audio.isRecording ? (
                        <>
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-2xl font-mono font-bold text-red-500 dark:text-red-300">
                              {formatDuration(audio.duration)}
                            </span>
                            <span className="text-sm text-muted-foreground">Recording…</span>
                          </div>
                          <Button onClick={audio.stop} size="lg" variant="destructive" className="gap-2 rounded-full px-8">
                            <Square className="w-5 h-5" /> Stop Recording
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                            {isVideoType ? <Video className="w-10 h-10 text-primary" /> : <Mic className="w-10 h-10 text-primary" />}
                          </div>
                          <Button
                            onClick={() => audio.start(isVideoType)}
                            size="lg"
                            className="gap-2 rounded-full px-8 bg-red-500 hover:bg-red-600 text-white"
                          >
                            <div className="w-3 h-3 rounded-full bg-white animate-pulse dark:bg-card" />
                            {isVideoType ? 'Start Recording' : 'Start Recording'}
                          </Button>
                          <p className="text-sm text-muted-foreground">Click to begin — speak clearly and naturally</p>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3 p-4 border rounded-xl bg-muted/30">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-300" />
                        <span className="font-medium text-green-700 dark:text-green-300">Recording ready ({formatDuration(audio.duration)})</span>
                      </div>
                      {audio.audioUrl && (
                        <audio controls src={audio.audioUrl} className="w-full h-10" />
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={audio.reset}
                        className="gap-2"
                      >
                        <Mic className="w-4 h-4" /> Re-record
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Photo capture */}
              {isPhotoType && (
                <div className="space-y-4">
                  <Label className="text-base font-semibold">📷 Photo</Label>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    capture={activeType === 'place' ? 'environment' : undefined}
                    onChange={handlePhotoChange}
                    className="hidden"
                  />
                  {photoPreview ? (
                    <div className="space-y-3">
                      <img src={photoPreview} alt="Preview" className="w-full max-h-64 object-cover rounded-xl border" />
                      <Button variant="outline" size="sm" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}>
                        <Camera className="w-4 h-4 mr-2" /> Retake
                      </Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      className="w-full py-12 border-2 border-dashed border-primary/20 rounded-2xl bg-primary/5 flex flex-col items-center gap-3 hover:bg-primary/10 transition-colors"
                    >
                      <Camera className="w-10 h-10 text-primary" />
                      <span className="font-medium text-primary">Tap to capture or upload</span>
                      <span className="text-sm text-muted-foreground">Photo · JPG · PNG · HEIC</span>
                    </button>
                  )}

                  {/* GPS for places */}
                  {activeType === 'place' && (
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        onClick={captureLocation}
                        className="gap-2"
                      >
                        <MapPin className="w-4 h-4" />
                        {location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'Capture GPS Location'}
                      </Button>
                      {location && <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-300" />}
                    </div>
                  )}
                </div>
              )}

              {/* Speaker info */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div className="space-y-2">
                  <Label>Your name <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    value={form.speakerName}
                    onChange={e => setForm(f => ({ ...f, speakerName: e.target.value }))}
                    placeholder="Or stay anonymous"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Age group</Label>
                  <Select value={form.speakerAgeGroup} onValueChange={v => setForm(f => ({ ...f, speakerAgeGroup: v }))}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="youth">Youth (under 30)</SelectItem>
                      <SelectItem value="adult">Adult (30–60)</SelectItem>
                      <SelectItem value="elder">Elder (60+)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Consent */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/40 border">
                <Checkbox
                  id="consent"
                  checked={form.consentGiven}
                  onCheckedChange={v => setForm(f => ({ ...f, consentGiven: !!v }))}
                  className="mt-0.5"
                />
                <label htmlFor="consent" className="text-sm leading-relaxed text-foreground cursor-pointer">
                  I consent to this recording being used in the GenHaL language dataset for AI training,
                  preservation, and community research. I confirm I have rights to share this content.
                </label>
              </div>

              {/* Upload progress */}
              {submitting && uploadProgress > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Uploading…</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}

              {/* Success message */}
              {submitted && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200 text-green-800 dark:bg-green-500/10 dark:border-green-500/30 dark:text-green-300">
                  <CheckCircle2 className="w-5 h-5" />
                  <div>
                    <div className="font-semibold">Contribution saved!</div>
                    <div className="text-sm">Ready to record another? Fill in the fields above.</div>
                  </div>
                </div>
              )}

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                size="lg"
                className="w-full gap-2 rounded-xl h-14 text-base"
              >
                {submitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Saving…</>
                ) : (
                  <><Upload className="w-5 h-5" /> Submit to Dataset</>
                )}
              </Button>

            </CardContent>
          </Card>

          {/* Auto-tagging info */}
          <Card className="border-accent/20 bg-accent/5">
            <CardContent className="p-5">
              <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                Auto-tagged metadata
              </h4>
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                {['Language', 'Speaker', 'Community', 'Location', 'Date', 'Consent', 'Type', 'Quality'].map(tag => (
                  <span key={tag} className="text-xs px-2.5 py-1.5 rounded-lg bg-white border border-accent/20 font-medium text-accent text-center dark:bg-card">
                    {tag}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
