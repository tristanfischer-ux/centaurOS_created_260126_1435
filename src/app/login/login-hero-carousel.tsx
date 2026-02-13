'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'

/**
 * Hero images for the login carousel.
 * Each image tells a story of what happens inside Fractional Forge.
 */
const HERO_IMAGES = [
  {
    src: '/images/login/login-hero-workshop.png',
    alt: 'Engineers collaborating in a bright British workshop with 3D printers and CNC machines',
  },
  {
    src: '/images/login/login-hero-prototype.png',
    alt: 'Precision-manufactured hardware prototype held with care',
  },
  {
    src: '/images/login/login-hero-team.png',
    alt: 'Team in animated discussion in a characterful UK office',
  },
  {
    src: '/images/login/login-hero-launch.png',
    alt: 'Custom drone prototype launching in a converted warehouse workshop',
  },
] as const

/**
 * Rotating social proof stats shown over the hero images.
 */
const SOCIAL_PROOF = [
  { stat: '100', label: 'Founding member spots', emphasis: 'Be one of the first.' },
  { stat: '78+', label: 'Manufacturing techniques', emphasis: 'From concept to production.' },
  { stat: '12', label: 'Week sprints', emphasis: 'Not 12-month projects.' },
  { stat: '£0', label: 'Equity required', emphasis: 'Keep what you build.' },
] as const

const ROTATION_INTERVAL_MS = 5000

/**
 * LoginHeroCarousel -- Rotating hero images with social proof overlay.
 *
 * @description Cycles through 4 hero images with crossfade transitions,
 * paired with rotating social proof stats. Used on the login page left panel.
 */
export function LoginHeroCarousel(): React.ReactNode {
  const [currentIndex, setCurrentIndex] = useState(0)

  const advance = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % HERO_IMAGES.length)
  }, [])

  useEffect(() => {
    const timer = setInterval(advance, ROTATION_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [advance])

  const currentImage = HERO_IMAGES[currentIndex]
  const currentProof = SOCIAL_PROOF[currentIndex]

  return (
    <div className="absolute inset-0">
      {/* Rotating hero images with crossfade */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentImage.src}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: 'easeInOut' }}
          className="absolute inset-0"
        >
          <Image
            src={currentImage.src}
            alt={currentImage.alt}
            fill
            className="object-cover"
            priority={currentIndex === 0}
            quality={90}
            sizes="50vw"
          />
        </motion.div>
      </AnimatePresence>

      {/* Gradient overlay for text readability */}
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-white/95 via-white/30 to-white/10" />

      {/* Bottom content overlay */}
      <div className="relative z-20 flex flex-col justify-end p-12 h-full pb-16">
        {/* Orange accent bar */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: 80 }}
          transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
          className="h-1 bg-international-orange mb-6 shadow-[0_0_15px_rgba(255,69,0,0.4)]"
        />

        {/* Brand */}
        <motion.h3
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="text-sm font-bold tracking-[0.2em] uppercase text-international-orange mb-3"
        >
          Fractional Forge
        </motion.h3>

        {/* Tagline */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="text-4xl xl:text-5xl font-display font-medium leading-[1.1] mb-8 tracking-tight text-foreground"
        >
          Build atoms at the
          <br />
          <span className="text-international-orange">speed of bits.</span>
        </motion.h2>

        {/* Rotating social proof stat */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentProof.stat}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="flex items-baseline gap-3"
          >
            <span className="text-4xl font-display font-bold text-international-orange">
              {currentProof.stat}
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">
                {currentProof.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {currentProof.emphasis}
              </span>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Progress dots */}
        <div className="flex gap-2 mt-6">
          {HERO_IMAGES.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              aria-label={`View image ${index + 1}`}
              className="group"
            >
              <div
                className={`h-1 rounded-full transition-all duration-500 ${
                  index === currentIndex
                    ? 'w-8 bg-international-orange'
                    : 'w-2 bg-muted-foreground/30 group-hover:bg-muted-foreground/50'
                }`}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * MobileHeroBanner -- Compact hero for mobile login view.
 *
 * @description Shows brand, tagline, and rotating stat in a compact
 * banner above the login form on mobile screens.
 */
export function MobileHeroBanner(): React.ReactNode {
  const [proofIndex, setProofIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setProofIndex((prev) => (prev + 1) % SOCIAL_PROOF.length)
    }, ROTATION_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  const currentProof = SOCIAL_PROOF[proofIndex]

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="lg:hidden w-full bg-muted/50 px-6 py-6 space-y-3"
    >
      <div className="flex items-center gap-3">
        <div className="h-1 w-8 bg-international-orange rounded-full" />
        <span className="text-xs font-bold tracking-[0.2em] uppercase text-international-orange">
          Fractional Forge
        </span>
      </div>

      <h2 className="text-xl font-display font-medium tracking-tight text-foreground">
        Build atoms at the{' '}
        <span className="text-international-orange">speed of bits.</span>
      </h2>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentProof.stat}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-baseline gap-2"
        >
          <span className="text-lg font-display font-bold text-international-orange">
            {currentProof.stat}
          </span>
          <span className="text-xs text-muted-foreground">
            {currentProof.label} — {currentProof.emphasis}
          </span>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
