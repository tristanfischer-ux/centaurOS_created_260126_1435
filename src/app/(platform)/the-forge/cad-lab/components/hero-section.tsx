"use client"

/**
 * @file hero-section.tsx — Primary input area for The Forge pipeline.
 *
 * @description Focused entry point: a single prominent input for describing
 * what to build, an inline Research button, and quick-start templates.
 * Replaces the previous marketing-heavy hero with a clean action-first layout.
 */

import { useState, useMemo } from "react"
import { Search, ArrowRight, Loader2, RotateCcw, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { InputWithSpeech } from "@/components/ui/input-with-speech"
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
import { BriefSpecialistDialog } from "@/app/(platform)/agents/brief-specialist-dialog"
import { getSpecialistById } from "@/lib/agents/specialists-config"
import { ReferenceModelViewer } from "./reference-model-viewer"
import { ReferenceImageUpload } from "./reference-image-upload"
import { ReferenceDocumentUpload } from "./reference-document-upload"
import type { ReferenceModel } from "@/actions/reference-models"
import type { ReferenceImageFile } from "@/lib/cad-lab/reference-image-types"
import type { ReferenceDocumentFile } from "@/lib/cad-lab/reference-document-types"

// ─── Example prompt chips ────────────────────────────────────────────

const EXAMPLE_PROMPTS = [
  "CubeSat frame",
  "Drone arm bracket",
  "Reaction wheel housing",
  "EV battery enclosure",
  "Robotic gripper",
]

// ─── Component ───────────────────────────────────────────────────────

interface HeroSectionProps {
  /** Current product subject text */
  subject: string
  /** Callback to update the subject input */
  setSubject: (value: string) => void
  /** Matched reference model for instant visual (from matchReferenceModel) */
  referenceModel?: ReferenceModel | null
  /** Whether any operation is currently loading */
  isAnyLoading: boolean
  /** Whether research is currently in progress */
  isResearching: boolean
  /** Whether research has already completed */
  hasResearch: boolean
  /** Trigger the research action */
  onResearch: () => void
  /** Current interview phase — controls collapse behavior */
  interviewPhase?: "idle" | "interviewing" | "synthesizing" | "complete"
  /** Start the design brief interview (first research only) */
  onStartInterview?: () => void
  /** User-uploaded reference images */
  referenceImages?: ReferenceImageFile[]
  /** Callback to update reference images */
  onReferenceImagesChange?: (images: ReferenceImageFile[]) => void
  /** User-uploaded reference documents */
  referenceDocuments?: ReferenceDocumentFile[]
  /** Callback to update reference documents */
  onReferenceDocumentsChange?: (documents: ReferenceDocumentFile[]) => void
}

/**
 * HeroSection — Focused entry point with product input, research button,
 * and quick-start templates. No marketing fluff — just the action.
 */
export function HeroSection({
  subject,
  setSubject,
  referenceModel,
  isAnyLoading,
  isResearching,
  hasResearch,
  onResearch,
  interviewPhase = "idle",
  onStartInterview,
  referenceImages,
  onReferenceImagesChange,
  referenceDocuments,
  onReferenceDocumentsChange,
}: HeroSectionProps): React.ReactNode {
  const subjectTrimmed = subject.trim().length > 0
  const [isSpecialistOpen, setIsSpecialistOpen] = useState(false)
  const [isConfirmReResearchOpen, setIsConfirmReResearchOpen] = useState(false)
  const fang = useMemo(() => getSpecialistById("vp-manufacturing"), [])

  const specialistContext = subject.trim()
    ? `The user is designing a product in The Forge. So far they've described it as: "${subject}". Help them refine this into a clear, manufacturing-focused engineering brief — think about materials, process, tolerance, and scale.`
    : `The user is about to describe a product they want to build in The Forge engineering pipeline. Help them think through what to build and how to describe it clearly for manufacturing research.`

  const isInterviewing = interviewPhase === "interviewing" || interviewPhase === "synthesizing"

  // INTENT: During interview, collapse to a compact read-only bar showing the subject.
  if (isInterviewing) {
    return (
      <div className="rounded-xl border bg-card px-5 py-3 flex items-center gap-3">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-foreground truncate flex-1">{subject}</span>
      </div>
    )
  }

  // INTENT: First-time research triggers interview; re-research skips it.
  const handleResearchClick = () => {
    if (hasResearch) {
      setIsConfirmReResearchOpen(true)
    } else if (onStartInterview) {
      onStartInterview()
    } else {
      onResearch()
    }
  }

  return (
    <div className="space-y-6">
      {/* Primary input card */}
      <div className="rounded-xl border bg-card p-6 sm:p-8 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            What do you want to build?
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Describe any physical product or sub-assembly. The system will research real-world
            specs and generate concept-level parametric CAD to help you explore ideas—always
            have outputs checked by qualified people; use the marketplace to recruit experts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <InputWithSpeech
              id="subject"
              enableSpeech
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onSpeechTranscript={(text) => setSubject(subject ? subject + " " + text : text)}
              placeholder="e.g., 1U CubeSat bus structure, EV battery module enclosure, 6-DOF robotic arm joint"
              className="pl-10 h-12 text-base"
              disabled={isAnyLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && subjectTrimmed && !isAnyLoading) {
                  handleResearchClick()
                }
              }}
            />
          </div>
          <Button
            id="research-btn"
            onClick={handleResearchClick}
            disabled={isAnyLoading || !subjectTrimmed}
            size="lg"
            variant={hasResearch ? "secondary" : "default"}
            className="gap-2 h-12 px-6 shrink-0"
          >
            {isResearching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Researching...
              </>
            ) : hasResearch ? (
              <>
                <RotateCcw className="h-4 w-4" />
                Re-Research
              </>
            ) : (
              <>
                Research
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
          {isResearching && (
            <span className="text-xs text-muted-foreground shrink-0">~30-60s</span>
          )}
        </div>

        {/* Reference image upload (compact) */}
        {referenceImages && onReferenceImagesChange && (
          <ReferenceImageUpload
            images={referenceImages}
            onImagesChange={onReferenceImagesChange}
            variant="compact"
            disabled={isResearching}
          />
        )}

        {/* Reference document upload (compact) */}
        {referenceDocuments && onReferenceDocumentsChange && (
          <ReferenceDocumentUpload
            documents={referenceDocuments}
            onDocumentsChange={onReferenceDocumentsChange}
            variant="compact"
            disabled={isResearching}
          />
        )}

        {/* Example prompt chips */}
        {!hasResearch && !isResearching && !subjectTrimmed && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Try:</span>
            {EXAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => setSubject(prompt)}
                className="text-xs px-2.5 py-1 rounded-full border border-muted bg-muted/50 text-muted-foreground hover:border-international-orange/40 hover:text-foreground transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        {!hasResearch && !isResearching && fang && (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setIsSpecialistOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Sparkles className="h-3 w-3 text-international-orange" />
              Not sure how to describe it? Ask {fang.name}
            </button>
          </div>
        )}

        {referenceModel?.stlUrl && !hasResearch && !isResearching && (
          <div className="pt-2">
            <ReferenceModelViewer stlUrl={referenceModel.stlUrl} minHeight={220} />
          </div>
        )}
      </div>


      {fang && (
        <BriefSpecialistDialog
          specialist={fang}
          open={isSpecialistOpen}
          onOpenChange={setIsSpecialistOpen}
          handoffContext={specialistContext}
          contextLabel="Design Brief"
        />
      )}

      <AlertDialog open={isConfirmReResearchOpen} onOpenChange={setIsConfirmReResearchOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-run research?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace your current research results and any modules built from them.
              Generated CAD files will also be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setIsConfirmReResearchOpen(false); onResearch() }}>
              Re-Research
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
