import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Square, Volume2, VolumeX, ExternalLink, Chrome } from 'lucide-react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from '@/hooks/useSceneControls';
import { useTabRecorder } from '@/hooks/useTabRecorder';

const TOTAL_DURATION_MS = Object.values(SCENE_DURATIONS).reduce((s, d) => s + d, 0);
const TOTAL_SECS = Math.ceil(TOTAL_DURATION_MS / 1000);

// ─── RecordingBadge ──────────────────────────────────────────────────────────

function RecordingBadge({ elapsedMs, onStop }: { elapsedMs: number; onStop: () => void }) {
  const mm = String(Math.floor(elapsedMs / 60000)).padStart(2, '0');
  const ss = String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, '0');
  return (
    <div className="flex items-center gap-2 bg-red-600/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg">
      <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse shrink-0" />
      <span className="text-white font-mono tabular-nums text-sm font-semibold">{mm}:{ss}</span>
      <span className="text-white/80 text-sm hidden sm:inline">Recording…</span>
      <button
        onClick={onStop}
        className="ml-1 flex items-center gap-1 bg-white/20 hover:bg-white/35 rounded-full px-2.5 py-0.5 text-white text-xs font-semibold transition-colors"
      >
        <Square className="w-3 h-3 fill-white" />
        Stop &amp; Save
      </button>
    </div>
  );
}

// ─── DownloadPanel ────────────────────────────────────────────────────────────

function DownloadPanel({
  isSupported,
  onStart,
  onClose,
}: {
  isSupported: boolean;
  onStart: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0f0e1c] border border-white/10 rounded-2xl p-8 max-w-sm mx-4 shadow-2xl">
        <div className="text-3xl mb-4 text-center">
          {isSupported ? '🎬' : '⚠️'}
        </div>

        {isSupported ? (
          <>
            <h2 className="text-white text-lg font-bold mb-4 text-center">Download this video</h2>
            <ol className="space-y-3 mb-6">
              <li className="flex gap-3 text-sm text-white/80">
                <span className="w-6 h-6 rounded-full bg-amber-500 text-black font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
                <span>Click <strong className="text-white">Start Recording</strong> below</span>
              </li>
              <li className="flex gap-3 text-sm text-white/80">
                <span className="w-6 h-6 rounded-full bg-amber-500 text-black font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
                <span>Your browser asks what to share — choose <strong className="text-white">Chrome Tab</strong> → pick this tab → click <strong className="text-amber-400">Share</strong></span>
              </li>
              <li className="flex gap-3 text-sm text-white/80">
                <span className="w-6 h-6 rounded-full bg-amber-500 text-black font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">3</span>
                <span>The video plays from the start and <strong className="text-white">downloads automatically</strong> when done (~{TOTAL_SECS}s)</span>
              </li>
            </ol>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/50 hover:text-white hover:border-white/30 text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onStart}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-colors"
              >
                Start Recording →
              </button>
            </div>
            <p className="text-white/30 text-xs text-center mt-4 flex items-center justify-center gap-1">
              <Chrome className="w-3 h-3" /> Works best in Chrome or Edge
            </p>
          </>
        ) : (
          <>
            <h2 className="text-white text-lg font-bold mb-2 text-center">Use Chrome or Edge</h2>
            <p className="text-white/60 text-sm text-center mb-6 leading-relaxed">
              Your browser doesn't support tab recording. Open this page in <strong className="text-white">Chrome</strong> or <strong className="text-white">Edge</strong> to download the video.
            </p>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl border border-white/15 text-white/60 hover:text-white text-sm transition-colors"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── VideoWithControls ────────────────────────────────────────────────────────

export default function VideoWithControls() {
  const isIframed = typeof window !== 'undefined' && window.self !== window.top;

  const { jumpTo } = useSceneControls(SCENE_DURATIONS);
  const [muted, setMuted] = useState(true);
  const [showPanel, setShowPanel] = useState(false);

  const { status: recStatus, isSupported, startCapture, stopCapture, reset: resetRec } = useTabRecorder();
  const isRecording = recStatus === 'recording';

  const [recElapsedMs, setRecElapsedMs] = useState(0);
  const recStartRef  = useRef<number>(0);
  const recTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null; }
  }, []);

  // When recording starts: reset to scene 1, unmute, start timers
  useEffect(() => {
    if (isRecording) {
      jumpTo(0);
      setMuted(false);
      setRecElapsedMs(0);
      recStartRef.current = performance.now();
      recTimerRef.current = setInterval(() => {
        setRecElapsedMs(performance.now() - recStartRef.current);
      }, 500);
      autoStopRef.current = setTimeout(() => stopCapture(), TOTAL_DURATION_MS + 800);
    } else {
      clearTimers();
    }
    return clearTimers;
  }, [isRecording, jumpTo, stopCapture, clearTimers]);

  const handleStartRecording = useCallback(async () => {
    setShowPanel(false);
    const ok = await startCapture();
    if (!ok) resetRec();
  }, [startCapture, resetRec]);

  const handleManualStop = useCallback(() => {
    clearTimers();
    stopCapture();
  }, [clearTimers, stopCapture]);

  // ── Iframe mode: just play the video + button to open in a real tab ──────────
  if (isIframed) {
    return (
      <div className="relative w-full h-screen">
        <VideoTemplate />
        <a
          href={window.location.href}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-6 right-6 z-50 flex items-center gap-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black text-sm font-bold px-5 py-3 rounded-xl shadow-lg transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Open to Download
        </a>
      </div>
    );
  }

  // ── Full tab mode: video + always-visible controls ────────────────────────────
  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <VideoTemplate muted={muted} />

      {/* ── Always-visible top bar — hidden during recording so it isn't captured ── */}
      {!isRecording && (
        <div className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-5 py-4 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
          <span className="text-white/50 text-xs font-medium">
            Awajimaa — Africa's Digital Infrastructure
          </span>
          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Mute toggle */}
            <button
              onClick={() => setMuted((m) => !m)}
              className="flex items-center gap-1.5 bg-black/40 hover:bg-black/60 border border-white/10 text-white/70 hover:text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              {muted ? 'Unmuted' : 'Muted'}
            </button>

            {/* Download button — always visible */}
            <button
              onClick={() => setShowPanel(true)}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black text-xs font-bold px-4 py-1.5 rounded-lg transition-colors shadow-lg"
            >
              <Download className="w-3.5 h-3.5" />
              Download Video
            </button>
          </div>
        </div>
      )}

      {/* ── Done toast ── */}
      {recStatus === 'done' && (
        <div className="absolute top-4 right-5 z-50 flex items-center gap-2 bg-green-600/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg">
          <span className="text-white text-sm font-semibold">✓ Download started!</span>
          <button onClick={resetRec} className="text-white/70 hover:text-white text-xs ml-1">✕</button>
        </div>
      )}

      {/* ── Error toast ── */}
      {recStatus === 'error' && (
        <div className="absolute top-4 right-5 z-50 flex items-center gap-2 bg-red-700/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg">
          <span className="text-white text-sm font-semibold">Recording failed — try again in Chrome</span>
          <button onClick={resetRec} className="text-white/70 hover:text-white text-xs ml-1">✕</button>
        </div>
      )}

      {/* ── Download panel overlay ── */}
      {showPanel && (
        <DownloadPanel
          isSupported={isSupported}
          onStart={handleStartRecording}
          onClose={() => setShowPanel(false)}
        />
      )}
    </div>
  );
}
