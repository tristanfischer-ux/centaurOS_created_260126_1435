"use client"

/**
 * @file PressureTestModal.tsx — Inline pressure-test modal
 *
 * @description Launched from `/plan/goal/[id]` (and later from the report
 * composer). Runs a multi-round red-team debate against a Strategic Goal
 * (or other subject) by streaming `/api/red-team/generate` — the same SSE
 * endpoint the legacy Red Team page uses — and persists the final debate
 * into `pressure_test_sessions` via `closePressureTest()`.
 *
 * Copy rule (CLAUDE.md "No AI Emphasis"): these are STRESS-TEST ROLES,
 * never "AI personas". The modal itself avoids "AI-powered / agents / smart".
 *
 * Layout — per PLAN-MOCKUP-PRESSURE-TEST spec:
 *   Header: subject summary + persona avatars + round counter
 *   Body:   transcript — each message tagged with persona + auto-scroll
 *   Footer: "Interject" textarea + "Run next round" button
 *           Verdict reached → verdict chip + "Save debate" primary CTA
 *
 * SSE state machine:
 *   idle → starting (creating session row) → streaming (SSE open)
 *        → round_complete (SSE closed, waiting for resume) → streaming (resume)
 *        → complete (verdict received) → closed (after Save debate)
 *   Any step → error (show inline error + retry)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Markdown } from "@/components/ui/markdown"
import { cn } from "@/lib/utils"
import {
  PersonaBadge,
  PRESSURE_PERSONA_ORDER,
  getPressurePersona,
  type PressurePersonaRole,
} from "./persona-badge"
import {
  startPressureTest,
  closePressureTest,
  type PressureTestSubject,
} from "@/actions/plan/pressure-test"
import type { PressureVerdict, PressureTranscriptMessage } from "@/types/plan"

// ──────────────────────────────────────────────────────────────────────────
// 1 · Types
// ──────────────────────────────────────────────────────────────────────────

interface PressureTestModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Strategic Goal id, if tested against a goal (subject_type='goal'). */
  goalId?: string
  /**
   * Frozen snapshot of the subject at debate start. Must include a `topic`
   * string (>=10 chars) — this is what the SSE endpoint stress-tests.
   * Optional `title` / `summary` are used to render the header.
   */
  subjectSnapshot: {
    topic?: string
    title?: string
    summary?: string
    context?: string
    [key: string]: unknown
  }
}

type ModalState =
  | "idle"
  | "starting"
  | "streaming"
  | "round_complete"
  | "complete"
  | "error"

interface TranscriptLine {
  id: string
  round: number
  persona: string
  /** Optional character name from the SSE (e.g. "Sage" for bull). */
  characterName?: string
  /** Streamed content — may grow over time for the currently active persona. */
  content: string
  /** Has the persona finished speaking this round? */
  complete: boolean
  /** Founder interjection (renders differently). */
  isInterjection?: boolean
}

/** Minimal resume state we receive on `awaiting_input` and re-POST. */
interface ResumeState {
  priorRounds: unknown[]
  priorTranscript: string
  evidencePack?: string
  evidenceItems?: unknown[]
  customQuestions?: string[]
  userInputs?: Record<number, string>
  totalCostSoFar?: number
  debateId?: string
}

// ──────────────────────────────────────────────────────────────────────────
// 2 · Component
// ──────────────────────────────────────────────────────────────────────────

