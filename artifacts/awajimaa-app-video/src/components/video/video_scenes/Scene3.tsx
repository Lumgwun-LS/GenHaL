import { motion } from 'framer-motion';

export const Scene3 = () => {
  return (
    <motion.div
      className="absolute inset-0 flex items-end px-12 md:px-24 pb-24 z-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: 50 }}
      transition={{ duration: 0.8 }}
    >
      <div className="max-w-5xl relative z-10 w-full">
        <motion.div
          className="inline-block px-4 py-1 mb-6 border border-primary text-primary font-bold tracking-widest text-sm uppercase bg-primary/10 backdrop-blur-sm"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          03 // Deploy
        </motion.div>
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div>
            <motion.h2 
              className="font-display font-black text-6xl md:text-[7rem] leading-[0.9] text-white tracking-tighter"
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4, duration: 0.8, type: 'spring' }}
            >
              RAPID<br/><span className="text-primary">DISPATCH</span>
            </motion.h2>
          </div>
          
          <div className="flex gap-4 flex-wrap">
            {['AMBULANCES', 'GROUND TEAMS', 'DRONES'].map((item, i) => (
              <motion.div
                key={item}
                className="px-6 py-3 bg-white/5 backdrop-blur-md border border-white/10 text-white font-bold tracking-wider"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6 + i * 0.15, type: 'spring', bounce: 0.5 }}
              >
                {item}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Targeting UI overlay element */}
      <motion.img 
        src={`${import.meta.env.BASE_URL}images/drone-ui.png`}
        alt=""
        className="absolute inset-0 w-full h-full object-contain opacity-30 mix-blend-screen pointer-events-none"
        initial={{ opacity: 0, scale: 1.5, rotate: 15 }}
        animate={{ opacity: 0.3, scale: 1, rotate: 0 }}
        transition={{ delay: 0.5, duration: 2, ease: "easeOut" }}
      />
    </motion.div>
  );
};