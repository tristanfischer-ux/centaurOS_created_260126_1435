/**
 * @file chat-message-list.tsx
 *
 * @description Renders the list of chat messages between a founder and a specialist.
 * Extracted from brief-specialist-dialog.tsx (refactor step 2 of 5) to eliminate
 * the near-identical message loop that existed in both panel mode and dialog mode.
 *
 * Handles:
 * - Historical/current message separators ("Previous conversation" / "Now")
 * - User vs assistant bubbles with correct alignment and styling
 * - Proactive initiative badge
 * - Slide deck messages (InlinePresentationCard)
 * - Standard markdown messages with optional charts + structured outputs
 * - Thumbs up/down feedback buttons per assistant message
 * - MessageExportMenu per assistant message
 * - SpecialistChatAvatar with speaking/idle state for TTS
 *
 * @audit Extracted 2026-02-25 from src/app/(platform)/agents/brief-specialist-dialog.tsx
 *        (refactor step 2 of 5). No logic changes — code moved verbatim, cosmetic
 *        differences between panel/dialog modes parameterized via `compact` prop.
 *
 * @related
 * - Consumer: src/app/(platform)/agents/brief-specialist-dialog.tsx
 * - Types: src/lib/agents/message-parsers.ts (ChatMessage)
 * - Specialist data: src/app/(platform)/agents/specialists-data.ts
 */

"use client"

import { Sparkles, ThumbsUp, ThumbsDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Markdown } from "@/components/ui/markdown"
import { InlinePresentationCard } from "@/components/specialists/inline-presentation-card"
import { ChartRenderer } from "@/components/specialists/chart-renderer"
import { StructuredOutputRenderer } from "@/components/specialists/structured-output-renderer"
import { SpecialistChatAvatar } from "@/components/specialists/specialist-presentation"
import { MessageExportMenu } from "@/app/(platform)/agents/message-export-menu"
import type { ChatMessage } from "@/lib/agents/message-parsers"
import type { Specialist } from "@/app/(platform)/agents/specialists-data"

// ─── Props ───────────────────────────────────────────────────────────────────

