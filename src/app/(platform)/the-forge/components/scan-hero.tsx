/**
 * @file scan-hero.tsx — Idea input + create CTA with educational progress
 *
 * @description Compact card for entering a product idea and triggering
 * concept creation. Shows the derived function statement as a blockquote.
 * After a concept exists, offers "Start over" and "Refine with changes"
 * options so users can iterate on their idea.
 *
 * While creation is in progress, displays an animated educational explainer
 * that cycles through messages describing each stage of the reverse-engineering
 * process. This turns the wait into a learning moment about systems engineering.
 */

"use client"

import React, { useState, useEffect } from "react"

import { AnimatePresence, motion } from "framer-motion"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Zap,
  Loader2,
  RefreshCw,
  Sparkles,
  Search,
  Layers,
  GitBranch,
  ShieldAlert,
  ClipboardList,
  Package,
  ArrowRight,
  Diff,
  CheckCircle2,
  Puzzle,
  Globe,
} from "lucide-react"

// ─── Educational Progress Steps ─────────────────────────────────────

interface InsightStep {
  /** Lucide icon component */
  icon: React.ElementType
  /** Short title for this stage */
  title: string
  /** Educational description of what's happening */
  description: string
}

/** Steps shown during the research phase — explains the web search + synthesis */
const RESEARCH_INSIGHTS: InsightStep[] = [
  {
    icon: Search,
    title: "Searching the web",
    description:
      "Finding existing products, specifications, competitors, and engineering standards related to your concept.",
  },
  {
    icon: Globe,
    title: "Gathering real-world data",
    description:
      "Collecting materials, dimensions, pricing, and manufacturer details from multiple sources across the web.",
  },
  {
    icon: ClipboardList,
    title: "Synthesizing findings",
    description:
      "Turning raw web research into a structured engineering brief — specs, challenges, standards, and market context.",
  },
]

/** Steps shown during the module creation phase — explains the AI decomposition */
const SCAN_INSIGHTS: InsightStep[] = [
  {
    icon: Layers,
    title: "Creating your modules",
    description:
      "Using the research data to identify the distinct physical sub-assemblies your product needs — grounded in real specs.",
  },
  {
    icon: GitBranch,
    title: "Mapping material flows",
    description:
      "What goes in, what comes out — tracing the input-output chain so each module's interface is clearly defined.",
  },
  {
    icon: ShieldAlert,
    title: "Finding the gating module",
    description:
      "One module defines your entire design. Until it's specified, supplier quotes for everything else are meaningless.",
  },
  {
    icon: ClipboardList,
    title: "Generating diagnostic questions",
    description:
      "For your critical module, we're creating questions that collapse the design space — answering them unlocks real quotes.",
  },
  {
    icon: Package,
    title: "Cataloguing components & risks",
    description:
      "Listing specific parts, failure modes, and expert questions — the kind of detail you'd need for a real design review.",
  },
]

/** Steps shown during a refine — explains the incremental update process */
const REFINE_INSIGHTS: InsightStep[] = [
  {
    icon: Diff,
    title: "Comparing your changes",
    description:
      "Reviewing what you've updated and figuring out which modules are affected by the revised concept.",
  },
  {
    icon: CheckCircle2,
    title: "Preserving existing work",
    description:
      "Modules that haven't changed keep their images, supplier data, and diagnostic answers — nothing is lost.",
  },
  {
    icon: Puzzle,
    title: "Updating affected modules",
    description:
      "Adding, removing, or modifying modules so the system matches your revised idea while staying internally consistent.",
  },
  {
    icon: GitBranch,
    title: "Re-validating material flows",
    description:
      "Ensuring every module's inputs and outputs still chain together logically after the changes.",
  },
  {
    icon: Package,
    title: "Refreshing components & risks",
    description:
      "Updating key parts, failure modes, and expert questions for any modules that were modified.",
  },
]

/** What-happens-next steps shown below the cycling insight */
const NEXT_STEPS = [
  "Review the engineering breakdown of your product",
  "Answer diagnostic questions to lock in the core design",
  "Generate technical illustrations for each module",
  "Connect with domain experts and source suppliers",
]

