import { motion } from 'framer-motion';

export function Scene8() {
  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center px-[10vw]"
      initial={{ opacity: 0, filter: 'blur(20px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 1 }}
    >
      <div className="absolute inset-0 z-0 flex items-center justify-center">
        <motion.img 
          src={`${import.meta.env.BASE_URL}images/network.png`} 
          alt="Network"
          className="w-full h-full object-cover opacity-40 mix-blend-screen"
          initial={{ scale: 1.1, rotateZ: -5 }}
          animate={{ scale: 1, rotateZ: 0 }}
          transition={{ duration: 5, ease: "easeOut" }}
        />
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[2px]" />
      </div>

      <div className="relative z-10 w-full flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.8 }}
        >
          <h2 className="text-7xl font-bold text-white mb-4 tracking-tight">Business Ops. <span className="text-violet-400">Unified.</span></h2>
          <p className="text-2xl text-white/80 font-light max-w-3xl mx-auto">
            Employees, branches, and inventory managed seamlessly across the continent.
          </p>
        </motion.div>

        <motion.div 
          className="mt-16 grid grid-cols-3 gap-8 w-full max-w-5xl"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.8 }}
        >
          {[
            { label: 'Branches Managed', val: '14,000+' },
            { label: 'Real-time Inventory', val: 'Synced' },
            { label: 'Employee Analytics', val: 'Live' }
          ].map((stat, i) => (
            <motion.div 
              key={i}
              className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.4 + i * 0.1, type: "spring" }}
            >
              <div className="text-4xl font-bold text-white mb-2">{stat.val}</div>
              <div className="text-violet-400 text-sm uppercase tracking-widest">{stat.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
