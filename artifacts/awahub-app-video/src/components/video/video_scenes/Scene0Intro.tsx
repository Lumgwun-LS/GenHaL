import { motion } from 'framer-motion';

export function Scene0Intro() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.4 }
    },
    exit: { 
      opacity: 0,
      scale: 1.1,
      filter: 'blur(10px)',
      transition: { duration: 0.8, ease: [0.76, 0, 0.24, 1] }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 40, rotateX: 20 },
    visible: { 
      opacity: 1, 
      y: 0, 
      rotateX: 0,
      transition: { duration: 1.2, ease: [0.16, 1, 0.3, 1] }
    }
  };

  return (
    <motion.div
      className="absolute inset-0 w-full h-full flex flex-col items-center justify-center z-10"
      variants={containerVariants as never}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <div className="absolute inset-0 bg-background z-0" />
      <motion.div 
        className="absolute inset-0 opacity-40 z-0"
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ duration: 8, ease: "easeOut" }}
        style={{
          backgroundImage: `url(${import.meta.env.BASE_URL}images/bg-texture.png)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      
      {/* Ambient glowing orb for the logo */}
      <motion.div 
        className="absolute w-96 h-96 bg-primary/20 rounded-full blur-[80px] z-0"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1.5, opacity: 1 }}
        transition={{ duration: 3, ease: "easeOut" }}
      />

      <div className="relative z-10 flex flex-col items-center">
        <motion.div 
          variants={itemVariants as never}
          className="mb-8 relative"
        >
          <div className="w-24 h-24 rounded-3xl bg-primary flex items-center justify-center shadow-2xl shadow-primary/30 relative overflow-hidden">
            {/* Shimmer effect */}
            <motion.div 
              className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/40 to-transparent w-[200%] h-[200%]"
              initial={{ x: '-100%', y: '-100%' }}
              animate={{ x: '100%', y: '100%' }}
              transition={{ duration: 2, delay: 1, repeat: Infinity, repeatDelay: 3 }}
            />
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 22H22L12 2Z" fill="hsl(var(--primary-foreground))" />
              <circle cx="12" cy="15" r="3" fill="hsl(var(--primary))" />
            </svg>
          </div>
        </motion.div>

        <motion.h1 
          variants={itemVariants as never}
          className="font-outfit text-7xl md:text-8xl font-bold tracking-tight text-white mb-6 text-center drop-shadow-lg"
        >
          AWA HUB
        </motion.h1>
        
        <motion.div variants={itemVariants as never} className="h-px w-24 bg-gradient-to-r from-transparent via-primary to-transparent mb-6" />

        <motion.h2 
          variants={itemVariants as never}
          className="text-2xl md:text-3xl font-medium text-foreground/80 tracking-wide text-center"
        >
          <span className="text-primary font-semibold">Africa's</span> Premier
          <br />Trading Hub
        </motion.h2>
      </div>
    </motion.div>
  );
}