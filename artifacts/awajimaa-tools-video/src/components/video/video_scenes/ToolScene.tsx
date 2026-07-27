// @ts-nocheck
import { motion } from 'framer-motion';

interface ToolSceneProps {
  title: string;
  phrase: string;
  image: string;
  index: number;
}

export default function ToolScene({ title, phrase, image, index }: ToolSceneProps) {
  // Alternate reveal direction based on index
  const isEven = index % 2 === 0;

  const sceneVariants = {
    hidden: { 
      clipPath: isEven ? 'polygon(0 0, 0 0, 0 100%, 0% 100%)' : 'polygon(100% 0, 100% 0, 100% 100%, 100% 100%)',
      filter: 'brightness(0.5)'
    },
    visible: { 
      clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
      filter: 'brightness(1)',
      transition: { duration: 1.2, ease: [0.76, 0, 0.24, 1] }
    },
    exit: { 
      opacity: 0,
      scale: 1.05,
      filter: 'blur(10px) brightness(0)',
      transition: { duration: 0.8, ease: 'easeInOut' }
    }
  };

  const textContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.6 }
    }
  };

  const textItem = {
    hidden: { opacity: 0, y: 20, filter: 'blur(5px)' },
    visible: { 
      opacity: 1, 
      y: 0, 
      filter: 'blur(0px)',
      transition: { duration: 1, ease: [0.16, 1, 0.3, 1] } 
    }
  };

  return (
    <motion.div
      className="absolute inset-0 z-20 flex items-center"
      variants={sceneVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {/* Full Hero Image Background */}
      <motion.div 
        className="absolute inset-0 w-full h-full"
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ duration: 4.5, ease: 'linear' }}
      >
        <img 
          src={`${import.meta.env.BASE_URL}${image}`} 
          alt={title}
          className="w-full h-full object-cover"
        />
        {/* Cinematic Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-bg-dark/90 via-bg-dark/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg-dark/80 via-transparent to-bg-dark/30" />
      </motion.div>

      {/* Content */}
      <motion.div 
        className="relative z-10 w-full px-[10vw] flex flex-col justify-center pt-[14vh]"
        variants={textContainer}
        initial="hidden"
        animate="visible"
      >
        <div className="flex flex-col max-w-[65vw]">
          <motion.div variants={textItem} className="mb-4">
            <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-primary tracking-tight leading-tight" style={{ textShadow: '0 4px 20px rgba(0,0,0,0.8)' }}>
              {title}
            </h2>
          </motion.div>

          <motion.div variants={textItem}>
            <p className="font-body text-xl md:text-2xl font-light text-text-primary tracking-wide leading-snug" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>
              {phrase}
            </p>
          </motion.div>

          <motion.div 
            className="w-12 h-1 bg-secondary mt-8"
            variants={textItem}
          />
        </div>
      </motion.div>

      {/* Number Indicator */}
      <motion.div 
        className="absolute bottom-[12vh] right-[4vw] z-30 font-display text-6xl text-primary/30 font-bold mix-blend-overlay"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1, duration: 1 }}
      >
        {String(index + 1).padStart(2, '0')}
      </motion.div>
    </motion.div>
  );
}