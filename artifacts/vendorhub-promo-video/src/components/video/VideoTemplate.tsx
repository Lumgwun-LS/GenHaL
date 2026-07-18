import { useEffect, useRef } from 'react';
import { useVideoPlayer } from '@/lib/video';
import { AnimatePresence, motion } from 'framer-motion';

import { Scene0 } from './video_scenes/Scene0';
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
  scene0: 4000,
  scene1: 5500,
  scene2: 5500,
  scene3: 5500,
  scene4: 5500,
  scene5: 7500,
  scene8: 8000,
  scene6: 11000,
  scene9: 7000,  // Ads Suite
  scene7: 5000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  scene0: Scene0,
  scene1: Scene1,
  scene2: Scene2,
  scene3: Scene3,
  scene4: Scene4,
  scene5: Scene5,
  scene8: Scene8,
  scene6: Scene6,
  scene9: Scene9,
  scene7: Scene7,
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
  const { currentSceneKey } = useVideoPlayer({
    durations,
    loop,
  });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const currentScene = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

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
    <div
      className="w-full h-screen overflow-hidden relative"
      style={{ backgroundColor: 'var(--color-bg-dark)' }}
    >
      {/* Cinematic letterbox */}
      <div className="absolute top-0 left-0 right-0 h-[3vh] bg-black z-50 pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-[3vh] bg-black z-50 pointer-events-none" />

      {/* Slow pulse background radial */}
      <motion.div 
        className="absolute inset-0 opacity-40"
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(127, 80, 255, 0.15) 0%, rgba(11, 10, 16, 0) 70%)',
        }}
        animate={{
          scale: [1, 1.25, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 14,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      
      {/* Slow drifting ambient orbs */}
      <motion.div
        className="absolute w-[40vw] h-[40vw] rounded-full blur-[6vw] pointer-events-none"
        animate={{
          x: currentScene === 0 ? '-10vw' : currentScene === 1 ? '70vw' : currentScene === 2 ? '10vw' : currentScene === 3 ? '60vw' : currentScene === 4 ? '-10vw' : currentScene === 5 ? '80vw' : currentScene === 6 ? '10vw' : '50vw',
          y: currentScene === 0 ? '-10vh' : currentScene === 1 ? '60vh' : currentScene === 2 ? '-20vh' : currentScene === 3 ? '50vh' : currentScene === 4 ? '-10vh' : currentScene === 5 ? '70vh' : currentScene === 6 ? '-20vh' : '50vh',
          backgroundColor: currentScene % 2 === 0 ? 'rgba(127, 80, 255, 0.4)' : 'rgba(255, 127, 80, 0.3)',
          scale: currentScene === 7 ? 2 : 1,
        }}
        transition={{ duration: 3, ease: [0.22, 1, 0.36, 1] }}
        style={{ transform: 'translate(-50%, -50%)' }}
      />
      
      <motion.div
        className="absolute w-[50vw] h-[50vw] rounded-full blur-[8vw] pointer-events-none"
        animate={{
          x: currentScene === 0 ? '80vw' : currentScene === 1 ? '-20vw' : currentScene === 2 ? '80vw' : currentScene === 3 ? '-10vw' : currentScene === 4 ? '70vw' : currentScene === 5 ? '20vw' : currentScene === 6 ? '80vw' : '50vw',
          y: currentScene === 0 ? '80vh' : currentScene === 1 ? '10vh' : currentScene === 2 ? '80vh' : currentScene === 3 ? '-20vh' : currentScene === 4 ? '90vh' : currentScene === 5 ? '-10vh' : currentScene === 6 ? '80vh' : '50vh',
          backgroundColor: currentScene % 2 !== 0 ? 'rgba(127, 80, 255, 0.3)' : 'rgba(255, 127, 80, 0.2)',
          scale: currentScene === 7 ? 0 : 1,
        }}
        transition={{ duration: 3.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ transform: 'translate(-50%, -50%)' }}
      />

      {/* Grid overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0V0zm1 1h38v38H1V1z' fill='%23ffffff' fill-rule='evenodd'/%3E%3C/svg%3E")`,
          backgroundSize: '40px 40px'
        }}
      />

      {/* Vignette */}
      <div
        className="absolute inset-0 z-[2] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,0,0.6) 100%)' }}
      />

      {/* Persistent Logo */}
      <motion.div
        className="absolute z-50"
        animate={{
          top: currentScene === 0 ? '50vh' : currentScene === 7 ? '50vh' : '4vh',
          left: currentScene === 0 ? '50vw' : currentScene === 7 ? '50vw' : '4vw',
          x: currentScene === 0 ? '-50%' : currentScene === 7 ? '-50%' : '0%',
          y: currentScene === 0 ? '-50%' : currentScene === 7 ? '-50%' : '0%',
          scale: currentScene === 0 ? 2 : currentScene === 7 ? 2.5 : 1,
          opacity: currentScene === 7 ? 0 : 1,
        }}
        transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.img
          src={`${import.meta.env.BASE_URL}images/awa-logo.png`}
          alt="Awajimaa"
          style={{
            height: currentScene === 0 ? '3vh' : '3.5vh',
            width: 'auto',
            filter: 'drop-shadow(0 0 12px rgba(127,80,255,0.7)) brightness(1.1)',
          }}
          animate={{ opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>

      {/* Foreground Scenes */}
      <AnimatePresence mode="sync">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>

      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </div>
  );
}
