import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video/hooks';
import { SCENE_DURATIONS } from './constants';

import Scene1 from './video_scenes/Scene1';
import Scene2 from './video_scenes/Scene2';
import Scene3 from './video_scenes/Scene3';
import Scene4 from './video_scenes/Scene4';
import Scene5 from './video_scenes/Scene5';
import Scene6 from './video_scenes/Scene6';
import Scene7 from './video_scenes/Scene7';
import Scene8 from './video_scenes/Scene8';

export { SCENE_DURATIONS };

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  scene1: Scene1,
  scene2: Scene2,
  scene3: Scene3,
  scene4: Scene4,
  scene5: Scene5,
  scene6: Scene6,
  scene7: Scene7,
  scene8: Scene8,
};

const SCENE_START_SEC: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let ms = 0;
  for (const [key, dur] of Object.entries(SCENE_DURATIONS)) {
    out[key] = ms / 1000;
    ms += dur;
  }
  return out;
})();

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
  const { currentSceneKey } = useVideoPlayer({ durations, loop });

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS;
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.4;
    const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
      audio.currentTime = targetTime;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted]);

  return (
    <>
      <div className="relative w-full h-screen overflow-hidden" style={{ backgroundColor: '#0A192F' }}>
        {/* Animated background gradient */}
        <motion.div
          className="absolute inset-0 z-0 pointer-events-none"
          animate={{
            background: sceneIndex % 2 === 0
              ? 'radial-gradient(circle at 70% 30%, rgba(0, 128, 128, 0.15) 0%, rgba(10, 25, 47, 1) 60%)'
              : 'radial-gradient(circle at 30% 70%, rgba(0, 128, 128, 0.15) 0%, rgba(10, 25, 47, 1) 60%)',
          }}
          transition={{ duration: 4, ease: 'easeInOut' }}
        />

        {/* Mesh grid */}
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            opacity: 0.03,
          }}
        />

        {/* Noise overlay */}
        <div
          className="absolute inset-0 z-[50] pointer-events-none"
          style={{
            opacity: 0.02,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Gold progress line at top */}
        <motion.div
          className="absolute top-0 left-0 h-1 z-50"
          style={{ backgroundColor: '#FFC107' }}
          animate={{ width: `${((sceneIndex + 1) / 8) * 100}%` }}
          transition={{ duration: 1.2, ease: 'circOut' }}
        />

        <AnimatePresence mode="popLayout">
          {SceneComponent && <SceneComponent key={currentSceneKey} />}
        </AnimatePresence>
      </div>

      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </>
  );
}
