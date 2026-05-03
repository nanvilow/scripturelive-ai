import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { sceneTransitions } from '../../../lib/video/animations';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2200),
      setTimeout(() => setPhase(4), 5000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 flex flex-col justify-center px-10"
      {...sceneTransitions.slideLeft}>
      
      <motion.div
        className="text-[var(--color-accent)] font-bold text-2xl mb-4 tracking-wider uppercase"
        initial={{ opacity: 0, x: -20 }}
        animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
        transition={{ duration: 0.5 }}
      >
        Feature 02
      </motion.div>

      <motion.h2 
        className="text-6xl font-black leading-tight mb-8"
        style={{ fontFamily: 'var(--font-display)' }}
        initial={{ opacity: 0, y: 30 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        Zero-Lag<br/>
        NDI Output
      </motion.h2>

      <div className="flex gap-4">
        {['vMix', 'OBS', 'Wirecast'].map((software, i) => (
          <motion.div
            key={software}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl p-6 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.5, delay: i * 0.2 }}
          >
            <div className="text-xl font-bold mb-2">{software}</div>
            <motion.div 
              className="text-xs text-[var(--color-accent)] font-mono uppercase"
              animate={phase >= 3 ? { opacity: [0.5, 1, 0.5] } : {}}
              transition={{ repeat: Infinity, duration: 2, delay: i * 0.3 }}
            >
              Connected
            </motion.div>
          </motion.div>
        ))}
      </div>

      <motion.p
        className="text-2xl text-white/70 mt-10 text-center"
        initial={{ opacity: 0 }}
        animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.8 }}
      >
        No capture cards required.
      </motion.p>
    </motion.div>
  );
}