export function PressureTestModal({
  open,
  onOpenChange,
  goalId,
  subjectSnapshot,
}: PressureTestModalProps) {
  const [state, setState] = useState<ModalState>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentRound, setCurrentRound] = useState(0)
  const totalRounds = 3 // matches DEBATE_ROUNDS default in /api/red-team/generate
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [resumeState, setResumeState] = useState<ResumeState | null>(null)
  const [interjection, setInterjection] = useState("")
  const [verdict, setVerdict] = useState<PressureVerdict | null>(null)
  const [verdictBody, setVerdictBody] = useState<string>("")
  const [saving, setSaving] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // ── Subject header ─────────────────────────────────────────────
  const headerTitle = useMemo(() => {
    if (subjectSnapshot.title) return subjectSnapshot.title
    if (subjectSnapshot.topic) return subjectSnapshot.topic
    return "Pressure-test"
  }, [subjectSnapshot.title, subjectSnapshot.topic])

  const headerSubtitle = useMemo(
    () => subjectSnapshot.summary ?? "Stress-test this from five angles before you commit.",
    [subjectSnapshot.summary],
  )

  // ── Auto-scroll on transcript grow ─────────────────────────────
  useEffect(() => {
    if (!scrollRef.current) return
    const el = scrollRef.current
    el.scrollTop = el.scrollHeight
  }, [transcript])

  // ── Cleanup on close ───────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort()
      abortRef.current = null
    }
    return () => {
      abortRef.current?.abort()
    }
  }, [open])

  // ── Reset when dialog reopens ──────────────────────────────────
  useEffect(() => {
    if (open && state === "idle" && transcript.length === 0) {
      // First open — nothing to reset. Kick off start.
      void handleStart()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function resetAll() {
    abortRef.current?.abort()
    abortRef.current = null
    setState("idle")
    setErrorMessage(null)
    setSessionId(null)
    setCurrentRound(0)
    setTranscript([])
    setResumeState(null)
    setInterjection("")
    setVerdict(null)
    setVerdictBody("")
    setSaving(false)
  }

  // ── SSE consumer ───────────────────────────────────────────────
  const consumeStream = useCallback(
    async (requestBody: Record<string, unknown>) => {
      const controller = new AbortController()
      abortRef.current = controller
      setState("streaming")
      setErrorMessage(null)

      try {
        const response = await fetch("/api/red-team/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        })

        if (!response.ok || !response.body) {
          throw new Error(`Stream failed (${response.status})`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const payload = line.slice(6)
            if (!payload || payload === "[DONE]") continue
            try {
              handleSSEEvent(JSON.parse(payload))
            } catch {
              /* skip malformed */
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Stream connection lost — check your network and retry.",
        )
        setState("error")
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // ── SSE event handler ──────────────────────────────────────────
  const handleSSEEvent = useCallback((event: Record<string, unknown>) => {
    const phase = event.phase as string

    switch (phase) {
      case "round_start": {
        const round = Number(event.round ?? 0)
        setCurrentRound(round)
        break
      }

      case "persona_start": {
        const round = Number(event.round ?? 0)
        const persona = String(event.persona ?? "")
        const characterName = event.characterName as string | undefined
        setTranscript((prev) => [
          ...prev,
          {
            id: `${round}-${persona}-${prev.length}`,
            round,
            persona,
            characterName,
            content: "",
            complete: false,
          },
        ])
        break
      }

      case "chunk": {
        const round = Number(event.round ?? 0)
        const persona = String(event.persona ?? "")
        const chunk = String(event.chunk ?? "")
        setTranscript((prev) => {
          // Append to the in-flight line for this round/persona (last incomplete)
          const idx = findLastIncomplete(prev, round, persona)
          if (idx < 0) return prev
          const next = [...prev]
          next[idx] = { ...next[idx], content: next[idx].content + chunk }
          return next
        })
        break
      }

      case "persona_complete": {
        const round = Number(event.round ?? 0)
        const persona = String(event.persona ?? "")
        setTranscript((prev) => {
          const idx = findLastIncomplete(prev, round, persona)
          if (idx < 0) return prev
          const next = [...prev]
          next[idx] = { ...next[idx], complete: true }
          return next
        })
        break
      }

      case "awaiting_input": {
        // Stream closed by server — waiting for human interject + resume.
        const state = event.state as ResumeState | undefined
        if (state) setResumeState(state)
        setState("round_complete")
        break
      }

      case "synthesis_chunk": {
        const chunk = String(event.chunk ?? "")
        setVerdictBody((prev) => prev + chunk)
        break
      }

      case "complete": {
        // event.document has the final shape
        const doc = event.document as
          | { verdict?: string; rounds?: unknown[] }
          | undefined
        if (doc?.verdict) {
          setVerdictBody(doc.verdict)
          setVerdict(inferVerdict(doc.verdict))
        } else {
          setVerdict(inferVerdict(verdictBody))
        }
        setState("complete")
        break
      }

      case "error": {
        setErrorMessage(
          (event.message as string) ??
            "The debate stream ran into an error.",
        )
        setState("error")
        break
      }

      default:
        break
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Start the debate: create session + open SSE ────────────────
  const handleStart = useCallback(async () => {
    setState("starting")
    setErrorMessage(null)

    const topic =
      (typeof subjectSnapshot.topic === "string" && subjectSnapshot.topic) ||
      (typeof subjectSnapshot.title === "string" && subjectSnapshot.title) ||
      ""

    if (topic.trim().length < 10) {
      setErrorMessage(
        "The subject is too short — pressure-test needs at least a full sentence to argue against.",
      )
      setState("error")
      return
    }

    const subject: PressureTestSubject = {
      type: goalId ? "goal" : "custom",
      ref: goalId,
      snapshot: subjectSnapshot as Record<string, unknown>,
    }

    const result = await startPressureTest(subject, totalRounds)
    if (!("success" in result) || !result.success) {
      setErrorMessage(result.error ?? "Could not start the pressure-test.")
      setState("error")
      return
    }
    setSessionId(result.data.sessionId)

    await consumeStream({
      topic,
      context:
        typeof subjectSnapshot.context === "string"
          ? subjectSnapshot.context
          : undefined,
    })
  }, [goalId, subjectSnapshot, consumeStream])

  // ── Resume after founder interjection (or skip) ────────────────
  const handleNextRound = useCallback(async () => {
    if (!resumeState) return
    const userInput = interjection.trim() || undefined
    setInterjection("")

    await consumeStream({
      topic:
        (typeof subjectSnapshot.topic === "string" && subjectSnapshot.topic) ||
        (typeof subjectSnapshot.title === "string" && subjectSnapshot.title) ||
        "",
      context:
        typeof subjectSnapshot.context === "string"
          ? subjectSnapshot.context
          : undefined,
      resumeFromRound: currentRound,
      userInput,
      priorRounds: resumeState.priorRounds,
      priorTranscript: resumeState.priorTranscript,
      evidencePack: resumeState.evidencePack,
      evidenceItems: resumeState.evidenceItems,
      customQuestions: resumeState.customQuestions,
      userInputs: resumeState.userInputs,
      totalCostSoFar: resumeState.totalCostSoFar,
      debateId: resumeState.debateId,
    })

    // If founder interjected, record it in the local transcript so it
    // renders above the next round.
    if (userInput) {
      setTranscript((prev) => [
        ...prev,
        {
          id: `interject-${currentRound}`,
          round: currentRound,
          persona: "founder",
          content: userInput,
          complete: true,
          isInterjection: true,
        },
      ])
    }
  }, [resumeState, interjection, currentRound, subjectSnapshot, consumeStream])

  // ── Retry after SSE error ──────────────────────────────────────
  const handleRetry = useCallback(async () => {
    // Re-open the stream with whatever state we already have.
    if (resumeState) {
      await handleNextRound()
    } else {
      await handleStart()
    }
  }, [resumeState, handleNextRound, handleStart])

  // ── Save the debate (closePressureTest) ────────────────────────
  const handleSave = useCallback(async () => {
    if (!sessionId || !verdict) return
    setSaving(true)

    const transcriptJson: PressureTranscriptMessage[] = transcript
      .filter((line) => line.complete && !line.isInterjection)
      .map((line) => ({
        persona: line.persona,
        round: line.round,
        content: line.content,
        at: new Date().toISOString(),
      }))

    const acceptMitigations = verdict === "proceed_with_mitigations"

    const result = await closePressureTest(
      sessionId,
      acceptMitigations,
      transcriptJson,
      verdict,
      verdictBody,
    )

    setSaving(false)

    if (!("success" in result) || !result.success) {
      setErrorMessage(result.error ?? "Could not save the debate.")
      return
    }

    onOpenChange(false)
    // Reset on next open
    setTimeout(resetAll, 300)
  }, [sessionId, verdict, verdictBody, transcript, onOpenChange])

  // ── Render ─────────────────────────────────────────────────────

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          abortRef.current?.abort()
          resetAll()
        }
        onOpenChange(next)
      }}
    >
      <DialogContent
        size="xl"
        className="flex max-h-[85dvh] flex-col gap-0 p-0"
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <DialogHeader className="gap-2 border-b border-border px-6 pt-6 pb-4">
          <DialogTitle className="pr-10 text-base font-semibold leading-tight">
            {headerTitle}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {headerSubtitle}
          </DialogDescription>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {PRESSURE_PERSONA_ORDER.map((role) => (
                <PersonaBadge
                  key={role}
                  role={role}
                  variant="dot"
                  className={cn(
                    "transition-opacity",
                    currentRound > 0 ? "opacity-100" : "opacity-60",
                  )}
                />
              ))}
            </div>
            <div className="text-xs font-medium text-muted-foreground">
              Round {Math.min(currentRound || 1, totalRounds)} of {totalRounds}
            </div>
          </div>
        </DialogHeader>

        {/* ── Body: transcript ────────────────────────────────── */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 py-4"
          role="log"
          aria-live="polite"
          aria-busy={state === "streaming" || state === "starting"}
        >
          {state === "starting" && transcript.length === 0 ? (
            <StatusBlock>Gathering evidence and framing the debate…</StatusBlock>
          ) : null}

          {transcript.length === 0 && state === "idle" ? (
            <StatusBlock>Ready when you are.</StatusBlock>
          ) : null}

          <ul className="space-y-4">
            {transcript.map((line) => (
              <TranscriptRow key={line.id} line={line} />
            ))}
          </ul>

          {state === "error" && errorMessage ? (
            <div
              role="alert"
              className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <p className="font-medium">Something broke mid-debate.</p>
              <p className="mt-1 text-destructive/80">{errorMessage}</p>
            </div>
          ) : null}
        </div>

        {/* ── Footer ──────────────────────────────────────────── */}
        <DialogFooter className="flex-col gap-3 border-t border-border bg-muted/30 px-6 py-4 sm:flex-col sm:items-stretch sm:space-x-0">
          {state === "complete" && verdict ? (
            <VerdictFooter
              verdict={verdict}
              saving={saving}
              onSave={handleSave}
              onClose={() => onOpenChange(false)}
            />
          ) : state === "error" ? (
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={handleRetry}>Retry round</Button>
            </div>
          ) : state === "round_complete" ? (
            <RoundCompleteFooter
              interjection={interjection}
              onInterjectionChange={setInterjection}
              onNext={handleNextRound}
              disabled={false}
              nextLabel={
                currentRound >= totalRounds - 1
                  ? "Final round + verdict"
                  : "Run next round"
              }
            />
          ) : (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {state === "streaming"
                  ? "Stress-test roles are speaking…"
                  : state === "starting"
                    ? "Preparing the debate…"
                    : "Waiting…"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  abortRef.current?.abort()
                  onOpenChange(false)
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// 3 · Sub-components
// ──────────────────────────────────────────────────────────────────────────

function TranscriptRow({ line }: { line: TranscriptLine }) {
  if (line.isInterjection) {
    return (
      <li className="rounded-md border border-dashed border-border bg-background px-3 py-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Your interjection · after round {line.round}
        </div>
        <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">
          {line.content}
        </p>
      </li>
    )
  }

  const personaInfo = getPressurePersona(line.persona)

  return (
    <li className="rounded-md border border-border bg-background px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <PersonaBadge role={line.persona} characterName={line.characterName} />
        <span className="text-xs text-muted-foreground">
          Round {line.round}
          {personaInfo ? ` · ${personaInfo.role}` : null}
        </span>
      </div>
      <div className="mt-2 text-sm text-foreground">
        {line.content ? (
          <Markdown content={line.content} />
        ) : (
          <span className="text-muted-foreground italic">Thinking…</span>
        )}
        {!line.complete && line.content ? (
          <span
            aria-hidden
            className="ml-1 inline-block h-3 w-1 animate-pulse bg-muted-foreground align-middle"
          />
        ) : null}
      </div>
    </li>
  )
}

function RoundCompleteFooter({
  interjection,
  onInterjectionChange,
  onNext,
  disabled,
  nextLabel,
}: {
  interjection: string
  onInterjectionChange: (next: string) => void
  onNext: () => void
  disabled: boolean
  nextLabel: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="pt-interject"
        className="text-xs font-medium text-muted-foreground"
      >
        Interject (optional)
      </label>
      <Textarea
        id="pt-interject"
        value={interjection}
        onChange={(e) => onInterjectionChange(e.target.value)}
        placeholder="Add context, data, or a point the roles missed…"
        rows={2}
        className="resize-none"
      />
      <div className="flex items-center justify-end gap-2">
        <Button onClick={onNext} disabled={disabled}>
          {nextLabel}
        </Button>
      </div>
    </div>
  )
}

function VerdictFooter({
  verdict,
  saving,
  onSave,
  onClose,
}: {
  verdict: PressureVerdict
  saving: boolean
  onSave: () => void
  onClose: () => void
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <VerdictChip verdict={verdict} />
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Close without saving
        </Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save debate"}
        </Button>
      </div>
    </div>
  )
}

function VerdictChip({ verdict }: { verdict: PressureVerdict }) {
  const config: Record<PressureVerdict, { label: string; cls: string }> = {
    proceed: {
      label: "Verdict · Proceed",
      cls: "bg-success/10 text-success border-success/20",
    },
    proceed_with_mitigations: {
      label: "Verdict · Proceed with mitigations",
      cls: "bg-info/10 text-info border-info/20",
    },
    pivot: {
      label: "Verdict · Pivot",
      cls: "bg-warning/10 text-warning border-warning/20",
    },
    kill: {
      label: "Verdict · Kill",
      cls: "bg-destructive/10 text-destructive border-destructive/20",
    },
    inconclusive: {
      label: "Verdict · Inconclusive",
      cls: "bg-muted text-muted-foreground border-border",
    },
  }
  const cfg = config[verdict]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium",
        cfg.cls,
      )}
    >
      {cfg.label}
    </span>
  )
}

function StatusBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[6rem] items-center justify-center rounded-md border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
      {children}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// 4 · Helpers
// ──────────────────────────────────────────────────────────────────────────

function findLastIncomplete(
  transcript: TranscriptLine[],
  round: number,
  persona: string,
): number {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const t = transcript[i]
    if (t.round === round && t.persona === persona && !t.complete) return i
  }
  return -1
}

/**
 * Infer a verdict enum value from the synthesis text. The SSE route doesn't
 * return a structured verdict field — it emits free-text prefixed with
 * "## VERDICT". We do a best-effort classification here; the founder can
 * still change it before saving (future — for V1 we accept the inference).
 */
function inferVerdict(text: string): PressureVerdict {
  const t = text.toLowerCase()
  if (/\bkill\b|\bdo not proceed\b|\bshelve\b/.test(t)) return "kill"
  if (/\bpivot\b|\breframe\b/.test(t)) return "pivot"
  if (/\bmitigat(e|ion)\b|\bwith conditions\b/.test(t)) {
    return "proceed_with_mitigations"
  }
  if (/\bproceed\b|\bgo\b|\bcommit\b/.test(t)) return "proceed"
  return "inconclusive"
}

// Re-export the persona type for convenience
export type { PressurePersonaRole }
