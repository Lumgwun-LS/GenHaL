import { motion } from 'framer-motion';

export function Scene7() {
  return (
    <motion.div 
      className="absolute inset-0 flex flex-row items-center justify-between px-[10vw]"
      initial={{ opacity: 0, scale: 1.2 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8, filter: 'blur(10px)' }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-1/2 relative h-[80vh] flex items-center justify-center">
        <motion.div 
          className="relative w-[40vw] h-[40vw] max-w-[600px] max-h-[600px]"
          initial={{ opacity: 0, y: 50, rotateY: 30 }}
          animate={{ opacity: 1, y: 0, rotateY: 0 }}
          transition={{ delay: 0.5, duration: 1.5, ease: "easeOut" }}
        >
          <img 
            src={`${import.meta.env.BASE_URL}images/commerce.png`} 
            alt="Commerce" 
            className="w-full h-full object-contain drop-shadow-[0_0_50px_rgba(217,70,239,0.4)]"
          />
        </motion.div>
      </div>

      <div className="w-1/2 pl-12 z-10">
        <motion.h2 
          className="text-6xl font-bold text-white mb-6 leading-tight"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.8, duration: 0.8 }}
        >
          Scale Your <span className="text-fuchsia-400">eCommerce</span>
        </motion.h2>
        
        <div className="flex flex-col gap-8 mt-10">
          {[
            { title: 'Global Storefronts', desc: 'Customizable shops that convert' },
            { title: 'Multi-vendor Checkout', desc: 'Unified cart experiences' },
            { title: 'Automated Fulfilment', desc: 'Order tracking across Africa' }
          ].map((item, i) => (
            <motion.div 
              key={i}
              className="relative pl-8 border-l-2 border-fuchsia-400/30"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.2 + i * 0.2, duration: 0.6 }}
            >
              <motion.div 
                className="absolute left-[-5px] top-2 w-2 h-2 rounded-full bg-fuchsia-400"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1.4 + i * 0.2, type: "spring" }}
              />
              <h3 className="text-2xl font-bold text-white mb-2">{item.title}</h3>
              <p className="text-xl text-white/60 font-light">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
