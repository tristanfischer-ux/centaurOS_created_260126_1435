"use client"

/**
 * MashupGenerationProgress -- Animated stepper showing real-time generation progress.
 *
 * INTENT: The mashup generation takes 1-3 minutes. A static spinner with "Generating..."
 * destroys trust and makes users wonder if it is broken. This component turns the wait
 * into a feature -- showing exactly what the AI is doing at each stage, with the user's
 * concept and source parts displayed as a visual "sketch" of what is being built.
 *
 * DECISION: Hybrid real + estimated progress. Phase 1 completion is signalled by
 * the real plan prop arriving from the server (~10-15s). Within each phase, sub-steps
 * advance on estimated timing. This gives honest transitions at the major boundary
 * (plan ready) while keeping fine-grained feedback within each phase.
 */

import { useState, useEffect, useRef, useCallback } from "react"
import Image from "next/image"
import {
  CheckCircle2,
  Download,
  Cpu,
  FileCode2,
  Upload,
  Loader2,
  Sparkles,
  FileBox,
  Combine,
  Wrench,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { MashupSourceInput, MashupPlan } from "@/lib/cad-lab-types"

interface GenerationStep {
  id: string
  label: string
  icon: typeof Loader2
  durationMs: number
  messages: string[]
}

const GENERATION_STEPS: GenerationStep[] = [
  {
    id: "fetching",
    label: "Fetching source files",
    icon: Download,
    durationMs: 4_000,
    messages: [
      "Downloading STEP files from storage...",
      "Decoding 3D geometry data...",
      "Preparing source models for analysis...",
    ],
  },
  {
    id: "planning",
    label: "Planning your mashup",
    icon: Sparkles,
    durationMs: 18_000,
    messages: [
      "Analyzing how your parts can fit together...",
      "Evaluating spatial compatibility...",
      "Designing the combination strategy...",
      "Mapping attachment points and interfaces...",
      "Choosing boolean operations for each part...",
    ],
  },
  {
    id: "coding",
    label: "Writing CadQuery code",
    icon: FileCode2,
    durationMs: 18_000,
    messages: [
      "Generating parametric Python code...",
      "Translating the plan into geometry operations...",
      "Adding import and positioning logic...",
      "Optimizing boolean operations for clean geometry...",
      "Validating code against manufacturing constraints...",
    ],
  },
  {
    id: "building",
    label: "Building 3D model",
    icon: Cpu,
    durationMs: 90_000,
    messages: [
      "Spinning up GPU compute on Modal...",
      "Importing source STEP geometries...",
      "Executing boolean unions and cuts...",
      "Resolving intersection edges...",
      "Computing solid body from operations...",
      "Generating surface mesh for preview...",
      "Computing mass properties and analysis...",
      "Rendering isometric view...",
      "Tessellating surfaces for STL export...",
    ],
  },
  {
    id: "uploading",
    label: "Uploading results",
    icon: Upload,
    durationMs: 5_000,
    messages: [
      "Uploading STEP file to storage...",
      "Uploading STL mesh for 3D preview...",
      "Finalizing download URLs...",
    ],
  },
]

const STRATEGY_LABELS: Record<string, string> = {
  embed: "Embedding one part inside another",
  attach: "Attaching parts at connection points",
  morph: "Morphing geometries together",
  stack: "Stacking parts vertically",
  integrate: "Integrating into a unified body",
  hybrid_shell: "Creating a hybrid shell enclosure",
}

interface MashupGenerationProgressProps {
  sources: MashupSourceInput[]
  concept: string
  isActive: boolean
  plan: MashupPlan | null
  isExecuting: boolean
  className?: string
}

export function MashupGenerationProgress({
  sources,
  concept,
  isActive,
  plan,
  isExecuting,
  className,
}: MashupGenerationProgressProps): React.ReactElement {
  const [phase1SubStep, setPhase1SubStep] = useState(0)
  const [phase2SubStep, setPhase2SubStep] = useState(0)
  const [activeMessageIndex, setActiveMessageIndex] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const startTimeRef = useRef(Date.now())
  const phase2StartRef = useRef<number | null>(null)
  const messageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Phase 1: advance from step 0 (fetching) to step 1 (planning) after ~4s
  useEffect(() => {
    if (plan) return
    const timer = setTimeout(() => setPhase1SubStep(1), GENERATION_STEPS[0].durationMs)
    return () => clearTimeout(timer)
  }, [plan])

  // Phase 2: advance through steps 2-4 on estimated timing
  useEffect(() => {
    if (!isExecuting || !plan) return
    if (!phase2StartRef.current) phase2StartRef.current = Date.now()

    const tick = setInterval(() => {
      const elapsed = Date.now() - phase2StartRef.current!
      const step2Dur = GENERATION_STEPS[2].durationMs
      const step3Dur = GENERATION_STEPS[3].durationMs

      if (elapsed < step2Dur) {
        setPhase2SubStep(0)
      } else if (elapsed < step2Dur + step3Dur) {
        setPhase2SubStep(1)
      } else {
        setPhase2SubStep(2)
      }
    }, 500)

    return () => clearInterval(tick)
  }, [isExecuting, plan])

  // Elapsed time ticker
  useEffect(() => {
    if (!isActive) return
    const tick = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current)
    }, 500)
    return () => clearInterval(tick)
  }, [isActive])

  // Compute the active step index across all 5 steps
  const getActiveStepIndex = useCallback((): number => {
    if (!plan) return phase1SubStep
    if (!isExecuting) return 2
    return 2 + phase2SubStep
  }, [plan, isExecuting, phase1SubStep, phase2SubStep])

  const activeStepIndex = getActiveStepIndex()

  // Cycle sub-messages for the currently active step
  useEffect(() => {
    if (messageIntervalRef.current) clearInterval(messageIntervalRef.current)

    const step = GENERATION_STEPS[activeStepIndex]
    if (!step) return
    setActiveMessageIndex(0)

    messageIntervalRef.current = setInterval(() => {
      setActiveMessageIndex((prev) => (prev + 1) % step.messages.length)
    }, 3_500)

    return () => {
      if (messageIntervalRef.current) clearInterval(messageIntervalRef.current)
    }
  }, [activeStepIndex])

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="pt-6 space-y-6">
        {/* Concept sketch: what we are building */}
        <div className="rounded-xl bg-muted/40 border border-border p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-international-orange-light flex items-center justify-center shrink-0">
              <Combine className="h-4 w-4 text-international-orange" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold text-foreground">
                Building your mashup
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed italic">
                &ldquo;{concept}&rdquo;
              </p>
            </div>
          </div>

          {/* Source part thumbnails with + signs between them */}
          <div className="flex items-center gap-2 flex-wrap pl-11">
            {sources.map((source, i) => (
              <div key={`${source.name}-${i}`} className="flex items-center gap-2">
                {i > 0 && (
                  <span className="text-muted-foreground text-base font-light select-none">+</span>
                )}
                <div className="flex flex-col items-center gap-1">
                  <div className="h-12 w-12 rounded-lg overflow-hidden bg-background flex items-center justify-center border border-border shadow-sm">
                    {source.thumbnail_url ? (
                      <Image
                        src={source.thumbnail_url}
                        alt={source.name}
                        width={48}
                        height={48}
                        className="h-full w-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <FileBox className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground text-center leading-tight max-w-[56px] truncate">
                    {source.description ?? source.name}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Plan details card -- appears when real plan arrives from server */}
        {plan && (
          <div className="rounded-xl border border-status-success/30 bg-status-success-light/30 p-4 space-y-3 animate-fade-in">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-status-success" />
              <p className="text-sm font-semibold text-foreground">
                Mashup plan ready
              </p>
            </div>
            <div className="space-y-2 pl-6">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Strategy:</span>{" "}
                {STRATEGY_LABELS[plan.strategy] ?? plan.strategy}
              </p>
              {plan.steps.map((s, i) => (
                <div key={`plan-step-${i}`} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="font-mono text-[10px] bg-muted rounded px-1 py-0.5 shrink-0">
                    {i + 1}
                  </span>
                  <span>
                    <span className="font-medium text-foreground">{s.source}</span>
                    {" \u2192 "}
                    {s.action}
                    {s.detail && <span className="italic"> &mdash; {s.detail}</span>}
                  </span>
                </div>
              ))}
              {plan.notes && (
                <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2 mt-1">
                  {plan.notes}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Vertical step timeline */}
        <div className="relative pl-4">
          <div className="absolute left-[1.9375rem] top-4 bottom-4 w-px bg-border" />

          <div className="space-y-0">
            {GENERATION_STEPS.map((step, i) => {
              const StepIcon = step.icon
              const isCompleted = i < activeStepIndex
              const isCurrent = i === activeStepIndex
              const isPending = i > activeStepIndex

              return (
                <div key={step.id} className="relative flex gap-3.5 py-3">
                  <div
                    className={cn(
                      "relative z-10 h-7 w-7 rounded-full flex items-center justify-center shrink-0 transition-all duration-500",
                      isCompleted && "bg-status-success-light ring-2 ring-status-success/20",
                      isCurrent && "bg-international-orange-light ring-2 ring-international-orange/20",
                      isPending && "bg-muted",
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
                    ) : isCurrent ? (
                      <Loader2 className="h-3.5 w-3.5 text-international-orange animate-spin" />
                    ) : (
                      <StepIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 pt-0.5">
                    <p
                      className={cn(
                        "text-sm font-medium transition-colors duration-300",
                        isCompleted && "text-foreground",
                        isCurrent && "text-foreground",
                        isPending && "text-muted-foreground",
                      )}
                    >
                      {step.label}
                      {isCompleted && (
                        <span className="ml-2 text-xs font-normal text-status-success">Done</span>
                      )}
                    </p>

                    {isCurrent && (
                      <p
                        key={`${step.id}-msg-${activeMessageIndex}`}
                        className="text-xs text-muted-foreground mt-0.5 animate-fade-in"
                      >
                        {step.messages[activeMessageIndex]}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Elapsed timer */}
        <div className="flex items-center justify-center gap-2 pt-2 border-t border-border">
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Elapsed: {Math.round(elapsedMs / 1000)}s
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
