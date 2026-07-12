import { useEffect } from 'react';
import { useVideoPlayer } from '@/lib/video';
import { AnimatePresence, motion } from 'framer-motion';

import { Scene0 } from './video_scenes/Scene0';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';

export const SCENE_DURATIONS = {
  scene0: 4000,
  scene1: 6000,
  scene2: 6000,
  scene3: 5500,
  scene4: 5000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  scene0: Scene0,
  scene1: Scene1,
  scene2: Scene2,
  scene3: Scene3,
  scene4: Scene4,
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

  return (
    <div
      className="w-full h-screen overflow-hidden relative"
      style={{ backgroundColor: 'var(--color-bg-dark)' }}
    >
      {/* Background layer - persists across all scenes */}
      <motion.div 
        className="absolute inset-0 opacity-40"
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(127, 80, 255, 0.15) 0%, rgba(11, 10, 16, 0) 70%)',
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "linear"
        }}
      />
      
      {/* Dynamic ambient background elements */}
      <motion.div
        className="absolute w-[40vw] h-[40vw] rounded-full blur-[120px] pointer-events-none"
        animate={{
          x: currentScene === 0 ? '-10vw' : currentScene === 1 ? '70vw' : currentScene === 2 ? '10vw' : currentScene === 3 ? '60vw' : '50vw',
          y: currentScene === 0 ? '-10vh' : currentScene === 1 ? '60vh' : currentScene === 2 ? '-20vh' : currentScene === 3 ? '50vh' : '50vh',
          backgroundColor: currentScene % 2 === 0 ? 'rgba(127, 80, 255, 0.4)' : 'rgba(255, 127, 80, 0.3)',
          scale: currentScene === 4 ? 2 : 1,
        }}
        transition={{ duration: 2, ease: [0.22, 1, 0.36, 1] }}
        style={{ transform: 'translate(-50%, -50%)' }}
      />
      
      <motion.div
        className="absolute w-[50vw] h-[50vw] rounded-full blur-[150px] pointer-events-none"
        animate={{
          x: currentScene === 0 ? '80vw' : currentScene === 1 ? '-20vw' : currentScene === 2 ? '80vw' : currentScene === 3 ? '-10vw' : '50vw',
          y: currentScene === 0 ? '80vh' : currentScene === 1 ? '10vh' : currentScene === 2 ? '80vh' : currentScene === 3 ? '-20vh' : '50vh',
          backgroundColor: currentScene % 2 !== 0 ? 'rgba(127, 80, 255, 0.3)' : 'rgba(255, 127, 80, 0.2)',
          scale: currentScene === 4 ? 0 : 1,
        }}
        transition={{ duration: 2.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ transform: 'translate(-50%, -50%)' }}
      />

      {/* Grid overlay for texture */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0V0zm1 1h38v38H1V1z' fill='%23ffffff' fill-rule='evenodd'/%3E%3C/svg%3E")`,
          backgroundSize: '40px 40px'
        }}
      />

      {/* Persistent Logo Mark */}
      <motion.div
        className="absolute z-50 font-display font-bold flex items-center gap-2"
        animate={{
          top: currentScene === 0 ? '50vh' : currentScene === 4 ? '50vh' : '4vh',
          left: currentScene === 0 ? '50vw' : currentScene === 4 ? '50vw' : '4vw',
          x: currentScene === 0 ? '-50%' : currentScene === 4 ? '-50%' : '0%',
          y: currentScene === 0 ? '-50%' : currentScene === 4 ? '-50%' : '0%',
          scale: currentScene === 0 ? 2 : currentScene === 4 ? 2.5 : 1,
          opacity: currentScene === 0 ? 0 : currentScene === 4 ? 0 : 1, // Hidden in 0 and 4 as it's part of the scene
        }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="w-8 h-8 rounded-lg overflow-hidden shadow-[0_0_15px_rgba(127,80,255,0.5)]">
          <img src={`${import.meta.env.BASE_URL}images/awajimaa-logo.jpg`} alt="Awajimaa" className="w-full h-full object-cover" />
        </div>
        <span className="text-white text-xl tracking-tight">Awajimaa</span>
      </motion.div>

      {/* Foreground Scenes */}
      <AnimatePresence mode="sync">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>
    </div>
  );
}
