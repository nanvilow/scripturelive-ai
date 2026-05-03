import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';

export const SCENE_DURATIONS = {
  hook: 5000,
  voice: 6000,
  ndi: 6000,
  outro: 6000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  hook: Scene1,
  voice: Scene2,
  ndi: Scene3,
  outro: Scene4,
};

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as keyof typeof SCENE_DURATIONS;
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#020617] text-white">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-full h-full max-w-[1080px] aspect-[9/16] overflow-hidden">

          {/* Persistent Background Layer */}
          <div className="absolute inset-0 z-0">
            <motion.div
              className="absolute w-[150vw] h-[150vw] rounded-full opacity-30 blur-[80px]"
              style={{ background: 'radial-gradient(circle, var(--color-accent), transparent)' }}
              animate={{
                x: ['-20%', '20%', '-10%'],
                y: ['-10%', '30%', '10%'],
                scale: [1, 1.2, 0.9],
              }}
              transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          <AnimatePresence initial={false} mode="popLayout">
            {SceneComponent && <SceneComponent key={currentSceneKey} />}
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
}
