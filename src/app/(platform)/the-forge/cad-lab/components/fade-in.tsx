"use client"

import { useState, useEffect } from "react"

// ─── Fade In (crossfade for batch → module list transition) ──────────

/**
 * FadeIn — Subtle opacity fade when a section mounts.
 * Used to smooth the transition when batch progress grid disappears
 * and the module list appears.
 */
export function FadeIn({ children }: { children: React.ReactNode }): React.ReactNode {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div
      className="transition-opacity duration-500 ease-out"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {children}
    </div>
  )
}
