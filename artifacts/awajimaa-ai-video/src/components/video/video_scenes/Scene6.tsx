import { motion } from 'framer-motion';

export function Scene6() {
  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, y: '100vh' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: '-100vh', filter: 'blur(10px)' }}
      transition={{ duration: 1.2, ease: [0.25, 1, 0.5, 1] }}
    >
      <div className="absolute inset-0 z-0">
        <motion.img 
          src={`${import.meta.env.BASE_URL}images/dashboard.png`} 
          alt="Dashboard"
          className="w-full h-full object-cover opacity-30 mix-blend-screen"
          initial={{ scale: 1.2 }}
          animate={{ scale: 1 }}
          transition={{ duration: 6, ease: "easeOut" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      <div className="relative z-10 w-full px-[10vw] flex flex-col items-center text-center">
        <motion.div
          className="mb-12"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.8 }}
        >
          <h2 className="text-6xl font-bold text-white mb-4">Ultimate Financial Control</h2>
          <p className="text-2xl text-blue-400 font-light">Paystack • Stripe • Flutterwave • PayPal</p>
        </motion.div>

        <div className="flex gap-6 w-full max-w-4xl">
          {[
            { title: 'Global Revenue', value: '$84,290', icon: '💰' },
            { title: 'Active Subscriptions', value: '1,492', icon: '🔁' },
            { title: 'Expense Tracking', value: 'Automated', icon: '📊' }
          ].map((card, i) => (
            <motion.div
              key={i}
              className="flex-1 glow-box bg-black/60 backdrop-blur-xl rounded-2xl p-8 border border-white/10"
              initial={{ opacity: 0, y: 50, rotateX: -20 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ delay: 1.2 + i * 0.2, duration: 0.8, type: "spring" }}
            >
              <div className="text-4xl mb-4">{card.icon}</div>
              <div className="text-white/60 text-sm uppercase tracking-widest mb-2">{card.title}</div>
              <div className="text-3xl font-bold text-white">{card.value}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
