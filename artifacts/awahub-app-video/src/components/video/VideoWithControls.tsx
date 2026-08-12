import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Repeat, Volume2, VolumeX, Download, Chrome } from 'lucide-react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';
import { useTabRecorder } from './useTabRecorder';

const PROGRESS_TICK_MS = 60;
const TOTAL_DURATION_MS = Object.values(SCENE_DURATIONS).reduce((s, d) => s + d, 0);
const TOTAL_SECS = Math.ceil(TOTAL_DURATION_MS / 1000);

interface ControlBarProps {
  visible: boolean;
  collapsed: boolean;
  locked: boolean;
  muted: boolean;
  sceneKeys: string[];
  activeIndex: number;
  activeDuration: number;
  tick: number;
  onToggleLock: () => void;
  onToggleMute: () => void;
  onJumpTo: (index: number) => void;
  onToggleCollapsed: () => void;
}

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

function ControlBar({
  visible,
  collapsed,
  locked,
  muted,
  sceneKeys,
  activeIndex,
  activeDuration,
  tick,
  onToggleLock,
  onToggleMute,
  onJumpTo,
  onToggleCollapsed,
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

      {/* Mute toggle */}
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

// ─── DownloadPanel ────────────────────────────────────────────────────────────
function DownloadPanel({ isSupported, onStart, onClose }: { isSupported: boolean; onStart: () => void; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0f0e1c] border border-white/10 rounded-2xl p-8 max-w-sm mx-4 shadow-2xl">
        <div className="text-3xl mb-4 text-center">{isSupported ? '🎬' : '⚠️'}</div>
        {isSupported ? (
          <>
            <h2 className="text-white text-lg font-bold mb-4 text-center">Download this video</h2>
            <ol className="space-y-3 mb-6">
              <li className="flex gap-3 text-sm text-white/80"><span className="w-6 h-6 rounded-full bg-amber-500 text-black font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">1</span><span>Click <strong className="text-white">Start Recording</strong> below</span></li>
              <li className="flex gap-3 text-sm text-white/80"><span className="w-6 h-6 rounded-full bg-amber-500 text-black font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">2</span><span>Browser asks what to share — choose <strong className="text-white">Chrome Tab</strong> → pick this tab → click <strong className="text-amber-400">Share</strong></span></li>
              <li className="flex gap-3 text-sm text-white/80"><span className="w-6 h-6 rounded-full bg-amber-500 text-black font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">3</span><span>Video plays from the start and <strong className="text-white">downloads automatically</strong> when done (~{TOTAL_SECS}s)</span></li>
            </ol>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/50 hover:text-white text-sm transition-colors">Cancel</button>
              <button onClick={onStart} className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-colors">Start Recording →</button>
            </div>
            <p className="text-white/30 text-xs text-center mt-4 flex items-center justify-center gap-1"><Chrome className="w-3 h-3" /> Works best in Chrome or Edge</p>
          </>
        ) : (
          <>
            <h2 className="text-white text-lg font-bold mb-2 text-center">Use Chrome or Edge</h2>
            <p className="text-white/60 text-sm text-center mb-6 leading-relaxed">Your browser doesn't support tab recording. Open this page in <strong className="text-white">Chrome</strong> or <strong className="text-white">Edge</strong> to download.</p>
            <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-white/15 text-white/60 hover:text-white text-sm transition-colors">Close</button>
          </>
        )}
      </div>
    </div>
  );
}

export default function VideoWithControls() {
  const isIframed = typeof window !== 'undefined' && window.self !== window.top;

  const {
    sceneKeys,
    activeIndex,
    locked,
    mountKey,
    tick,
    durations,
    activeDuration,
    onSceneChange,
    jumpTo,
    toggleLock,
  } = useSceneControls(SCENE_DURATIONS);

  const [muted, setMuted] = useState(true);
  const [collapsed, setCollapsed] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [tapPinned, setTapPinned] = useState(false);
  const sensorRef = useRef<HTMLDivElement | null>(null);

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
    setCollapsed(c => {
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

  const { status: recStatus, isSupported, startCapture, stopCapture, reset: resetRec } = useTabRecorder();
  const isRecording = recStatus === 'recording';
  const [showPanel, setShowPanel] = useState(false);
  const recTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleStartRecording = useCallback(async () => {
    setShowPanel(false);
    jumpTo(0);
    setMuted(false);
    const ok = await startCapture();
    if (!ok) resetRec();
  }, [startCapture, resetRec, jumpTo]);

  useEffect(() => {
    if (!isRecording) return;
    recTimerRef.current = setTimeout(() => stopCapture(), TOTAL_DURATION_MS + 800);
    return () => { if (recTimerRef.current) clearTimeout(recTimerRef.current); };
  }, [isRecording, stopCapture]);

  if (isIframed) {
    return (
      <div className="relative w-full h-screen">
        <VideoTemplate />
        <a
          href={window.location.href}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-6 right-6 z-50 flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold px-5 py-2.5 rounded-xl shadow-lg transition-colors"
        >
          <Download className="w-4 h-4" />
          Open to Download
        </a>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <VideoTemplate
        key={mountKey}
        durations={durations}
        loop
        muted={muted}
        onSceneChange={onSceneChange}
      />

      {/* Top bar — hidden during recording */}
      {!isRecording && (
        <div className="absolute top-0 left-0 right-0 z-40 flex items-center justify-end px-5 py-4 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
          <button onClick={() => setShowPanel(true)} className="pointer-events-auto flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black text-xs font-bold px-4 py-1.5 rounded-lg transition-colors shadow-lg">
            <Download className="w-3.5 h-3.5" />
            Download Video
          </button>
        </div>
      )}

      {/* Control bar — hidden during recording */}
      {!isRecording && (
        <div ref={sensorRef} className="absolute bottom-0 left-0 right-0 z-50 flex flex-col justify-end" style={{ height: '25%' }} onPointerEnter={handlePointerEnter} onPointerLeave={handlePointerLeave} onPointerDown={handlePointerDown}>
          <div className="flex-1 w-full" aria-hidden="true" />
          <ControlBar visible={barVisible} collapsed={collapsed} locked={locked} muted={muted} sceneKeys={sceneKeys} activeIndex={activeIndex} activeDuration={activeDuration} tick={tick} onToggleLock={toggleLock} onToggleMute={() => setMuted(m => !m)} onJumpTo={jumpTo} onToggleCollapsed={handleToggleCollapsed} />
        </div>
      )}

      {recStatus === 'done' && (
        <div className="absolute top-4 right-5 z-50 flex items-center gap-2 bg-green-600/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg">
          <span className="text-white text-sm font-semibold">✓ Download started!</span>
          <button onClick={resetRec} className="text-white/70 hover:text-white text-xs ml-1">✕</button>
        </div>
      )}
      {recStatus === 'error' && (
        <div className="absolute top-4 right-5 z-50 flex items-center gap-2 bg-red-700/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg">
          <span className="text-white text-sm font-semibold">Recording failed — try again in Chrome</span>
          <button onClick={resetRec} className="text-white/70 hover:text-white text-xs ml-1">✕</button>
        </div>
      )}
      {showPanel && <DownloadPanel isSupported={isSupported} onStart={handleStartRecording} onClose={() => setShowPanel(false)} />}
    </div>
  );
}
