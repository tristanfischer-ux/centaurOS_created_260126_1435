/**
 * @file scan-hero.tsx — Idea input + scan CTA
 *
 * @description Compact card for entering a product idea and triggering
 * the scan. Shows the derived function statement as a blockquote.
 * After a scan exists, offers "Fresh Re-scan" and "Refine with changes"
 * options so users can iterate on their idea.
 */

"use client"

import React, { useState, useEffect } from "react"

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
import { Zap, Loader2, RefreshCw, Sparkles } from "lucide-react"

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

  useEffect(() => {
    setLocalIdea(idea)
  }, [idea])

  const handleChange = (value: string): void => {
    setLocalIdea(value)
    onIdeaChange(value)
  }

  const handleFreshRescan = (): void => {
    setShowRescanConfirm(false)
    onScan(localIdea)
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
                onClick={() => onRefine(localIdea)}
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

          {functionStatement && (
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
