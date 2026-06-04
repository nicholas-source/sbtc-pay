import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion, type Transition, type TargetAndTransition } from "framer-motion";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Hidden starting state, e.g. { opacity: 0, y: 20 } or { opacity: 0, x: -20 }. */
  from?: TargetAndTransition;
  transition?: Transition;
}

const SHOWN: TargetAndTransition = { opacity: 1, x: 0, y: 0 };

/**
 * Scroll-reveal that never ships blank.
 *
 * A bare `initial={{ opacity: 0 }} whileInView={...}` gates the content's
 * visibility on the in-view trigger firing — which leaves the section
 * invisible for any renderer that doesn't scroll (prerender bots, link-preview
 * unfurlers, SEO snapshots, or a stalled framer-motion). The reveal must
 * enhance an already-visible default, not be the thing that makes it visible.
 *
 * Guarantees here:
 *   - reduced-motion users get the content instantly, no animation;
 *   - a safety net reveals it shortly after mount if the in-view trigger never
 *     fires, so nothing ever ships blank;
 *   - normal scrolling still gets the live fade/slide (once).
 */
export function Reveal({
  children,
  className,
  from = { opacity: 0, y: 20 },
  transition = { duration: 0.5 },
}: RevealProps) {
  const reduceMotion = useReducedMotion();
  const [forceShow, setForceShow] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setForceShow(true), 1200);
    return () => window.clearTimeout(id);
  }, []);

  // Reduced-motion users: drop the travel (slide/scale can trigger vestibular
  // discomfort) but keep a gentle opacity fade — movement is the concern, an
  // in-place crossfade is not. Same "never blank" safety net applies.
  if (reduceMotion) {
    return (
      <motion.div
        className={className}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        animate={forceShow ? { opacity: 1 } : undefined}
        viewport={{ once: true }}
        transition={{ duration: 0.3 }}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={className}
      initial={from}
      whileInView={SHOWN}
      animate={forceShow ? SHOWN : undefined}
      viewport={{ once: true }}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}
