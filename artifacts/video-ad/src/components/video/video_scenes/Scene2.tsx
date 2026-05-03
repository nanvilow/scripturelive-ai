import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { sceneTransitions } from '../../../lib/video/animations';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 2500),
      setTimeout(() => setPhase(4), 5000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col justify-center px-10"
      {...sceneTransitions.slideLeft}>
      
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 to-transparent pointer-events-none" />

      <motion.div
        className="text-[var(--color-accent)] font-bold text-2xl mb-4 tracking-wider uppercase"
        initial={{ opacity: 0, x: -20 }}
        animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
        transition={{ duration: 0.5 }}
      >
        Feature 01
      </motion.div>

      <motion.h2 
        className="text-6xl font-black leading-tight mb-8"
        style={{ fontFamily: 'var(--font-display)' }}
        initial={{ opacity: 0, y: 30 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        Hands-free<br/>
        Voice Command
      </motion.h2>

      <motion.div
        className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-md relative overflow-hidden"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.8, type: "spring" }}
      >
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
            <motion.div 
              className="w-4 h-4 bg-blue-400 rounded-full"
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            />
          </div>
          <p className="text-2xl font-medium text-white/80">
            "John 3:16"
          </p>
        </div>

        <motion.div 
          className="h-[2px] w-full bg-white/10 rounded overflow-hidden"
        >
          <motion.div 
            className="h-full bg-blue-500"
            initial={{ width: "0%" }}
            animate={phase >= 3 ? { width: "100%" } : { width: "0%" }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </motion.div>

        <motion.p 
          className="text-3xl font-bold mt-6 text-white"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          For God so loved the world...
        </motion.p>
      </motion.div>

    </motion.div>
  );
}
