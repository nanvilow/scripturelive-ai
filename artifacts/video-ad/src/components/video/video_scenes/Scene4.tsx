import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { sceneTransitions } from '../../../lib/video/animations';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
      setTimeout(() => setPhase(4), 5000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center bg-[var(--color-primary)]"
      {...sceneTransitions.scaleFade}>
      
      <motion.div
        className="w-full max-w-[80%] aspect-video bg-white/5 border border-white/10 rounded-2xl mb-12 flex items-center justify-center shadow-2xl relative overflow-hidden"
        initial={{ opacity: 0, y: 40 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
        transition={{ duration: 0.8, type: "spring" }}
      >
        <motion.div 
          className="absolute inset-0 bg-gradient-to-t from-blue-900/40 to-transparent"
          animate={{ opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 4, repeat: Infinity }}
        />
        <div className="text-4xl font-black tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          SCRIPTURE<span className="text-[var(--color-accent)]">LIVE</span> AI
        </div>
      </motion.div>

      <motion.h3
        className="text-5xl font-black mb-6"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.6, type: 'spring' }}
      >
        scriptureliveai.com
      </motion.h3>

      <motion.div
        className="px-8 py-4 bg-white text-black rounded-full font-bold text-2xl uppercase tracking-wider"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.5 }}
      >
        Free for Windows
      </motion.div>

    </motion.div>
  );
}
