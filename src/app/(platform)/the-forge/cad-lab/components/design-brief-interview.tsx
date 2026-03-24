"use client"

/**
 * @file design-brief-interview.tsx — Guided design brief interview with Max (CTO).
 *
 * @description Chat-like Q&A where Sonnet 4.6 generates dynamic follow-up questions
 * based on the user's answers, then Opus 4.6 synthesizes a structured design brief.
 * Target users are non-engineers who vaguely know what they want but lack engineering
 * specifics — Max guides them through accessible questions.
 */

import { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight, SkipForward } from "lucide-react"

import { Button } from "@/components/ui/button"
import { InputWithSpeech } from "@/components/ui/input-with-speech"
import { getSpecialistById } from "@/app/(platform)/agents/specialists-data"
import { getNextInterviewQuestion, synthesizeDesignBrief } from "@/actions/cad-lab-interview"
import type { CadLabDesignBrief } from "@/lib/cad-lab-types"

// ─── Types ───────────────────────────────────────────────────────────

interface ConversationEntry {
  question: string
  answer: string
}

interface Message {
  role: "max" | "user"
  content: string
}

interface DesignBriefInterviewProps {
  subject: string
  onComplete: (brief: CadLabDesignBrief, enrichedSubject: string, summary: string) => void
  onSkip: () => void
}

// ─── Typing Indicator ────────────────────────────────────────────────