interface ChatMessageListProps {
    /** The messages to render */
    messages: ChatMessage[]
    /** The specialist the user is talking to */
    specialist: Specialist
    /** Per-message feedback state (keyed by message index) */
    messageFeedback: Record<number, 'positive' | 'negative'>
    /** Called when the user clicks thumbs up/down on an assistant message */
    onFeedback: (messageIndex: number, rating: 'positive' | 'negative') => void
    /**
     * compact=true: panel mode — tighter gaps, smaller padding, wider max-width
     * compact=false (default): dialog mode — more spacious
     */
    compact?: boolean
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Renders the specialist chat message list.
 *
 * @description Handles all message types: user text, assistant markdown,
 * slide decks, charts, structured outputs, and proactive openers.
 * Used in both panel mode and dialog mode of brief-specialist-dialog.tsx.
 */
export function ChatMessageList({
    messages,
    specialist,
    messageFeedback,
    onFeedback,
    compact = false,
}: ChatMessageListProps) {
    return (
        <>
            {messages.map((msg, i) => {
                const isLastAssistant = msg.role === "assistant" && !msg.historical && i === messages.length - 1
                const isFirstHistorical = msg.historical && i === 0
                const isTransitionToNew = !msg.historical && i > 0 && messages[i - 1]?.historical
                return (
                    <div key={i}>
                        {isFirstHistorical && (
                            <div className="flex items-center gap-2 mb-3">
                                <div className="flex-1 border-t border-muted" />
                                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                                    Previous conversation
                                </span>
                                <div className="flex-1 border-t border-muted" />
                            </div>
                        )}
                        {isTransitionToNew && (
                            <div className="flex items-center gap-2 my-4">
                                <div className="flex-1 border-t border-international-orange/30" />
                                <span className="text-[10px] font-mono uppercase tracking-widest text-international-orange/70">
                                    Now
                                </span>
                                <div className="flex-1 border-t border-international-orange/30" />
                            </div>
                        )}
                        <div className={cn(
                            "flex",
                            compact ? "gap-2.5" : "gap-3",
                            msg.role === "user" ? "justify-end" : "justify-start",
                            msg.historical && "opacity-60"
                        )}>
                            {msg.role === "assistant" && (
                                <div className="flex flex-col items-center gap-1 flex-shrink-0 mt-1">
                                    <SpecialistChatAvatar
                                        specialist={specialist}
                                        state="idle"
                                    />
                                </div>
                            )}
                            <div className={cn(
                                "rounded-lg",
                                compact ? "max-w-[90%] px-3 py-2.5" : "max-w-[85%] px-4 py-3",
                                msg.role === "user"
                                    ? "bg-international-orange/10 text-foreground"
                                    : msg.isProactive
                                        ? "bg-international-orange/5 border border-international-orange/20"
                                        : "bg-muted/50 border border-muted"
                            )}>
                                {/* Proactive initiative badge */}
                                {msg.isProactive && (
                                    <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-medium uppercase tracking-wider text-international-orange/70">
                                        <Sparkles className="h-3 w-3" />
                                        <span>{specialist.name} reached out</span>
                                    </div>
                                )}
                                {msg.role === "user" ? (
                                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                ) : msg.slideDeck ? (
                                    <>
                                        <InlinePresentationCard deck={msg.slideDeck} />
                                        {!msg.historical && (
                                            <div className="mt-2 flex items-center justify-end gap-1">
                                                <FeedbackButtons
                                                    index={i}
                                                    feedback={messageFeedback[i]}
                                                    onFeedback={onFeedback}
                                                />
                                                <MessageExportMenu content={msg.content} specialistName={specialist.name} />
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <Markdown content={msg.content} className="text-sm" />
                                        {msg.charts && msg.charts.length > 0 && (
                                            <div className="mt-3 space-y-3">
                                                {msg.charts.map((chart, ci) => (
                                                    <ChartRenderer key={`chart-${ci}`} spec={chart} />
                                                ))}
                                            </div>
                                        )}
                                        {msg.structuredOutputs && msg.structuredOutputs.length > 0 && (
                                            <div className="mt-3 space-y-3">
                                                {msg.structuredOutputs.map((so, si) => (
                                                    <StructuredOutputRenderer key={`so-${si}`} spec={so} />
                                                ))}
                                            </div>
                                        )}
                                        {!msg.historical && (
                                            <div className="mt-2 flex items-center justify-end gap-1">
                                                <FeedbackButtons
                                                    index={i}
                                                    feedback={messageFeedback[i]}
                                                    onFeedback={onFeedback}
                                                />
                                                <MessageExportMenu content={msg.content} specialistName={specialist.name} />
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )
            })}
        </>
    )
}

// ─── Internal helpers ────────────────────────────────────────────────────────

interface FeedbackButtonsProps {
    index: number
    feedback: 'positive' | 'negative' | undefined
    onFeedback: (index: number, rating: 'positive' | 'negative') => void
}

function FeedbackButtons({ index, feedback, onFeedback }: FeedbackButtonsProps) {
    return (
        <>
            <button
                onClick={() => onFeedback(index, 'positive')}
                className={cn(
                    'p-1 rounded-md transition-colors',
                    feedback === 'positive'
                        ? 'text-success bg-success/10'
                        : 'text-muted-foreground/40 hover:text-success hover:bg-success/10'
                )}
                title="Helpful"
            >
                <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
                onClick={() => onFeedback(index, 'negative')}
                className={cn(
                    'p-1 rounded-md transition-colors',
                    feedback === 'negative'
                        ? 'text-destructive bg-destructive/10'
                        : 'text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10'
                )}
                title="Not helpful"
            >
                <ThumbsDown className="h-3.5 w-3.5" />
            </button>
        </>
    )
}
