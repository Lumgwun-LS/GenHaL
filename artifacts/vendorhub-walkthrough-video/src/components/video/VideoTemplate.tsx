import { useEffect } from 'react';
import { useVideoPlayer } from '@/lib/video';
import { AnimatePresence, motion } from 'framer-motion';

import Scene1 from './video_scenes/Scene1';
import Scene2 from './video_scenes/Scene2';
import Scene3 from './video_scenes/Scene3';
import Scene4 from './video_scenes/Scene4';
import Scene6 from './video_scenes/Scene6';
import Scene5 from './video_scenes/Scene5';

export const SCENE_DURATIONS = {
  scene1: 3500,
  scene2: 4000,
  scene3: 4500,
  scene4: 4000,
  scene6: 5000,  // Ads Suite
  scene5: 4500,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  scene1: Scene1,
  scene2: Scene2,
  scene3: Scene3,
  scene4: Scene4,
  scene6: Scene6,
  scene5: Scene5,
};

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentScene, currentSceneKey } = useVideoPlayer({
    durations,
    loop,
  });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  return (
    <div className="w-full h-screen overflow-hidden relative bg-[#05050A] text-white">
      {/* Persistent Background Video */}
      <video
        src={`${import.meta.env.BASE_URL}videos/bg_particles.mp4`}
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-screen"
      />

      {/* Persistent Animated Orbs for Depth */}
      <motion.div
        className="absolute w-[50vw] h-[50vw] rounded-full pointer-events-none mix-blend-screen"
        style={{
          background: 'radial-gradient(circle, rgba(138,43,226,0.15) 0%, transparent 70%)',
          filter: 'blur(60px)'
        }}
        animate={{
          x: sceneIndex === 0 ? '-10vw' : sceneIndex === 1 ? '40vw' : sceneIndex === 2 ? '10vw' : sceneIndex === 3 ? '60vw' : '20vw',
          y: sceneIndex === 0 ? '-10vh' : sceneIndex === 1 ? '30vh' : sceneIndex === 2 ? '50vh' : sceneIndex === 3 ? '-10vh' : '20vh',
          scale: sceneIndex === 2 || sceneIndex === 4 ? 1.5 : 1
        }}
        transition={{ duration: 3, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute w-[40vw] h-[40vw] rounded-full pointer-events-none mix-blend-screen"
        style={{
          background: 'radial-gradient(circle, rgba(0,229,255,0.12) 0%, transparent 70%)',
          filter: 'blur(50px)'
        }}
        animate={{
          x: sceneIndex === 0 ? '60vw' : sceneIndex === 1 ? '10vw' : sceneIndex === 2 ? '50vw' : sceneIndex === 3 ? '-10vw' : '50vw',
          y: sceneIndex === 0 ? '50vh' : sceneIndex === 1 ? '-10vh' : sceneIndex === 2 ? '10vh' : sceneIndex === 3 ? '60vh' : '10vh',
          scale: sceneIndex === 1 || sceneIndex === 3 ? 1.5 : 1
        }}
        transition={{ duration: 4, ease: 'easeInOut' }}
      />

      {/* Persistent brand mark -- stays in the corner across every scene */}
      <motion.div
        className="absolute top-[4vh] left-[4vw] z-40 flex items-center gap-[0.8vw]"
        initial={{ opacity: 0, y: '-2vh' }}
        animate={{ opacity: sceneIndex === 0 ? 0 : 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="w-[2.4vw] h-[2.4vw] rounded-[0.6vw] overflow-hidden border border-white/15 shadow-[0_0_20px_rgba(138,43,226,0.35)]">
          <img
            src={`${import.meta.env.BASE_URL}images/awajimaa-logo.jpg`}
            alt="Awajimaa"
            className="w-full h-full object-cover"
          />
        </div>
        <span className="text-[1vw] font-display font-semibold tracking-wide text-white/80">
          Awajimaa
        </span>
      </motion.div>

      <AnimatePresence mode="popLayout">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>
    </div>
  );
}
