"use client";

import { motion, useScroll, useTransform, Variants } from "framer-motion";
import { ReactNode, useRef } from "react";

/**
 * Animation variants for reuse across the marketing page.
 * 
 * @description Provides consistent, performant animations using only
 * GPU-accelerated properties (opacity, transform).
 */

// Basic fade in with upward movement
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" }
  }
};

// Fade in with scale (for badges, icons)
export const fadeInScale: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.5, ease: "easeOut" }
  }
};

// Slide in from left (for section headers)
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -40 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.6, ease: "easeOut" }
  }
};

// Container that staggers children animations
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1
    }
  }
};

// Card variant with hover lift effect built-in
export const cardVariant: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" }
  }
};

// Hero-specific variants with longer durations
export const heroHeadline: Variants = {
  hidden: { opacity: 0, y: 50 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.8, ease: "easeOut" }
  }
};

export const heroTagline: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.6, ease: "easeOut", delay: 0.2 }
  }
};

// Button hover/tap animations
export const buttonHover = {
  scale: 1.03,
  transition: { type: "spring" as const, stiffness: 400, damping: 17 }
};

export const buttonTap = {
  scale: 0.97
};

/**
 * Animated section wrapper with scroll-triggered reveal.
 * 
 * @param children - Content to animate
 * @param className - Additional CSS classes
 * @param delay - Optional delay before animation starts
 */
interface AnimatedSectionProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function AnimatedSection({ children, className, delay = 0 }: AnimatedSectionProps) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      variants={{
        hidden: { opacity: 0, y: 30 },
        visible: { 
          opacity: 1, 
          y: 0,
          transition: { duration: 0.6, ease: "easeOut", delay }
        }
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Animated card with stagger support and hover effect.
 * 
 * @param children - Card content
 * @param className - Additional CSS classes
 */
interface AnimatedCardProps {
  children: ReactNode;
  className?: string;
}

export function AnimatedCard({ children, className }: AnimatedCardProps) {
  return (
    <motion.div
      variants={cardVariant}
      whileHover={{ 
        y: -8, 
        boxShadow: "0 20px 40px -12px rgba(0, 0, 0, 0.15)",
        transition: { duration: 0.3 }
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Stagger container for animating multiple children in sequence.
 * 
 * @param children - Child elements to stagger
 * @param className - Additional CSS classes
 */
interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
}

export function StaggerContainer({ children, className }: StaggerContainerProps) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      variants={staggerContainer}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Animated section header with slide-in effect.
 * 
 * @param children - Header text/content
 * @param className - Additional CSS classes
 */
interface AnimatedHeaderProps {
  children: ReactNode;
  className?: string;
}

export function AnimatedHeader({ children, className }: AnimatedHeaderProps) {
  return (
    <motion.h2
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      variants={slideInLeft}
      className={className}
    >
      {children}
    </motion.h2>
  );
}

/**
 * Parallax image container that moves slower than scroll.
 * 
 * @param children - Image or content to parallax
 * @param className - Additional CSS classes
 * @param speed - Parallax intensity (default 0.3, range 0-1)
 */
interface ParallaxContainerProps {
  children: ReactNode;
  className?: string;
  speed?: number;
}

export function ParallaxContainer({ children, className, speed = 0.3 }: ParallaxContainerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"]
  });
  
  const y = useTransform(scrollYProgress, [0, 1], [0, 200 * speed]);

  return (
    <motion.div
      ref={ref}
      style={{ y }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Motion Link wrapper for animated buttons/links.
 */
export const MotionLink = motion.a;
export const MotionDiv = motion.div;
