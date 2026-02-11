/**
 * @file scan-hero.tsx — Idea input + scan CTA
 *
 * @description Compact card for entering a product idea and triggering
 * the AI scan. Shows the AI-derived function statement as a blockquote.
 */

"use client"

import React, { useState, useEffect } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Zap, Loader2 } from "lucide-react"

// ─── Props ───────────────────────────────────────────────────────────

interface ScanHeroProps {
  /** Current idea text */
  idea: string
  /** AI-derived function statement (shown after scan) */
  functionStatement: string
  /** Whether a scan is in progress */
  isScanning: boolean
  /** Called when user clicks scan */
  onScan: (idea: string) => void
  /** Called when user edits the idea */
  onIdeaChange: (idea: string) => void
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * ScanHero — The first section of the X-Ray dossier.
 *
 * @description Clean idea input with scan button. After scanning,
 * displays the AI-derived function statement as a blockquote.
 */
export function ScanHero({
  idea,
  functionStatement,
  isScanning,
  onScan,
  onIdeaChange,
}: ScanHeroProps): React.ReactNode {
  const [localIdea, setLocalIdea] = useState(idea)

  useEffect(() => {
    setLocalIdea(idea)
  }, [idea])

  const handleChange = (value: string): void => {
    setLocalIdea(value)
    onIdeaChange(value)
  }

  return (
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
            Describe your product concept. AI will reverse-engineer it into modules, experts, and suppliers.
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

        {functionStatement && (
          <blockquote className="border-l-4 border-international-orange/40 pl-4 py-2 bg-muted/20 rounded-r-lg">
            <p className="text-sm text-foreground leading-relaxed italic">
              {functionStatement}
            </p>
          </blockquote>
        )}
      </CardContent>
    </Card>
  )
}
