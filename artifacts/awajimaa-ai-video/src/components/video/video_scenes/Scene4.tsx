import { motion } from 'framer-motion';

export function Scene4() {
  return (
    <motion.div 
      className="absolute inset-0 flex flex-col justify-center px-[10vw]"
      initial={{ opacity: 0, clipPath: 'polygon(0 100%, 100% 100%, 100% 100%, 0 100%)' }}
      animate={{ opacity: 1, clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex items-end justify-between mb-12 z-10">
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
        >
          <h2 className="text-6xl font-bold text-white mb-2">Automated Ad Campaigns</h2>
          <p className="text-2xl text-blue-300 font-light">Meta & X Ads • Real-time ROI • Smart Budgets</p>
        </motion.div>
      </div>

      <div className="flex gap-8 h-[55vh] z-10">
        {/* Main Chart */}
        <motion.div 
          className="flex-1 bg-black/50 backdrop-blur-xl border border-white/10 rounded-3xl p-8 relative overflow-hidden"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.8 }}
        >
          <div className="flex justify-between items-center mb-8 relative z-10">
            <div className="text-white/60 text-lg">Campaign Performance</div>
            <div className="text-green-400 text-2xl font-bold">+245% ROI</div>
          </div>
          
          {/* Animated Line Chart SVG */}
          <svg className="w-full h-full absolute bottom-0 left-0" preserveAspectRatio="none" viewBox="0 0 100 100">
            <motion.path 
              d="M0,80 C20,70 30,90 50,40 C70,-10 80,50 100,20 L100,100 L0,100 Z" 
              fill="url(#gradient)"
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 0.3, y: 0 }}
              transition={{ delay: 1.2, duration: 1.5, ease: "easeOut" }}
            />
            <motion.path 
              d="M0,80 C20,70 30,90 50,40 C70,-10 80,50 100,20" 
              fill="none" 
              stroke="#3B82F6" 
              strokeWidth="2"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 1.2, duration: 2, ease: "easeInOut" }}
            />
            <defs>
              <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" />
                <stop offset="100%" stopColor="transparent" />
              </linearGradient>
            </defs>
          </svg>
        </motion.div>

        {/* Side panels */}
        <div className="w-1/3 flex flex-col gap-6">
          {[
            { metric: 'Reach', value: '1.2M', trend: '+12%' },
            { metric: 'Conversions', value: '8,432', trend: '+45%' },
            { metric: 'CPA', value: '$1.24', trend: '-18%' }
          ].map((item, i) => (
            <motion.div 
              key={i}
              className="flex-1 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col justify-center"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.5 + i * 0.2, duration: 0.6 }}
            >
              <div className="text-white/50 text-sm uppercase tracking-wider mb-2">{item.metric}</div>
              <div className="flex justify-between items-end">
                <div className="text-4xl font-bold text-white">{item.value}</div>
                <div className="text-green-400 font-medium">{item.trend}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
