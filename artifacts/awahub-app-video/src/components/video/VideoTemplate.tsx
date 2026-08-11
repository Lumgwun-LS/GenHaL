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

        {/* Slow Ken-Burns background texture */}
        <motion.div
          className="absolute inset-0 z-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `url(${import.meta.env.BASE_URL}images/pattern.png)`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            mixBlendMode: 'overlay',
          }}
          animate={{
            scale: [1, 1.08, 1],
            opacity: sceneIndex === 0 || sceneIndex === 6 ? 0.3 : 0.15,
          }}
          transition={{ scale: { duration: 30, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 1.5 } }}
        />

        {/* Persistent slow ambient gradient drift */}
        <motion.div
          className="absolute w-[150vw] h-[150vh] rounded-full blur-[120px] pointer-events-none z-0 opacity-40 mix-blend-screen"
          style={{ left: '-25vw', top: '-25vh' }}
          animate={{
            background: [
              'radial-gradient(circle, hsl(38 92% 50% / 0.4) 0%, transparent 60%)',
              'radial-gradient(circle, hsl(12 76% 61% / 0.3) 0%, transparent 60%)',
              'radial-gradient(circle, hsl(38 92% 50% / 0.4) 0%, transparent 60%)',
            ],
            x: sceneIndex % 2 === 0 ? '-20%' : '10%',
            y: sceneIndex % 3 === 0 ? '-10%' : '20%',
          }}
          transition={{ background: { duration: 15, ease: 'linear', repeat: Infinity }, x: { duration: 3 }, y: { duration: 3 } }}
        />

        {/* Vignette */}
        <div
          className="absolute inset-0 z-[2] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,0,0.6) 100%)' }}
        />

        {/* Persistent Logo */}
        <motion.div
          className="absolute top-[4.5vh] left-[3vw] z-50"
          initial={{ opacity: 0, y: -20 }}
          animate={{
            opacity: sceneIndex > 0 && sceneIndex < 6 ? 1 : 0,
            y: sceneIndex > 0 && sceneIndex < 6 ? 0 : -20,
          }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.img
            src={`${import.meta.env.BASE_URL}images/awa-logo.png`}
            alt="Awajimaa"
            style={{ height: '3.5vh', width: 'auto', filter: 'drop-shadow(0 0 8px rgba(255,160,50,0.5)) brightness(1.1)' }}
            animate={{ opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>

        <AnimatePresence mode="popLayout">
          {SceneComponent && <SceneComponent key={currentSceneKey} />}
        </AnimatePresence>

        {/* Persistent Progress Line */}
        <motion.div
          className="absolute bottom-[3vh] left-0 h-[2px] bg-primary z-50"
          initial={{ width: '0%' }}
          animate={{ width: `${((sceneIndex + 1) / 7) * 100}%` }}
          transition={{ duration: 1.8, ease: 'circOut' }}
        />
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
