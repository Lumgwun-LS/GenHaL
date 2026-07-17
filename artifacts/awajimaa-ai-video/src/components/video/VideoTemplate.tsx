import { useEffect, useRef } from 'react';
import { useVideoPlayer } from '@/lib/video';
import { AnimatePresence, motion } from 'framer-motion';

import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';
import { Scene7 } from './video_scenes/Scene7';
import { Scene8 } from './video_scenes/Scene8';
import { Scene9 } from './video_scenes/Scene9';

export const SCENE_DURATIONS = {
  scene1: 5000,
  scene2: 5000,
  scene3: 4000,
  scene4: 4000,
  scene5: 4000,
  scene6: 5000,
  scene7: 5000,
  scene8: 4000,
  scene9: 6000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  scene1: Scene1,
  scene2: Scene2,
  scene3: Scene3,
  scene4: Scene4,
  scene5: Scene5,
  scene6: Scene6,
  scene7: Scene7,
  scene8: Scene8,
  scene9: Scene9,
};

// Cumulative start time in seconds for each scene key
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

// Persistent overlay colours keyed to scene index
const SCENE_OVERLAYS = [
  'radial-gradient(circle at 50% 50%, hsl(258 90% 66% / 0.4), transparent 70%)',
  'radial-gradient(circle at 80% 20%, hsl(292 84% 61% / 0.35), transparent 70%)',
  'radial-gradient(circle at 20% 80%, hsl(217 91% 60% / 0.35), transparent 70%)',
  'radial-gradient(circle at 50% 50%, hsl(258 90% 66% / 0.4), transparent 70%)',
  'radial-gradient(circle at 80% 80%, hsl(292 84% 61% / 0.35), transparent 70%)',
  'radial-gradient(circle at 20% 20%, hsl(217 91% 60% / 0.35), transparent 70%)',
  'radial-gradient(circle at 50% 80%, hsl(258 90% 66% / 0.4), transparent 70%)',
  'radial-gradient(circle at 80% 50%, hsl(292 84% 61% / 0.35), transparent 70%)',
  'radial-gradient(circle at 50% 50%, hsl(258 90% 66% / 0.5), transparent 80%)',
];

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
    audio.volume = 0.42;
    const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
      audio.currentTime = targetTime;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted]);

  return (
    <>
      <div className="w-full h-screen overflow-hidden relative" style={{ backgroundColor: 'hsl(240 33% 3%)' }}>
        {/* Persistent cinematic video background */}
        <div className="absolute inset-0 z-0">
          <video
            src={`${import.meta.env.BASE_URL}videos/energy-bg.mp4`}
            className="w-full h-full object-cover"
            style={{ opacity: 0.55 }}
            autoPlay
            muted
            loop
            playsInline
          />
          <div className="absolute inset-0" style={{ backgroundColor: 'hsl(240 33% 3% / 0.45)', backdropFilter: 'blur(2px)' }} />

          {/* Dynamic colour overlay — transitions with each scene */}
          <motion.div
            className="absolute inset-0 mix-blend-overlay"
            style={{ opacity: 0.4 }}
            animate={{ background: SCENE_OVERLAYS[sceneIndex] ?? SCENE_OVERLAYS[0] }}
            transition={{ duration: 2, ease: 'easeInOut' }}
          />

          {/* Subtle grid texture */}
          <div
            className="absolute inset-0 mix-blend-overlay"
            style={{
              opacity: 0.08,
              backgroundImage: 'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />
        </div>

        {/* Scene foreground */}
        <div className="absolute inset-0 z-10">
          <AnimatePresence mode="popLayout">
            {SceneComponent && <SceneComponent key={currentSceneKey} />}
          </AnimatePresence>
        </div>
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
