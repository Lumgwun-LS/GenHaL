import { useEffect, useRef } from 'react';
import { useVideoPlayer } from '@/lib/video';
import { AnimatePresence, motion } from 'framer-motion';

import { Scene0Intro } from './video_scenes/Scene0Intro';
import { Scene1Markets } from './video_scenes/Scene1Markets';
import { Scene2RealEstate } from './video_scenes/Scene2RealEstate';
import { Scene3BizDeals } from './video_scenes/Scene3BizDeals';
import { Scene4Logistics } from './video_scenes/Scene4Logistics';
import { Scene5Insurance } from './video_scenes/Scene5Insurance';
import { Scene6Outro } from './video_scenes/Scene6Outro';

export const SCENE_DURATIONS = {
  intro: 4500,
  markets: 6000,
  realEstate: 5500,
  bizDeals: 5500,
  logistics: 5500,
  insurance: 6000,
  outro: 6000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  intro: Scene0Intro,
  markets: Scene1Markets,
  realEstate: Scene2RealEstate,
  bizDeals: Scene3BizDeals,
  logistics: Scene4Logistics,
  insurance: Scene5Insurance,
  outro: Scene6Outro,
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
        {/* Persistent Background Layer */}
        <motion.div
          className="absolute inset-0 z-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `url(${import.meta.env.BASE_URL}images/pattern.png)`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            mixBlendMode: 'overlay',
          }}
          animate={{
            scale: [1, 1.1, 1],
            opacity: sceneIndex === 0 || sceneIndex === 6 ? 0.3 : 0.15,
          }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        />

        {/* Persistent ambient gradient drifting */}
        <motion.div
          className="absolute w-[150vw] h-[150vh] rounded-full blur-[120px] pointer-events-none z-0 opacity-40 mix-blend-screen"
          animate={{
            background: [
              'radial-gradient(circle, hsl(38 92% 50% / 0.4) 0%, transparent 60%)',
              'radial-gradient(circle, hsl(12 76% 61% / 0.3) 0%, transparent 60%)',
              'radial-gradient(circle, hsl(38 92% 50% / 0.4) 0%, transparent 60%)',
            ],
            x: sceneIndex % 2 === 0 ? '-20%' : '10%',
            y: sceneIndex % 3 === 0 ? '-10%' : '20%',
          }}
          transition={{ duration: 15, ease: 'linear', repeat: Infinity }}
        />

        <AnimatePresence mode="popLayout">
          {SceneComponent && <SceneComponent key={currentSceneKey} />}
        </AnimatePresence>

        {/* Persistent Logo / Brand Mark Overlay */}
        <motion.div
          className="absolute top-8 left-12 z-50 flex items-center gap-3"
          initial={{ opacity: 0, y: -20 }}
          animate={{
            opacity: sceneIndex > 0 && sceneIndex < 6 ? 1 : 0,
            y: sceneIndex > 0 && sceneIndex < 6 ? 0 : -20,
          }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 22H22L12 2Z" fill="hsl(24 20% 12%)" />
              <circle cx="12" cy="15" r="3" fill="hsl(38 92% 50%)" />
            </svg>
          </div>
          <span className="font-outfit font-bold text-xl tracking-wide text-foreground">AWA HUB</span>
        </motion.div>

        {/* Persistent Progress Line */}
        <motion.div
          className="absolute bottom-0 left-0 h-1 bg-primary z-50"
          initial={{ width: '0%' }}
          animate={{ width: `${((sceneIndex + 1) / 7) * 100}%` }}
          transition={{ duration: 1.2, ease: 'circOut' }}
        />
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
