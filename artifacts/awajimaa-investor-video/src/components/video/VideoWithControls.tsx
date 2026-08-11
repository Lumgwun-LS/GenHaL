import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Download, Repeat, Square, Volume2, VolumeX } from 'lucide-react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from '@/hooks/useSceneControls';
import { useTabRecorder } from '@/hooks/useTabRecorder';

const PROGRESS_TICK_MS = 60;

// Total video duration (ms) — used to auto-stop recording after one full pass
const TOTAL_DURATION_MS = Object.values(SCENE_DURATIONS).reduce((s, d) => s + d, 0);

// ─── ProgressSegments ────────────────────────────────────────────────────────

function ProgressSegments({
  sceneKeys,
  activeIndex,
  activeDuration,
  tick,
  onJumpTo,
}: {
  sceneKeys: string[];
  activeIndex: number;
  activeDuration: number;
  tick: number;
  onJumpTo: (index: number) => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const start = performance.now();
    const id = window.setInterval(() => {
      setElapsed(performance.now() - start);
    }, PROGRESS_TICK_MS);
    return () => window.clearInterval(id);
  }, [tick]);

  const progress = activeDuration > 0 ? Math.min(1, elapsed / activeDuration) : 0;

  return (
    <div className="flex-1 flex items-center gap-1.5">
      {sceneKeys.map((key, i) => {
        const isActive = i === activeIndex;
        const fill = isActive ? progress * 100 : 0;
        return (
          <button
            key={key}
            onClick={() => onJumpTo(i)}
            className="flex-1 h-3 bg-white/20 rounded-full overflow-hidden cursor-pointer hover:h-4 hover:bg-white/25 transition-all relative min-h-[12px]"
            aria-label={`Jump to scene ${i + 1}`}
            aria-current={isActive ? 'true' : undefined}
          >
            <div
              className="absolute inset-y-0 left-0 bg-white/90 rounded-full transition-[width] duration-100"
              style={{ width: `${fill}%` }}
            />
          </button>
        );
      })}
    </div>
  );
}

// ─── RecordingBadge ───────────────────────────────────────────────────────────

function RecordingBadge({ elapsedMs, onStop }: { elapsedMs: number; onStop: () => void }) {
  const mm = String(Math.floor(elapsedMs / 60000)).padStart(2, '0');
  const ss = String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, '0');

  return (
    <div className="flex items-center gap-2 bg-red-600/90 backdrop-blur-sm rounded-full px-4 py-2">
      <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse shrink-0" />
      <span className="text-white font-mono tabular-nums text-sm font-semibold">
        {mm}:{ss}
      </span>
      <span className="text-white/80 text-sm hidden sm:inline">Recording…</span>
      <button
        onClick={onStop}
        className="ml-1 flex items-center gap-1 bg-white/20 hover:bg-white/35 rounded-full px-2.5 py-0.5 text-white text-xs font-semibold transition-colors"
        title="Stop recording and download"
      >
        <Square className="w-3 h-3 fill-white" />
        Stop
      </button>
    </div>
  );
}

// ─── SetupOverlay ─────────────────────────────────────────────────────────────

function SetupOverlay({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0f0e1c] border border-white/10 rounded-2xl p-8 max-w-md mx-4 text-center shadow-2xl">
        <div className="text-4xl mb-4">🎬</div>
        <h2 className="text-white text-xl font-bold mb-2">Download this Video</h2>
        <p className="text-white/70 text-sm leading-relaxed mb-4">
          Your browser will ask you to{' '}
          <span className="text-white font-semibold">share a tab or screen</span>.
          Select <span className="text-white font-semibold">this tab</span> and click{' '}
          <span className="text-amber-400 font-semibold">Share</span>.
        </p>
        <p className="text-white/50 text-xs mb-6">
          The video will play from the beginning and download automatically when it finishes
          ({Math.ceil(TOTAL_DURATION_MS / 1000)}s). You can also stop early and still get the file.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl border border-white/15 text-white/60 hover:text-white hover:border-white/30 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-colors"
          >
            Start Recording →
          </button>
        </div>
        <p className="text-white/30 text-xs mt-4">Works best in Chrome · Audio included</p>
      </div>
    </div>
  );
}

