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

export const SCENE_DURATIONS = {
  scene0: 4000,
  scene1: 5000,
  scene2: 5000,
  scene3: 5000,
  scene4: 5000,
  scene5: 5000,
  scene6: 6000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  scene0: Scene0,
  scene1: Scene1,
  scene2: Scene2,
  scene3: Scene3,
  scene4: Scene4,
  scene5: Scene5,
  scene6: Scene6,
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

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS;
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
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
    <>
      <div className="w-full h-screen overflow-hidden relative bg-background text-foreground">

        {/* Cinematic letterbox */}
        <div className="absolute top-0 left-0 right-0 h-[3vh] bg-black z-50 pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-[3vh] bg-black z-50 pointer-events-none" />

        {/* Map grid background — slow Ken-Burns zoom */}
        <motion.div
          className="absolute inset-0 z-0"
          animate={{
            scale: sceneIndex === 0 ? 1 : sceneIndex === 6 ? 1.15 : [1.05, 1.1, 1.05],
            opacity: (sceneIndex === 0 || sceneIndex === 6) ? 0.3 : 0.12,
          }}
          transition={{ scale: { duration: 20, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 2 } }}
        >
          <img
            src={`${import.meta.env.BASE_URL}images/map-grid.png`}
            alt="Map grid"
            className="w-full h-full object-cover"
          />
        </motion.div>

        {/* Emergency Drone Video for Scene 1 & 3 */}
        <motion.div
          className="absolute inset-0 z-0"
          animate={{
            opacity: (sceneIndex === 1 || sceneIndex === 3) ? 0.4 : 0,
            scale: sceneIndex === 1 ? [1, 1.04, 1] : 1.1,
          }}
          transition={{ opacity: { duration: 2, ease: 'easeInOut' }, scale: { duration: 20, repeat: Infinity, ease: 'easeInOut' } }}
        >
          <video src={`https://pub-07bed37fd4bf4c02b66107ecb2a7686d.r2.dev/video-artifacts/emergency-drone.mp4`} className="w-full h-full object-cover" autoPlay muted loop playsInline />
          <div className="absolute inset-0 bg-background/60" />
        </motion.div>

        {/* Health Network Video for Scene 2 & 4 */}
        <motion.div
          className="absolute inset-0 z-0"
          animate={{
            opacity: (sceneIndex === 2 || sceneIndex === 4) ? 0.5 : 0,
            scale: sceneIndex === 2 ? [1, 1.04, 1] : 1.1,
          }}
          transition={{ opacity: { duration: 2, ease: 'easeInOut' }, scale: { duration: 20, repeat: Infinity, ease: 'easeInOut' } }}
        >
          <video src={`https://pub-07bed37fd4bf4c02b66107ecb2a7686d.r2.dev/video-artifacts/health-network.mp4`} className="w-full h-full object-cover" autoPlay muted loop playsInline />
          <div className="absolute inset-0 bg-background/60 mix-blend-multiply" />
        </motion.div>

        {/* Oil Spill Video for Scene 5 */}
        <motion.div
          className="absolute inset-0 z-0"
          animate={{
            opacity: sceneIndex === 5 ? 0.6 : 0,
            scale: sceneIndex === 5 ? [1, 1.04, 1] : 1.05,
          }}
          transition={{ opacity: { duration: 2, ease: 'easeInOut' }, scale: { duration: 20, repeat: Infinity, ease: 'easeInOut' } }}
        >
          <video src={`https://pub-07bed37fd4bf4c02b66107ecb2a7686d.r2.dev/video-artifacts/oil-spill.mp4`} className="w-full h-full object-cover" autoPlay muted loop playsInline />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        </motion.div>

        {/* Vignette */}
        <div
          className="absolute inset-0 z-[2] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,0,0.6) 100%)' }}
        />

        {/* Persistent logo */}
        <motion.div
          className="absolute top-[4.5vh] left-[3vw] z-50"
          animate={{
            opacity: sceneIndex > 0 && sceneIndex < 6 ? 1 : 0,
            y: sceneIndex > 0 && sceneIndex < 6 ? 0 : -20,
          }}
          transition={{ duration: 1.2 }}
        >
          <motion.img
            src={`${import.meta.env.BASE_URL}images/awa-logo.png`}
            alt="Awajimaa"
            style={{ height: '3.5vh', width: 'auto', filter: 'drop-shadow(0 0 10px rgba(100,180,255,0.6)) brightness(1.1)' }}
            animate={{ opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>

        {/* Noise Texture Overlay */}
        <div className="absolute inset-0 z-40 opacity-[0.03] pointer-events-none bg-noise" />

        <AnimatePresence mode="sync">
          {SceneComponent && <SceneComponent key={currentSceneKey} />}
        </AnimatePresence>
      </div>

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
