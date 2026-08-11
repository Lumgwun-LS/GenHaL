import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video/hooks';
import Scene1 from './video_scenes/Scene1';
import Scene2 from './video_scenes/Scene2';
import Scene3 from './video_scenes/Scene3';
import Scene4 from './video_scenes/Scene4';
import Scene5 from './video_scenes/Scene5';

export const SCENE_DURATIONS: Record<string, number> = {
  open:        15000,
  features:    20000,
  discovery:   20000,
  world_class: 20000,
  close:       15000,
};

// Cumulative scene start offsets (seconds) for audio seeking
const SCENE_START_SEC: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let ms = 0;
  for (const [key, dur] of Object.entries(SCENE_DURATIONS)) {
    out[key] = ms / 1000;
    ms += dur;
  }
  return out;
})();

const SCENE_COMPONENTS: Record<string, React.ComponentType<{ currentScene: number }>> = {
  open:        Scene1,
  features:    Scene2,
  discovery:   Scene3,
  world_class: Scene4,
  close:       Scene5,
};

const SCENE_INDEX: Record<string, number> = Object.fromEntries(
  Object.keys(SCENE_DURATIONS).map((k, i) => [k, i])
);

const AUDIO_SEEK_EPSILON_SEC = 0.18;

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentScene, currentSceneKey } = useVideoPlayer({ durations, loop });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Notify parent of scene changes
  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  // Sync audio playhead to scene start
  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.55;
    const target = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - target) > AUDIO_SEEK_EPSILON_SEC) {
      audio.currentTime = target;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted]);

  const sceneIndex = SCENE_INDEX[baseSceneKey] ?? currentScene;
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  return (
    <>
      <div className="w-full h-screen bg-black overflow-hidden relative flex items-center justify-center font-sans">
        {/* Cinematic particles background — persists across all scenes */}
        <motion.div
          className="absolute inset-0 z-0 mix-blend-screen"
          animate={{
            scale: sceneIndex === 0 ? 1.05 : sceneIndex === 4 ? 1.2 : 1.1,
            opacity: sceneIndex === 1 ? 0.2 : sceneIndex === 3 ? 0.5 : 0.3,
          }}
          transition={{ duration: 15, ease: 'linear' }}
        >
          <video
            src={`https://pub-07bed37fd4bf4c02b66107ecb2a7686d.r2.dev/video-artifacts/particles.mp4`}
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover"
          />
        </motion.div>

        {/* Shifting radial gradient */}
        <motion.div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(212,43,43,0.2) 0%, rgba(0,0,0,0.85) 70%)',
          }}
          animate={{ opacity: sceneIndex === 3 ? 0.8 : 0.5 }}
          transition={{ duration: 10 }}
        />

        {/* Main content area */}
        <div className="relative w-full max-w-[1920px] aspect-video z-10 flex flex-col items-center justify-center overflow-hidden">
          <AnimatePresence mode="popLayout">
            {SceneComponent && (
              <SceneComponent key={currentSceneKey} currentScene={sceneIndex} />
            )}
          </AnimatePresence>
        </div>

        {/* Progress bar accent — fills over full video duration */}
        <motion.div
          className="absolute top-0 left-0 h-[3px] bg-gradient-to-r from-[#D42B2B] via-[#F5C518] to-[#D42B2B] z-50 origin-left"
          animate={{
            scaleX: [0, 0.2, 0.4, 0.6, 0.8, 1][sceneIndex] ?? 1,
          }}
          transition={{ duration: 15, ease: 'linear' }}
          style={{ width: '100%' }}
        />
      </div>

      {/* Background audio — Awajimaa Song */}
      <audio
        ref={audioRef}
        src={`https://pub-07bed37fd4bf4c02b66107ecb2a7686d.r2.dev/video-artifacts/bg_music.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </>
  );
}
