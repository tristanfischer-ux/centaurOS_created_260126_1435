/**
 * @file scan-celebration.tsx — Animated celebration banner on scan completion
 *
 * @description Shows a brief animated hero banner when a scan completes,
 * displaying the module count with a particle-burst effect and a pulsing
 * CTA. Auto-dismisses after 8 seconds or on user interaction. Turns the
 * moment of scan completion into a moment of excitement.
 *
 * @related
 * - concept-view.tsx (parent — renders this when justScanned is true)
 */

"use client"

import React, { useEffect, useState } from "react"

import { motion, AnimatePresence } from "framer-motion"

import { Button } from "@/components/ui/button"
import { Sparkles, ArrowDown } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Props ────────────────────────────────────────────────────────────

interface ScanCelebrationProps {
  /** Number of modules identified in the scan */
  moduleCount: number
  /** Called when the banner is dismissed (auto or manual) */
  onDismiss: () => void
}

// ─── Particle burst — lightweight CSS animation ──────────────────────

/** Generates small decorative particles around the icon */
function ParticleBurst(): React.ReactNode {
  const particles = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * 360
    const distance = 30 + Math.random() * 20
    const delay = Math.random() * 0.3
    const size = 3 + Math.random() * 3
    return { angle, distance, delay, size, id: i }
  })

  return (
    <div className="absolute inset-0 pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute left-1/2 top-1/2 rounded-full bg-international-orange"
          style={{ width: p.size, height: p.size }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: Math.cos((p.angle * Math.PI) / 180) * p.distance,
            y: Math.sin((p.angle * Math.PI) / 180) * p.distance,
            opacity: 0,
            scale: 0,
          }}
          transition={{
            duration: 0.8,
            delay: 0.2 + p.delay,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────

/**
 * ScanCelebration — Animated banner shown when a scan completes.
 *
 * @description Fades in with a scale animation, shows module count
 * and a particle burst around the icon, then auto-dismisses after
 * 8 seconds. Clicking "Explore below" also dismisses.
 *
 * @param props.moduleCount - Number of modules identified
 * @param props.onDismiss - Callback to remove the banner
 */
export function ScanCelebration({
  moduleCount,
  onDismiss,
}: ScanCelebrationProps): React.ReactNode {
  const [isVisible, setIsVisible] = useState(true)

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
      // Wait for exit animation before calling onDismiss
      setTimeout(onDismiss, 400)
    }, 8000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  const handleDismiss = (): void => {
    setIsVisible(false)
    setTimeout(onDismiss, 400)
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className={cn(
            "relative rounded-xl border bg-gradient-to-br from-international-orange/5 via-background to-international-orange/5",
            "p-6 text-center overflow-hidden",
          )}
        >
          {/* Decorative glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-international-orange/[0.03] to-transparent pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center gap-3">
            {/* Icon with particle burst */}
            <div className="relative">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
                className="h-14 w-14 rounded-2xl bg-international-orange/10 flex items-center justify-center"
              >
                <Sparkles className="h-7 w-7 text-international-orange" />
              </motion.div>
              <ParticleBurst />
            </div>

            {/* Headline */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-1"
            >
              <h3 className="text-lg font-display font-bold text-foreground">
                Your engineering system is ready
              </h3>
              <p className="text-sm text-muted-foreground">
                We identified{" "}
                <span className="font-semibold text-international-orange">
                  {moduleCount} modules
                </span>{" "}
                in your product — explore the breakdown below.
              </p>
            </motion.div>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="text-international-orange hover:text-international-orange-hover gap-1.5"
              >
                <ArrowDown className="h-3.5 w-3.5" />
                Explore below
              </Button>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
