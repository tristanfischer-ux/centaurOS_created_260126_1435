'use client'

/**
 * @file document-upload-prompt.tsx
 *
 * @description A subtle, dismissible banner encouraging users to upload documents
 * relevant to a specific knowledge domain. Dismissal state persists in localStorage.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { FileUp, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface DocumentUploadPromptProps {
  /** Knowledge domain this prompt relates to (e.g. "finance", "strategy") */
  domain: string
  /** What to upload (e.g. "financial model", "pitch deck") */
  suggestion: string
  /** Specialist who benefits (e.g. "Finn", "Sage") */
  specialistName: string
}

const DISMISS_KEY_PREFIX = 'forgeos-upload-prompt-dismissed-'

export function DocumentUploadPrompt({
  domain,
  suggestion,
  specialistName,
}: DocumentUploadPromptProps) {
  const [dismissed, setDismissed] = useState(true) // default hidden until hydrated

  useEffect(() => {
    const key = `${DISMISS_KEY_PREFIX}${domain}`
    setDismissed(localStorage.getItem(key) === 'true')
  }, [domain])

  if (dismissed) return null

  const handleDismiss = () => {
    const key = `${DISMISS_KEY_PREFIX}${domain}`
    localStorage.setItem(key, 'true')
    setDismissed(true)
  }

  return (
    <Card className="bg-muted/30 border-border/50">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-international-orange/10">
            <FileUp className="h-4 w-4 text-international-orange" />
          </div>
          <p className="text-sm text-muted-foreground flex-1">
            Upload your {suggestion} for better advice from {specialistName}.{' '}
            <Link
              href="/knowledge"
              className="text-international-orange hover:underline font-medium"
            >
              Go to Knowledge
            </Link>
          </p>
          <button
            onClick={handleDismiss}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss upload prompt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