/** Interval (ms) between cycling to the next insight step */
const INSIGHT_CYCLE_MS = 4500

// ─── ScanProgressExplainer ──────────────────────────────────────────

type CreatePhase = "idle" | "researching" | "creating"

interface ScanProgressExplainerProps {
  /** Whether this is a refine (true) or fresh scan (false) */
  isRefine: boolean
  /** Current creation phase — drives which insight set to show */
  createPhase?: CreatePhase
}

/**
 * ScanProgressExplainer — Animated educational progress during AI scanning.
 *
 * @description Cycles through insight steps explaining each phase of the
 * reverse-engineering process, plus a "what happens next" preview. Turns
 * wait time into a learning moment about how product engineering works.
 *
 * For fresh scans, shows two sequential phases:
 * 1. "Researching your product..." — web search + synthesis insights
 * 2. "Creating your modules..." — AI decomposition insights
 *
 * @param props.isRefine - Shows refine-specific messages when true
 * @param props.createPhase - Current phase of the creation flow
 */
function ScanProgressExplainer({ isRefine, createPhase }: ScanProgressExplainerProps): React.ReactNode {
  const insights = isRefine
    ? REFINE_INSIGHTS
    : createPhase === "researching"
      ? RESEARCH_INSIGHTS
      : SCAN_INSIGHTS
  const [currentIndex, setCurrentIndex] = useState(0)

  // Reset index when the phase (and therefore the insights set) changes
  useEffect(() => {
    setCurrentIndex(0)
  }, [createPhase])

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % insights.length)
    }, INSIGHT_CYCLE_MS)
    return () => clearInterval(timer)
  }, [insights.length])

  const current = insights[currentIndex]
  const Icon = current.icon

  return (
    <div className="space-y-5 pt-2">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1.5">
        {insights.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              i === currentIndex
                ? "w-6 bg-international-orange"
                : i < currentIndex
                  ? "w-1.5 bg-international-orange/40"
                  : "w-1.5 bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Cycling insight card */}
      <div className="relative min-h-[88px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="flex items-start gap-3 rounded-lg bg-muted/30 px-4 py-3"
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-international-orange/10">
              <Icon className="h-4 w-4 text-international-orange" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-foreground">{current.title}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {current.description}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* What happens next */}
      <div className="rounded-lg border border-dashed border-muted-foreground/20 px-4 py-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          What happens next
        </p>
        <ol className="space-y-1.5">
          {NEXT_STEPS.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <ArrowRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-international-orange/60" />
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

// ─── Props ───────────────────────────────────────────────────────────

interface ScanHeroProps {
  /** Current idea text */
  idea: string
  /** AI-derived function statement (shown after scan) */
  functionStatement: string
  /** Whether concept creation is in progress */
  isScanning: boolean
  /** Current phase of the creation flow (for progress UI) */
  createPhase?: CreatePhase
  /** Whether a completed spec already exists (modules.length > 0) */
  hasExistingSpec: boolean
  /** Called when user clicks create (fresh, from-scratch creation) */
  onScan: (idea: string) => void
  /** Called when user wants to refine the existing spec with an updated idea */
  onRefine: (idea: string) => void
  /** Called when user edits the idea */
  onIdeaChange: (idea: string) => void
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * ScanHero — The first section of the X-Ray dossier.
 *
 * @description Clean idea input with create button. Before any concept exists,
 * shows a single "Create concept" CTA. After a concept exists,
 * shows two options: "Start over" (with confirmation) and "Refine
 * with changes" (sends existing spec + updated idea to AI).
 *
 * While creating, an educational explainer cycles through messages
 * explaining each phase of the reverse-engineering process.
 */
export function ScanHero({
  idea,
  functionStatement,
  isScanning,
  createPhase,
  hasExistingSpec,
  onScan,
  onRefine,
  onIdeaChange,
}: ScanHeroProps): React.ReactNode {
  const [localIdea, setLocalIdea] = useState(idea)
  const [showRescanConfirm, setShowRescanConfirm] = useState(false)
  // Track whether the last action was a refine (vs fresh scan) for insight messages
  const [lastActionWasRefine, setLastActionWasRefine] = useState(false)

  useEffect(() => {
    setLocalIdea(idea)
  }, [idea])

  const handleChange = (value: string): void => {
    setLocalIdea(value)
    onIdeaChange(value)
  }

  const handleFreshRescan = (): void => {
    setShowRescanConfirm(false)
    setLastActionWasRefine(false)
    onScan(localIdea)
  }

  const handleRefine = (): void => {
    setLastActionWasRefine(true)
    onRefine(localIdea)
  }

  return (
    <>
      <Card className="rounded-xl shadow-sm border">
        <CardContent className="pt-6 pb-6 space-y-5">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-1 h-7 bg-international-orange rounded-full" />
              <h2 className="text-xl font-display font-bold tracking-tight text-foreground">
                What do you want to build?
              </h2>
            </div>
            <p className="text-sm text-muted-foreground pl-[1.375rem]">
              Describe your product concept and we&apos;ll create a first-draft engineering system for it — then use it to connect with experts and suppliers who can help bring it to life.
            </p>
          </div>

          <Textarea
            value={localIdea}
            onChange={(e) => handleChange(e.target.value)}
            disabled={isScanning}
            rows={3}
            className="resize-none text-base"
            placeholder="e.g. A brine processing machine that extracts lithium salts from desalination brine"
          />

          {hasExistingSpec ? (
            /* Post-scan: two clearly-described options for iterating */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Fresh re-scan option */}
              <button
                type="button"
                onClick={() => setShowRescanConfirm(true)}
                disabled={isScanning || !localIdea.trim()}
                className="group flex flex-col items-center gap-1.5 rounded-lg border border-input bg-background px-4 py-3 text-center transition-colors hover:border-muted-foreground/40 hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-50"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {isScanning && !lastActionWasRefine ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {isScanning && !lastActionWasRefine ? "Creating..." : "Start over"}
                </span>
                <span className="text-xs leading-snug text-muted-foreground">
                  Start over from scratch. Replaces all existing modules and data.
                </span>
              </button>

              {/* Refine with changes option */}
              <button
                type="button"
                onClick={handleRefine}
                disabled={isScanning || !localIdea.trim()}
                className="group flex flex-col items-center gap-1.5 rounded-lg border-2 border-international-orange/60 bg-international-orange/5 px-4 py-3 text-center transition-colors hover:bg-international-orange/10 disabled:pointer-events-none disabled:opacity-50"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-international-orange">
                  {isScanning && lastActionWasRefine ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {isScanning && lastActionWasRefine ? "Refining..." : "Refine with changes"}
                </span>
                <span className="text-xs leading-snug text-muted-foreground">
                  Keep your existing work. Only updates modules affected by your edits.
                </span>
              </button>
            </div>
          ) : (
            /* First scan: single CTA */
            <Button
              onClick={() => onScan(localIdea)}
              disabled={isScanning || !localIdea.trim()}
              className="w-full bg-international-orange hover:bg-international-orange-hover text-white h-11"
            >
              {isScanning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {createPhase === "researching"
                    ? "Researching your product..."
                    : "Creating your modules..."}
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Create concept
                </>
              )}
            </Button>
          )}

          {/* Educational progress explainer — shown while scanning */}
          {isScanning && (
            <ScanProgressExplainer
              isRefine={lastActionWasRefine && hasExistingSpec}
              createPhase={createPhase}
            />
          )}

          {functionStatement && !isScanning && (
            <blockquote className="border-l-4 border-international-orange/40 pl-4 py-2 bg-muted/20 rounded-r-lg">
              <p className="text-sm text-foreground leading-relaxed italic">
                {functionStatement}
              </p>
            </blockquote>
          )}
        </CardContent>
      </Card>

      {/* Confirmation dialog for starting over (destructive: replaces all data) */}
      <AlertDialog open={showRescanConfirm} onOpenChange={setShowRescanConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start over from scratch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace all existing modules, diagnostic answers, images, and
              analysis with a completely new result. This cannot be undone.
              If you want to keep your existing work and just update it, use
              &ldquo;Refine with changes&rdquo; instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleFreshRescan}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, replace everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
