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
      <div className="relative w-full h-screen overflow-hidden" style={{ backgroundColor: '#0A192F' }}>

        {/* Cinematic letterbox */}
        <div className="absolute top-0 left-0 right-0 h-[3vh] bg-black z-50 pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-[3vh] bg-black z-50 pointer-events-none" />

        {/* Slow-breathing background gradient */}
        <motion.div
          className="absolute inset-0 z-0 pointer-events-none"
          animate={{
            background: sceneIndex % 2 === 0
              ? 'radial-gradient(circle at 70% 30%, rgba(0, 128, 128, 0.18) 0%, rgba(10, 25, 47, 1) 60%)'
              : 'radial-gradient(circle at 30% 70%, rgba(0, 128, 128, 0.18) 0%, rgba(10, 25, 47, 1) 60%)',
            scale: [1, 1.04, 1],
          }}
          transition={{ background: { duration: 4, ease: 'easeInOut' }, scale: { duration: 20, repeat: Infinity, ease: 'easeInOut' } }}
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

        {/* Vignette */}
        <div
          className="absolute inset-0 z-[2] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,0,0.65) 100%)' }}
        />

        {/* Gold progress line at top */}
        <motion.div
          className="absolute top-[3vh] left-0 h-[2px] z-50"
          style={{ backgroundColor: '#FFC107' }}
          animate={{ width: `${((sceneIndex + 1) / 8) * 100}%` }}
          transition={{ duration: 1.8, ease: 'circOut' }}
        />

        {/* Persistent logo */}
        <motion.div
          className="absolute top-[4.5vh] left-[3vw] z-40"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: sceneIndex === 0 ? 0 : 1, y: 0 }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.img
            src={`${import.meta.env.BASE_URL}images/awa-logo.png`}
            alt="Awajimaa"
            style={{ height: '3.5vh', width: 'auto', filter: 'drop-shadow(0 0 8px rgba(255,193,7,0.5)) brightness(1.1)' }}
            animate={{ opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>

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
