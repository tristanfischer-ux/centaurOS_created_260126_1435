/**
 * @file scan-hero.tsx — Idea input + scan CTA with educational progress
 *
 * @description Compact card for entering a product idea and triggering
 * the scan. Shows the derived function statement as a blockquote.
 * After a scan exists, offers "Fresh Re-scan" and "Refine with changes"
 * options so users can iterate on their idea.
 *
 * While scanning is in progress, displays an animated educational explainer
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

/** Steps shown during a fresh scan — explains the full reverse-engineering process */
const SCAN_INSIGHTS: InsightStep[] = [
  {
    icon: Search,
    title: "Analysing your concept",
    description:
      "Breaking down your idea into its core engineering challenge — what physical transformation needs to happen?",
  },
  {
    icon: Layers,
    title: "Identifying subsystems",
    description:
      "Every machine is a collection of modules. We're mapping the distinct physical sub-assemblies your product needs.",
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

interface ScanProgressExplainerProps {
  /** Whether this is a refine (true) or fresh scan (false) */
  isRefine: boolean
}

/**
 * ScanProgressExplainer — Animated educational progress during AI scanning.
 *
 * @description Cycles through insight steps explaining each phase of the
 * reverse-engineering process, plus a "what happens next" preview. Turns
 * wait time into a learning moment about how product engineering works.
 *
 * @param props.isRefine - Shows refine-specific messages when true
 */
function ScanProgressExplainer({ isRefine }: ScanProgressExplainerProps): React.ReactNode {
  const insights = isRefine ? REFINE_INSIGHTS : SCAN_INSIGHTS
  const [currentIndex, setCurrentIndex] = useState(0)

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
  /** Whether a scan is in progress */
  isScanning: boolean
  /** Whether a completed spec already exists (modules.length > 0) */
  hasExistingSpec: boolean
  /** Called when user clicks scan (fresh, from-scratch scan) */
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
 * @description Clean idea input with scan button. Before any scan exists,
 * shows a single "Scan & reverse engineer" CTA. After a scan exists,
 * shows two options: "Fresh Re-scan" (with confirmation) and "Refine
 * with changes" (sends existing spec + updated idea to AI).
 *
 * While scanning, an educational explainer cycles through messages
 * explaining each phase of the reverse-engineering process.
 */
export function ScanHero({
  idea,
  functionStatement,
  isScanning,
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
            /* Post-scan: two options for iterating */
            <div className="flex gap-3">
              <Button
                onClick={() => setShowRescanConfirm(true)}
                disabled={isScanning || !localIdea.trim()}
                variant="secondary"
                className="flex-1 h-11"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Fresh re-scan
                  </>
                )}
              </Button>
              <Button
                onClick={handleRefine}
                disabled={isScanning || !localIdea.trim()}
                className="flex-1 bg-international-orange hover:bg-international-orange-hover text-white h-11"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Refining...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Refine with changes
                  </>
                )}
              </Button>
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
                  Scanning your idea...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Scan &amp; reverse engineer
                </>
              )}
            </Button>
          )}

          {/* Educational progress explainer — shown while scanning */}
          {isScanning && (
            <ScanProgressExplainer isRefine={lastActionWasRefine && hasExistingSpec} />
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

      {/* Confirmation dialog for fresh re-scan (destructive: replaces all data) */}
      <AlertDialog open={showRescanConfirm} onOpenChange={setShowRescanConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a fresh re-scan?</AlertDialogTitle>
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
