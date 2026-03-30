'use client'

import { useEffect, useState } from 'react'

/**
 * Confetti particle configuration.
 */
interface Particle {
  id: number
  x: number
  delay: number
  duration: number
  color: string
  size: number
  rotation: number
  /** Pre-generated shape flag to avoid Math.random() in render path (hydration safety) */
  isCircle: boolean
}

const CONFETTI_COLORS = [
  '#ff4500', // International Orange
  '#3b82f6', // Electric Blue
  '#f97316', // Orange 500
  '#fbbf24', // Amber 400
  '#34d399', // Emerald 400
  '#a78bfa', // Violet 400
  '#fb7185', // Rose 400
]

const PARTICLE_COUNT = 60

/**
 * ConfettiCelebration -- CSS-only confetti animation.
 *
 * @description Renders a burst of confetti particles using CSS keyframe
 * animations. No external dependencies. Auto-cleans up after animation completes.
 */
export function ConfettiCelebration(): React.ReactNode {
  const [particles, setParticles] = useState<Particle[]>([])
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const generated: Particle[] = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 2 + Math.random() * 2,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 4 + Math.random() * 8,
      rotation: Math.random() * 360,
      isCircle: Math.random() > 0.5,
    }))
    setParticles(generated)

    // Clean up after animation completes
    const timer = setTimeout(() => setIsVisible(false), 5000)
    return () => clearTimeout(timer)
  }, [])

  if (!isVisible || particles.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(-20px) rotate(0deg) scale(1);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg) scale(0.3);
            opacity: 0;
          }
        }
        .confetti-particle {
          position: absolute;
          top: -20px;
          animation: confetti-fall var(--duration) var(--delay) ease-in forwards;
        }
      `}</style>
      {particles.map((p) => (
        <div
          key={p.id}
          className="confetti-particle"
          style={{
            left: `${p.x}%`,
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            borderRadius: p.isCircle ? '50%' : '2px',
            transform: `rotate(${p.rotation}deg)`,
            '--delay': `${p.delay}s`,
            '--duration': `${p.duration}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}
