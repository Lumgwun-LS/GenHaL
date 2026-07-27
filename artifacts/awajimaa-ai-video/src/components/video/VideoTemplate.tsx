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
import { Scene10 } from './video_scenes/Scene10';
import { Scene11 } from './video_scenes/Scene11';

export const SCENE_DURATIONS = {
  scene1: 5000,
  scene2: 5000,
  scene3: 4000,
  scene4: 4000,
  scene5: 4000,
  scene6: 5000,
  scene7: 5000,
  scene8: 4000,
  scene10: 6000,
  scene11: 6000,
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
  scene10: Scene10,
  scene11: Scene11,
  scene9: Scene9,
};

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
  'radial-gradient(circle at 30% 60%, hsl(258 90% 66% / 0.38), transparent 70%)',
  'radial-gradient(circle at 70% 30%, hsl(217 91% 60% / 0.38), transparent 70%)',
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
  const audioStarted = useRef(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.52;
    if (!audioStarted.current) {
      audioStarted.current = true;
      audio.currentTime = 0;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, muted]);

  return (
    <>
      <div className="w-full h-screen overflow-hidden relative" style={{ backgroundColor: 'hsl(240 33% 3%)' }}>

        {/* Cinematic letterbox bars */}
        <div className="absolute top-0 left-0 right-0 h-[3vh] bg-black z-50 pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-[3vh] bg-black z-50 pointer-events-none" />

        {/* Persistent cinematic video background with slow Ken-Burns zoom */}
        <div className="absolute inset-0 z-0">
          <motion.div
            className="absolute inset-0"
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
          >
            <video
              src={`${import.meta.env.BASE_URL}videos/energy-bg.mp4`}
              className="w-full h-full object-cover"
              style={{ opacity: 0.55 }}
              autoPlay
              muted
              loop
              playsInline
            />
          </motion.div>
          <div className="absolute inset-0" style={{ backgroundColor: 'hsl(240 33% 3% / 0.45)', backdropFilter: 'blur(2px)' }} />

          {/* Dynamic colour overlay — slow transition with each scene */}
          <motion.div
            className="absolute inset-0 mix-blend-overlay"
            style={{ opacity: 0.4 }}
            animate={{ background: SCENE_OVERLAYS[sceneIndex] ?? SCENE_OVERLAYS[0] }}
            transition={{ duration: 3, ease: 'easeInOut' }}
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

          {/* Slow pulsing vignette */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.7) 100%)' }}
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        {/* Persistent logo — top-left, slow fade in */}
        <motion.div
          className="absolute top-[3.5vh] left-[3vw] z-40"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: sceneIndex === 0 ? 0 : 1, y: 0 }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            className="rounded-full overflow-hidden bg-white flex items-center justify-center"
            style={{
              width: '4.2vh', height: '4.2vh',
              boxShadow: '0 0 18px rgba(245,197,24,0.55), 0 0 6px rgba(255,255,255,0.25)',
              border: '1.5px solid rgba(255,255,255,0.25)',
            }}
            animate={{ opacity: [0.88, 1, 0.88] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <img
              src={`${import.meta.env.BASE_URL}images/logo.jpg`}
              alt="Awajimaa"
              style={{ width: '110%', height: '110%', objectFit: 'cover', objectPosition: 'center' }}
            />
          </motion.div>
        </motion.div>

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
