import { useEffect, useRef } from 'react';
import { useVideoPlayer } from '@/lib/video';
import { AnimatePresence, motion } from 'framer-motion';

import Scene00_Opening from './video_scenes/Scene00_Opening';
import ToolScene from './video_scenes/ToolScene';
import Scene11_Closing from './video_scenes/Scene11_Closing';

export const SCENE_DURATIONS: Record<string, number> = {
  scene0: 5000,
  scene1: 4500,
  scene2: 4500,
  scene3: 4500,
  scene4: 4500,
  scene5: 4500,
  scene6: 4500,
  scene7: 4500,
  scene8: 4500,
  scene9: 4500,
  scene10: 4500,
  scene11: 6000,
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

const TOOLS = [
  {
    title: "Website Design",
    phrase: "Stunning websites from a prompt.",
    image: "images/tool_1.jpg"
  },
  {
    title: "Data Analysis",
    phrase: "Surface hidden insights instantly.",
    image: "images/tool_2.jpg"
  },
  {
    title: "Building & Architectural Design",
    phrase: "Visualize breathtaking floor plans.",
    image: "images/tool_3.jpg"
  },
  {
    title: "Social Media Content",
    phrase: "Scroll-stopping reels and graphics.",
    image: "images/tool_4.jpg"
  },
  {
    title: "Logo & Brand Design",
    phrase: "Craft iconic complete identities.",
    image: "images/tool_5.jpg"
  },
  {
    title: "Fashion Design",
    phrase: "Sketch haute couture collections.",
    image: "images/tool_6.jpg"
  },
  {
    title: "Video Generation",
    phrase: "Produce cinematic video from text.",
    image: "images/tool_7.jpg"
  },
  {
    title: "AI Copywriting",
    phrase: "Write headlines that convert.",
    image: "images/tool_8.jpg"
  },
  {
    title: "Marketing Campaigns",
    phrase: "Full strategies produced instantly.",
    image: "images/tool_9.jpg"
  },
  {
    title: "E-commerce / Product Listings",
    phrase: "Optimize high-converting product pages.",
    image: "images/tool_10.jpg"
  }
];

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
      <div
        className="w-full h-screen overflow-hidden relative bg-bg-dark"
        style={{ backgroundColor: 'var(--color-bg-dark)' }}
      >
        {/* Cinematic Background Video that persists globally */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-20"
          src={`${import.meta.env.BASE_URL}videos/bg.mp4`}
        />

        {/* Global Grain/Noise overlay */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none mix-blend-overlay z-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
          }}
        />

        {/* Golden ambient light drift globally */}
        <motion.div
          className="absolute top-1/4 left-1/4 w-[50vw] h-[50vw] bg-primary rounded-full blur-[150px] opacity-10 pointer-events-none z-0"
          animate={{
            x: sceneIndex % 2 === 0 ? '10vw' : '-10vw',
            y: sceneIndex % 2 === 0 ? '-10vh' : '10vh',
            scale: sceneIndex % 2 === 0 ? 1.2 : 0.8,
          }}
          transition={{ duration: 4.5, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-[40vw] h-[40vw] bg-secondary rounded-full blur-[150px] opacity-10 pointer-events-none z-0"
          animate={{
            x: sceneIndex % 2 === 0 ? '-10vw' : '10vw',
            y: sceneIndex % 2 === 0 ? '10vh' : '-10vh',
            scale: sceneIndex % 2 === 0 ? 0.8 : 1.2,
          }}
          transition={{ duration: 4.5, ease: 'easeInOut' }}
        />

        <AnimatePresence mode="popLayout">
          {currentScene === 0 && <Scene00_Opening key={currentSceneKey} />}
          {TOOLS.map((tool, index) =>
            currentScene === index + 1 && (
              <ToolScene
                key={currentSceneKey}
                title={tool.title}
                phrase={tool.phrase}
                image={tool.image}
                index={index}
              />
            )
          )}
          {currentScene === 11 && <Scene11_Closing key={currentSceneKey} />}
        </AnimatePresence>

        {/* Cinematic Letterbox Bars */}
        <div className="absolute top-0 left-0 w-full h-[8vh] bg-black z-50 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-full h-[8vh] bg-black z-50 pointer-events-none" />

        {/* Persistent Logo */}
        <motion.div
          className="absolute top-[10vh] left-[4vw] z-40 overflow-hidden rounded-sm shadow-2xl mix-blend-screen"
          animate={{
            opacity: sceneIndex > 0 && sceneIndex < 11 ? 1 : 0,
            scale: sceneIndex > 0 && sceneIndex < 11 ? 1 : 0.8
          }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <img
            src={`${import.meta.env.BASE_URL}images/logo.jpg`}
            alt="Awajimaa Logo"
            className="w-16 h-16 object-contain"
          />
        </motion.div>
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
