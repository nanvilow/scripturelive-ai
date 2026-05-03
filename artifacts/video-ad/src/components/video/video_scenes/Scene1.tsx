import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { sceneTransitions } from '../../../lib/video/animations';
import logoIcon from "@assets/scripturelive/icon-512.png";

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 4000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center"
      {...sceneTransitions.scaleFade}>
      
      <motion.div 
        className="w-32 h-32 mb-8 rounded-2xl flex items-center justify-center shadow-[0_0_60px_rgba(14,165,233,0.5)] bg-white/5 overflow-hidden"
        initial={{ scale: 0, rotate: -45 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <img src={logoIcon} alt="ScriptureLive Logo" className="w-full h-full object-cover" />
      </motion.div>

      <motion.h1 
        className="text-6xl font-black tracking-tight leading-tight"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        <motion.span
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
          className="block"
        >
          Worship that
        </motion.span>
        <motion.span
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
          className="block text-[var(--color-accent)]"
        >
          never misses a word
        </motion.span>
      </motion.h1>

      <motion.div
        className="absolute bottom-20 w-full text-center"
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 1, delay: 1 }}
      >
        <p className="text-xl font-medium tracking-widest text-[var(--color-text-secondary)] uppercase">
          SCRIPTURELIVE AI
        </p>
      </motion.div>
    </motion.div>
  );
}