// ─── ControlBar ──────────────────────────────────────────────────────────────

interface ControlBarProps {
  visible: boolean;
  collapsed: boolean;
  locked: boolean;
  muted: boolean;
  sceneKeys: string[];
  activeIndex: number;
  activeDuration: number;
  tick: number;
  isRecording: boolean;
  onToggleLock: () => void;
  onToggleMute: () => void;
  onJumpTo: (index: number) => void;
  onToggleCollapsed: () => void;
  onDownloadClick: () => void;
}

function ControlBar({
  visible, collapsed, locked, muted, sceneKeys, activeIndex, activeDuration, tick,
  isRecording, onToggleLock, onToggleMute, onJumpTo, onToggleCollapsed, onDownloadClick,
}: ControlBarProps) {
  return (
    <div
      className={`flex items-center gap-3 bg-black/50 backdrop-blur-sm px-5 py-4 transition-all duration-200 ease-out ${
        visible
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : 'translate-y-full opacity-0 pointer-events-none'
      }`}
      aria-hidden={!visible}
    >
      {/* Scene lock */}
      <button
        onClick={onToggleLock}
        className={`w-14 h-14 flex items-center justify-center transition-colors rounded-lg shrink-0 ${
          locked
            ? 'text-white bg-white/15 hover:bg-white/25'
            : 'text-white/60 hover:text-white hover:bg-white/10'
        }`}
        title={locked ? 'Loop current scene: on' : 'Loop current scene: off'}
        aria-label={locked ? 'Loop current scene: on' : 'Loop current scene: off'}
        aria-pressed={locked}
      >
        <Repeat className="w-8 h-8" />
      </button>

      {/* Audio mute */}
      <button
        onClick={onToggleMute}
        className={`w-14 h-14 flex items-center justify-center transition-colors rounded-lg shrink-0 ${
          muted
            ? 'text-white/60 hover:text-white hover:bg-white/10'
            : 'text-white bg-white/15 hover:bg-white/25'
        }`}
        title={muted ? 'Unmute audio' : 'Mute audio'}
        aria-label={muted ? 'Unmute audio' : 'Mute audio'}
        aria-pressed={!muted}
      >
        {muted ? <VolumeX className="w-8 h-8" /> : <Volume2 className="w-8 h-8" />}
      </button>

      {/* Download */}
      <button
        onClick={onDownloadClick}
        disabled={isRecording}
        className={`w-14 h-14 flex items-center justify-center transition-colors rounded-lg shrink-0 ${
          isRecording
            ? 'text-white/30 cursor-not-allowed'
            : 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/10'
        }`}
        title="Download video"
        aria-label="Download video"
      >
        <Download className="w-8 h-8" />
      </button>

      <div className="w-px self-stretch bg-white/15" aria-hidden="true" />

      <ProgressSegments
        sceneKeys={sceneKeys}
        activeIndex={activeIndex}
        activeDuration={activeDuration}
        tick={tick}
        onJumpTo={onJumpTo}
      />

      <div className="text-xl text-white/60 font-mono tabular-nums shrink-0">
        {activeIndex + 1}/{sceneKeys.length}
      </div>

      <button
        onClick={onToggleCollapsed}
        className="w-14 h-14 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors rounded-lg shrink-0"
        title={collapsed ? 'Show controls' : 'Hide controls'}
        aria-label={collapsed ? 'Show controls' : 'Hide controls'}
        aria-expanded={!collapsed}
      >
        {collapsed ? <ChevronUp className="w-10 h-10" /> : <ChevronDown className="w-10 h-10" />}
      </button>
    </div>
  );
}

// ─── VideoWithControls ────────────────────────────────────────────────────────

