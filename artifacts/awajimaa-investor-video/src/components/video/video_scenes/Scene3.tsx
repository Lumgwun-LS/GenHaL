import { motion } from 'framer-motion';

export function Scene3() {
  return (
    <motion.div
      className="absolute inset-0 w-full h-full flex bg-[#03150e]"
      initial={{ clipPath: 'circle(0% at 50% 100%)' }}
      animate={{ clipPath: 'circle(150% at 50% 100%)' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="absolute inset-0 w-1/2 h-full">
        <video
          src={`${import.meta.env.BASE_URL}videos/drone.mp4`}
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#03150e]/50 to-[#03150e]" />
      </div>

      <div className="relative z-10 w-full h-full flex">
        <div className="w-1/2" />
        <div className="w-1/2 h-full flex flex-col justify-center px-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 1 }}
          >
            <h3 className="text-primary tracking-widest uppercase font-bold text-sm mb-4 flex items-center gap-3">
              <span className="w-8 h-px bg-primary" /> Platform 01
            </h3>
            <h2 className="text-5xl md:text-7xl font-display font-bold text-white mb-6">
              AWAJIMAA <br/><span className="text-gradient">APP</span>
            </h2>
            <p className="text-2xl text-gray-300 font-light max-w-xl leading-relaxed mb-12">
              Emergency Response & Tele-Health. The critical 911 infrastructure Africa never had.
            </p>
          </motion.div>

          <div className="flex flex-col gap-4">
            {['Drones & Ambulances', 'Tele-Health Anywhere', 'Disaster Coordination'].map((item, i) => (
              <motion.div
                key={item}
                className="flex items-center gap-4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.2 + i * 0.2, duration: 0.8 }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="text-xl text-white font-medium">{item}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}