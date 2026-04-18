'use client'

/**
 * KnowledgeOnboarding — Replaces the generic empty state with a guided
 * onboarding flow when the Knowledge Vault has zero notes.
 *
 * @description Shows a hero section, two action cards (upload / talk), and a
 * progress indicator with level thresholds. Designed to feel optimistic and
 * encourage the first knowledge deposit.
 *
 * @component
 */

import { Brain, FileText, MessageSquare, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DocumentUploadZone } from './document-upload-zone'

// ─── Progress Thresholds ─────────────────────────────────────────────

interface Level {
  min: number
  max: number
  label: string
}

const LEVELS: Level[] = [
  { min: 0, max: 10, label: 'Getting started' },
  { min: 10, max: 25, label: 'Building momentum' },
  { min: 25, max: 50, label: 'Growing library' },
  { min: 50, max: 100, label: 'Comprehensive' },
]

function getCurrentLevel(noteCount: number): Level {
  return LEVELS.find((l) => noteCount < l.max) ?? LEVELS[LEVELS.length - 1]
}

// ─── Component ───────────────────────────────────────────────────────

interface KnowledgeOnboardingProps {
  onNoteCreated: () => void
}

export function KnowledgeOnboarding({ onNoteCreated }: KnowledgeOnboardingProps) {
  const noteCount = 0
  const level = getCurrentLevel(noteCount)
  const progressPercent = Math.min(100, (noteCount / level.max) * 100)

  return (
    <div className="space-y-8 py-8 max-w-3xl mx-auto">
      {/* ── Hero Section ────────────────────────────────────────── */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-international-orange/10">
            <Brain className="h-8 w-8 text-international-orange" />
          </div>
        </div>
        <h2 className="text-2xl font-display font-bold tracking-tight text-foreground">
          Your Knowledge Vault
        </h2>
        <p className="text-muted-foreground text-base leading-relaxed max-w-xl mx-auto">
          Your specialists draw on everything here when they answer you. Upload the
          documents you find yourself sending most often and add decisions as they&apos;re
          made — each one gives the next answer more context.
        </p>
      </div>

      {/* ── Action Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Card 1: Upload a Document */}
        <Card className="relative overflow-hidden">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-international-orange/10">
                <FileText className="h-5 w-5 text-international-orange" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                Upload a Document
              </h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Upload your pitch deck, business plan, or financial model. Your
              specialists will reference it in every conversation.
            </p>
            <DocumentUploadZone onExtractionComplete={onNoteCreated} />
          </CardContent>
        </Card>

        {/* Card 2: Talk to a Specialist */}
        <Card className="relative overflow-hidden">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                Talk to a Specialist
              </h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Every specialist conversation automatically creates knowledge notes.
              Start a conversation to begin building your vault.
            </p>
            <Button variant="outline" asChild className="w-full">
              <Link href="/agents">
                <MessageSquare className="h-4 w-4 mr-2" />
                Browse Specialists
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ── Progress Indicator ──────────────────────────────────── */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                {noteCount} notes in your vault
              </span>
            </div>
            <Badge variant="secondary" className="text-xs">
              {level.label}
            </Badge>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-international-orange transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Next milestone: {level.max} notes
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