export default function VideoWithControls() {
  const isIframed = typeof window !== 'undefined' && window.self !== window.top;

  const {
    sceneKeys, activeIndex, locked, mountKey, tick,
    durations, activeDuration, onSceneChange, jumpTo, toggleLock,
  } = useSceneControls(SCENE_DURATIONS);

  const [muted, setMuted] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [tapPinned, setTapPinned] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const sensorRef = useRef<HTMLDivElement | null>(null);

  // Recording state
  const { status: recStatus, startCapture, stopCapture, reset: resetRec } = useTabRecorder();
  const isRecording = recStatus === 'recording';
  const [recElapsedMs, setRecElapsedMs] = useState(0);
  const recStartRef   = useRef<number>(0);
  const recTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (recTimerRef.current)  { clearInterval(recTimerRef.current);  recTimerRef.current  = null; }
    if (autoStopRef.current)  { clearTimeout(autoStopRef.current);   autoStopRef.current  = null; }
  }, []);

  // When recording starts: reset video to scene 1, unmute audio, start timers
  useEffect(() => {
    if (isRecording) {
      jumpTo(0);
      setMuted(false);
      setRecElapsedMs(0);
      recStartRef.current = performance.now();

      recTimerRef.current = setInterval(() => {
        setRecElapsedMs(performance.now() - recStartRef.current);
      }, 500);

      // Auto-stop after the full video duration + 800ms buffer
      autoStopRef.current = setTimeout(() => {
        stopCapture();
      }, TOTAL_DURATION_MS + 800);
    } else {
      clearTimers();
    }
    return clearTimers;
  }, [isRecording, jumpTo, stopCapture, clearTimers]);

  const handleDownloadClick = useCallback(() => {
    setShowSetup(true);
  }, []);

  const handleSetupConfirm = useCallback(async () => {
    setShowSetup(false);
    const ok = await startCapture();
    if (!ok) resetRec();
  }, [startCapture, resetRec]);

  const handleSetupCancel = useCallback(() => {
    setShowSetup(false);
  }, []);

  const handleManualStop = useCallback(() => {
    clearTimers();
    stopCapture();
  }, [clearTimers, stopCapture]);

  const handlePointerEnter = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') setHovering(true);
  }, []);
  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') setHovering(false);
  }, []);
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    if (collapsed) setTapPinned(true);
  }, [collapsed]);
  const handleToggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      if (!c) { setHovering(false); setTapPinned(false); }
      return !c;
    });
  }, []);

  useEffect(() => {
    if (!(collapsed && tapPinned)) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const sensor = sensorRef.current;
      if (sensor && !sensor.contains(e.target as Node)) setTapPinned(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [collapsed, tapPinned]);

  const barVisible = !collapsed || hovering || tapPinned;

  // Export path: no props, clean recording
  if (!isIframed) return <VideoTemplate />;

  return (
    <div className="relative w-full h-screen">
      <VideoTemplate
        key={mountKey}
        durations={durations}
        loop
        muted={muted}
        onSceneChange={onSceneChange}
      />

      {/* Setup overlay */}
      {showSetup && (
        <SetupOverlay onConfirm={handleSetupConfirm} onCancel={handleSetupCancel} />
      )}

      {/* Recording badge — top-right corner */}
      {isRecording && (
        <div className="absolute top-4 right-4 z-50">
          <RecordingBadge elapsedMs={recElapsedMs} onStop={handleManualStop} />
        </div>
      )}

      {/* Done toast */}
      {recStatus === 'done' && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-green-600/90 backdrop-blur-sm rounded-full px-4 py-2">
          <span className="text-white text-sm font-semibold">✓ Download started!</span>
          <button
            onClick={resetRec}
            className="text-white/70 hover:text-white text-xs ml-1"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error toast */}
      {recStatus === 'error' && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-red-700/90 backdrop-blur-sm rounded-full px-4 py-2">
          <span className="text-white text-sm font-semibold">Recording failed</span>
          <button
            onClick={resetRec}
            className="text-white/70 hover:text-white text-xs ml-1"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <div
        ref={sensorRef}
        className="absolute bottom-0 left-0 right-0 z-50 flex flex-col justify-end"
        style={{ height: '25%' }}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
      >
        <div className="flex-1 w-full" aria-hidden="true" />
        <ControlBar
          visible={barVisible}
          collapsed={collapsed}
          locked={locked}
          muted={muted}
          sceneKeys={sceneKeys}
          activeIndex={activeIndex}
          activeDuration={activeDuration}
          tick={tick}
          isRecording={isRecording}
          onToggleLock={toggleLock}
          onToggleMute={() => setMuted((m) => !m)}
          onJumpTo={jumpTo}
          onToggleCollapsed={handleToggleCollapsed}
          onDownloadClick={handleDownloadClick}
        />
      </div>
    </div>
  );
}