function TypingIndicator(): React.ReactNode {
  return (
    <div className="flex items-center gap-1 py-2 px-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-muted-foreground/50"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────

export function DesignBriefInterview({
  subject,
  onComplete,
  onSkip,
}: DesignBriefInterviewProps): React.ReactNode {
  const max = getSpecialistById("cto")
  const [messages, setMessages] = useState<Message[]>([])
  const [conversation, setConversation] = useState<ConversationEntry[]>([])
  const [suggestedChips, setSuggestedChips] = useState<string[]>([])
  const [isThinking, setIsThinking] = useState(true)
  const [isSynthesizing, setIsSynthesizing] = useState(false)
  const [currentAnswer, setCurrentAnswer] = useState("")
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const submittingRef = useRef(false)
  const onSkipRef = useRef(onSkip)
  onSkipRef.current = onSkip

  // INTENT: Auto-scroll to bottom when new messages appear
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isThinking, isSynthesizing])

  // INTENT: Focus input after Max asks a question
  useEffect(() => {
    if (!isThinking && !isSynthesizing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isThinking, isSynthesizing])

  // INTENT: Fetch first question on mount
  useEffect(() => {
    let cancelled = false
    async function fetchFirst() {
      try {
        const result = await getNextInterviewQuestion(subject, [])
        if (cancelled) return
        if (result.nextQuestion) {
          setMessages([{ role: "max", content: result.nextQuestion }])
          setSuggestedChips(result.suggestedChips ?? [])
        } else if (result.done) {
          // GOTCHA: done=true with no question means auth/rate-limit failed silently.
          // Skip straight to research rather than showing an empty interview.
          onSkipRef.current()
          return
        }
      } catch (err) {
        if (cancelled) return
        console.error("[INTERVIEW] First question failed:", err)
        setError("Failed to start interview. You can skip to research.")
      } finally {
        if (!cancelled) setIsThinking(false)
      }
    }
    fetchFirst()
    return () => { cancelled = true }
  }, [subject])

  const handleSubmitAnswer = useCallback(async (answer: string) => {
    if (!answer.trim() || isThinking || isSynthesizing || submittingRef.current) return
    submittingRef.current = true

    const trimmed = answer.trim()
    setCurrentAnswer("")
    setError(null)

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: trimmed }])

    // Build updated conversation
    const lastMaxMessage = messages.filter((m) => m.role === "max").pop()
    const newEntry: ConversationEntry = {
      question: lastMaxMessage?.content ?? "",
      answer: trimmed,
    }
    const updatedConversation = [...conversation, newEntry]
    setConversation(updatedConversation)
    setSuggestedChips([])
    setIsThinking(true)

    try {
      const result = await getNextInterviewQuestion(subject, updatedConversation)

      if (result.done) {
        // Sonnet says enough info — synthesize with Opus
        setIsThinking(false)
        setIsSynthesizing(true)

        if (result.acknowledgment) {
          setMessages((prev) => [...prev, { role: "max", content: result.acknowledgment! }])
        }

        try {
          const synthesis = await synthesizeDesignBrief(subject, updatedConversation)
          setMessages((prev) => [
            ...prev,
            { role: "max", content: synthesis.summary },
          ])
          setIsSynthesizing(false)

          // INTENT: Give user time to read Max's summary before research fires.
          // 3s is enough to scan 4-6 sentences at reading speed.
          setTimeout(() => {
            onComplete(synthesis.brief, synthesis.enrichedSubject, synthesis.summary)
          }, 3000)
        } catch (synthErr) {
          console.error("[INTERVIEW] Synthesis failed:", synthErr)
          // INTENT: Fallback — pass raw conversation data as a basic brief
          setIsSynthesizing(false)
          const fallbackBrief: CadLabDesignBrief = {
            useCase: updatedConversation.map((e) => `${e.question} ${e.answer}`).join(". "),
            targetProcess: "",
            targetMaterial: "",
            toleranceTarget: "",
            quantityTarget: "",
            complianceNotes: "",
          }
          onComplete(fallbackBrief, subject, "")
        }
      } else {
        // More questions
        const maxContent = [result.acknowledgment, result.nextQuestion]
          .filter(Boolean)
          .join("\n\n")
        setMessages((prev) => [...prev, { role: "max", content: maxContent }])
        setSuggestedChips(result.suggestedChips ?? [])
        setIsThinking(false)
      }
    } catch (err) {
      console.error("[INTERVIEW] Question failed:", err)
      setIsThinking(false)
      setError("Something went wrong. Try again or skip to research.")
    } finally {
      submittingRef.current = false
    }
  }, [messages, conversation, subject, isThinking, isSynthesizing, onComplete])

  const handleChipClick = useCallback((chip: string) => {
    handleSubmitAnswer(chip)
  }, [handleSubmitAnswer])

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b bg-muted/30">
        {max?.avatarImage && (
          <img
            src={max.avatarImage}
            alt={max.name}
            className="h-8 w-8 rounded-full object-cover ring-2 ring-international-orange/20"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {max?.name ?? "Max"}, {max?.title ?? "CTO"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isSynthesizing ? "Writing your design brief..." : "Helping you define your product"}
          </p>
        </div>
        <button
          onClick={onSkip}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <SkipForward className="h-3 w-3" />
          Skip to research
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="px-5 py-4 space-y-3 max-h-[400px] overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-international-orange text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        {(isThinking || isSynthesizing) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="bg-muted rounded-xl px-4 py-2">
              <TypingIndicator />
            </div>
          </motion.div>
        )}

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-destructive text-center py-2"
          >
            {error}
            <button
              onClick={onSkip}
              className="ml-2 underline hover:no-underline"
            >
              Skip to research
            </button>
          </motion.div>
        )}
      </div>

      {/* Suggested chips */}
      {suggestedChips.length > 0 && !isThinking && !isSynthesizing && (
        <div className="px-5 pb-2 flex flex-wrap gap-2">
          {suggestedChips.map((chip) => (
            <button
              key={chip}
              onClick={() => handleChipClick(chip)}
              className="text-xs px-3 py-1.5 rounded-full border border-muted bg-muted/50 text-muted-foreground hover:border-international-orange/40 hover:text-foreground transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      {!isSynthesizing && (
        <div className="px-5 py-3 border-t flex items-center gap-2">
          <div className="relative flex-1">
            <InputWithSpeech
              ref={inputRef}
              enableSpeech
              value={currentAnswer}
              onChange={(e) => setCurrentAnswer(e.target.value)}
              onSpeechTranscript={(text) =>
                setCurrentAnswer((prev) => (prev ? prev + " " + text : text))
              }
              placeholder="Type your answer..."
              className="h-10 text-sm pr-10"
              disabled={isThinking}
              onKeyDown={(e) => {
                if (e.key === "Enter" && currentAnswer.trim() && !isThinking) {
                  handleSubmitAnswer(currentAnswer)
                }
              }}
            />
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10 shrink-0"
            disabled={!currentAnswer.trim() || isThinking}
            onClick={() => handleSubmitAnswer(currentAnswer)}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Synthesizing state */}
      {isSynthesizing && (
        <div className="px-5 py-3 border-t">
          <p className="text-xs text-muted-foreground text-center">
            Synthesizing your design brief...
          </p>
        </div>
      )}
    </div>
  )
}
