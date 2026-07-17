import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const Scene3: React.FC = () => {
  const [phase, setPhase] = useState(0);
  
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 600);
    const t2 = setTimeout(() => setPhase(2), 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center overflow-hidden z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 0.8 }}
    >
      <motion.img 
        src={`${import.meta.env.BASE_URL}images/classroom.jpg`}
        alt="Classroom"
        className="absolute inset-0 w-full h-full object-cover opacity-30"
        initial={{ scale: 1.2, x: 20 }}
        animate={{ scale: 1, x: 0 }}
        transition={{ duration: 5, ease: "easeOut" }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--background))] via-transparent to-[hsl(var(--background))/80]" />
      <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--background))] via-transparent to-[hsl(var(--background))]" />

      <div className="relative z-10 w-full max-w-7xl mx-auto flex flex-col items-center text-center px-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="inline-block px-4 py-1.5 rounded-full border border-white/20 bg-white/5 text-white font-medium text-sm mb-6 uppercase tracking-wider backdrop-blur-md">
            For Schools & Institutions
          </div>
          <h2 className="text-5xl md:text-7xl font-bold text-white font-display leading-tight mb-8">
            Complete <span className="text-gold-gradient">Academic</span> Control
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-8">
          {[
            { title: "Student Management", desc: "Enrolment, records & progression" },
            { title: "Academic Records", desc: "Timetables, results & assessments" },
            { title: "Inventory & Assets", desc: "Track school resources seamlessly" }
          ].map((item, i) => (
            <motion.div
              key={i}
              className="bg-glass p-8 rounded-2xl border border-white/10 flex flex-col items-center"
              initial={{ opacity: 0, y: 30 }}
              animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
              transition={{ duration: 0.6, delay: i * 0.15, type: "spring", stiffness: 100 }}
            >
              <div className="w-12 h-12 rounded-full bg-[hsl(var(--brand-teal))]/20 flex items-center justify-center mb-4">
                <div className="w-4 h-4 rounded-sm bg-[hsl(var(--brand-teal))]" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">{item.title}</h3>
              <p className="text-white/60 text-sm">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default Scene3;