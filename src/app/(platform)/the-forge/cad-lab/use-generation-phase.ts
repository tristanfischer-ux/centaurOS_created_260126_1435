"use client"

import { useState, useEffect } from "react"

export type GenerationStep = "queued" | "interface" | "generating"

/** Time-based phase messages for interface (dimension planning) step */
const INTERFACE_PHASES: { afterSeconds: number; message: string }[] = [
  { afterSeconds: 0, message: "Analyzing module interfaces and mounting constraints..." },
  { afterSeconds: 5, message: "Cross-referencing material properties and tolerance requirements..." },
  { afterSeconds: 15, message: "Defining parametric dimensions from research data..." },
  { afterSeconds: 30, message: "Finalizing dimension plan — complex modules take longer..." },
]

/** Time-based phase messages for generating (CAD) step */
const GENERATING_PHASES: { afterSeconds: number; message: string }[] = [
  { afterSeconds: 0, message: "Writing parametric CadQuery code from dimension plan..." },
  { afterSeconds: 5, message: "Generating 3D solid geometry with assembly features..." },
  { afterSeconds: 20, message: "Executing on cloud — producing orthographic projections..." },
  { afterSeconds: 45, message: "Running DFM analysis and calculating mass properties..." },
  { afterSeconds: 90, message: "Complex geometry — still processing on cloud infrastructure..." },
]

const QUEUED_MESSAGE = "Waiting in queue — 3 modules can generate simultaneously..."

function getPhaseMessage(step: GenerationStep, elapsedSeconds: number): string {
  if (step === "queued") return QUEUED_MESSAGE
  if (step === "interface") {
    let msg = INTERFACE_PHASES[0].message
    for (const phase of INTERFACE_PHASES) {
      if (elapsedSeconds >= phase.afterSeconds) msg = phase.message
    }
    return msg
  }
  // generating
  let msg = GENERATING_PHASES[0].message
  for (const phase of GENERATING_PHASES) {
    if (elapsedSeconds >= phase.afterSeconds) msg = phase.message
  }
  return msg
}

/**
 * Returns a time-based descriptive message and elapsed seconds for the current
 * generation step. Use this to show progressive feedback instead of a static
 * "Generating..." so users understand what is happening.
 *
 * @param isActive - Whether this module (or step) is currently running
 * @param step - Current step: queued, interface (dimension planning), or generating (CAD)
 * @returns { message, elapsedSeconds } — message updates over time; elapsedSeconds resets when isActive becomes false
 */
export function useGenerationPhase(
  isActive: boolean,
  step: GenerationStep,
): { message: string; elapsedSeconds: number } {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    if (!isActive) {
      setElapsedSeconds(0)
      return
    }
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [isActive])

  const message = isActive ? getPhaseMessage(step, elapsedSeconds) : ""
  return { message, elapsedSeconds }
}
