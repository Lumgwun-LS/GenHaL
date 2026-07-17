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

const SCENE_START_SEC: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let cumulativeMs = 0;
  for (const [key, ms] of Object.entries(SCENE_DURATIONS)) {
    out[key] = cumulativeMs / 1000;
    cumulativeMs += ms;
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
  const { currentScene, currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS;
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.45;
    const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
      audio.currentTime = targetTime;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted]);

  return (
    <>
      <div className="w-full h-screen overflow-hidden relative bg-background text-foreground">

        {/* PERSISTENT BACKGROUNDS OUTSIDE ANIMATEPRESENCE */}

        {/* Base Gradient / Map background */}
        <motion.div
          className="absolute inset-0 z-0 opacity-20"
          animate={{
            scale: sceneIndex === 0 ? 1 : sceneIndex === 6 ? 1.2 : 1.1,
            opacity: (sceneIndex === 0 || sceneIndex === 6) ? 0.3 : 0.1,
          }}
          transition={{ duration: 4, ease: "linear" }}
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
            scale: sceneIndex === 1 ? 1 : 1.1,
          }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
        >
          <video
            src={`${import.meta.env.BASE_URL}videos/emergency-drone.mp4`}
            className="w-full h-full object-cover"
            autoPlay muted loop playsInline
          />
          <div className="absolute inset-0 bg-background/60" />
        </motion.div>

        {/* Health Network Video for Scene 2 & 4 */}
        <motion.div
          className="absolute inset-0 z-0"
          animate={{
            opacity: (sceneIndex === 2 || sceneIndex === 4) ? 0.5 : 0,
            scale: sceneIndex === 2 ? 1 : 1.1,
          }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
        >
          <video
            src={`${import.meta.env.BASE_URL}videos/health-network.mp4`}
            className="w-full h-full object-cover"
            autoPlay muted loop playsInline
          />
          <div className="absolute inset-0 bg-background/60 mix-blend-multiply" />
        </motion.div>

        {/* Oil Spill Video for Scene 5 */}
        <motion.div
          className="absolute inset-0 z-0"
          animate={{
            opacity: sceneIndex === 5 ? 0.6 : 0,
            scale: sceneIndex === 5 ? 1 : 1.05,
          }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
        >
          <video
            src={`${import.meta.env.BASE_URL}videos/oil-spill.mp4`}
            className="w-full h-full object-cover"
            autoPlay muted loop playsInline
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        </motion.div>

        {/* Persistent UI elements across scenes */}
        <motion.div
          className="absolute top-8 left-8 md:top-12 md:left-12 z-50 flex items-center gap-4"
          animate={{
            opacity: sceneIndex > 0 && sceneIndex < 6 ? 1 : 0,
            y: sceneIndex > 0 && sceneIndex < 6 ? 0 : -20,
          }}
          transition={{ duration: 0.8 }}
        >
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
            <span className="font-display font-bold text-xl text-white">A</span>
          </div>
          <span className="font-display font-bold tracking-widest text-white/50 text-sm">AWAJIMAA</span>
        </motion.div>

        {/* Noise Texture Overlay */}
        <div className="absolute inset-0 z-40 opacity-[0.03] pointer-events-none bg-noise" />

        {/* SCENES */}
        <AnimatePresence mode="sync">
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
