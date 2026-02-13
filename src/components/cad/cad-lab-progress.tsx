"use client"

/**
 * @file cad-lab-progress.tsx — Rich progress experience during AI operations.
 *
 * @description Replaces plain text progress lines with an engaging visual
 * experience: animated step indicators, "did you know" facts about the
 * time/money this replaces, and estimated time remaining.
 *
 * @component
 */

import { useState, useEffect } from "react"
import { CheckCircle2, Loader2, Clock, Sparkles } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

/** Facts that rotate during wait times to show the value being created */
const DID_YOU_KNOW_FACTS = [
  "Traditional CAD modeling for a product like this takes 2-4 weeks of engineering time.",
  "Manual DFM (Design for Manufacturability) analysis costs $500-2,000 per part.",
  "Engineering consultants charge $150-300/hr for parametric modeling work.",
  "A typical product research phase involves 40+ hours of market and spec analysis.",
  "Module decomposition is usually done in multi-day systems engineering workshops.",
  "Sourcing and supply chain qualification takes companies 2-6 weeks per component.",
  "Cost estimation traditionally requires RFQs from 3-5 suppliers, taking weeks to compile.",
  "Full engineering review packages typically take a senior engineer 3-5 days to prepare.",
]

interface CadLabProgressProps {
  /** Array of progress status lines from the operation */
  lines: string[]
  /** Whether the operation is currently running */
  isActive: boolean
  /** Type of operation for context-specific messaging */
  operationType: "research" | "decompose" | "generate" | "batch"
}

/**
 * CadLabProgress — Rich progress card with animated steps and value context.
 *
 * @description Shows real-time progress during long AI operations with
 * animated checkmarks, rotating "did you know" facts, and time estimates.
 */
export function CadLabProgress({ lines, isActive, operationType }: CadLabProgressProps) {
  const [factIndex, setFactIndex] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // Rotate facts every 6 seconds
  useEffect(() => {
    if (!isActive) return
    const interval = setInterval(() => {
      setFactIndex((prev) => (prev + 1) % DID_YOU_KNOW_FACTS.length)
    }, 6000)
    return () => clearInterval(interval)
  }, [isActive])

  // Track elapsed time
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

  if (!isActive && lines.length === 0) return null

  const estimatedSeconds = operationType === "research" ? 60
    : operationType === "decompose" ? 30
    : operationType === "generate" ? 45
    : 120

  const progress = Math.min((elapsedSeconds / estimatedSeconds) * 100, 95)

  return (
    <Card className="border-international-orange/30 bg-gradient-to-r from-international-orange-light/20 to-background overflow-hidden">
      <CardContent className="pt-6 space-y-4">
        {/* Progress bar */}
        {isActive && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin text-international-orange" />
                {operationType === "research" ? "Researching your product..." :
                 operationType === "decompose" ? "Decomposing into modules..." :
                 operationType === "generate" ? "Generating CAD model..." :
                 "Running batch pipeline..."}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {elapsedSeconds}s
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-international-orange rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Step lines with animated checkmarks */}
        {lines.length > 0 && (
          <div className="space-y-1.5">
            {lines.map((line, i) => {
              const isLast = i === lines.length - 1
              const isComplete = !isLast || !isActive
              return (
                <div key={i} className="flex items-start gap-2 text-sm">
                  {isComplete ? (
                    <CheckCircle2 className="h-4 w-4 text-status-success flex-shrink-0 mt-0.5" />
                  ) : (
                    <Loader2 className="h-4 w-4 text-international-orange animate-spin flex-shrink-0 mt-0.5" />
                  )}
                  <span className={isComplete ? "text-muted-foreground" : "text-foreground font-medium"}>
                    {line}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* "Did you know?" rotating facts */}
        {isActive && (
          <div className="flex items-start gap-2.5 pt-2 border-t border-international-orange/10">
            <Sparkles className="h-4 w-4 text-international-orange flex-shrink-0 mt-0.5" />
            <div className="min-h-[40px]">
              <p className="text-xs font-medium text-international-orange mb-0.5">Did you know?</p>
              <p className="text-xs text-muted-foreground leading-relaxed transition-opacity duration-500">
                {DID_YOU_KNOW_FACTS[factIndex]}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
