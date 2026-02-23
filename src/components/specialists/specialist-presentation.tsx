"use client"

/**
 * @file specialist-presentation.tsx
 *
 * @description Renders the specialist's visual representation, adapting
 * based on the active ConversationMode. This component is the visual
 * "face" of the specialist in the dialog.
 *
 * Modes:
 * - **text**: Static avatar image with state-based indicators (typing dots, speaking pulse)
 * - **voice**: Animated avatar with audio visualizer and speaking indicators
 * - **avatar**: Live video stream from avatar provider via <video> element
 *
 * @component
 *
 * @example
 * <SpecialistPresentation
 *   specialist={specialist}
 *   mode="text"
 *   state="speaking"
 * />
 *
 * @example
 * <SpecialistPresentation
 *   specialist={specialist}
 *   mode="avatar"
 *   state="speaking"
 *   videoStream={videoStream}
 * />
 */

import { useRef, useEffect, useState } from "react"
import Image from "next/image"
import { AlertCircle, Loader2, Volume2, Mic, Brain, Wifi } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ConversationMode, SpecialistState } from "@/lib/agents/conversation-engine"
import type { Specialist } from "@/app/(platform)/agents/specialists-data"

// ─── Types ───────────────────────────────────────────────────────────────────

interface SpecialistPresentationProps {
    /** Specialist data for rendering name, avatar, etc. */
    specialist: Specialist
    /** Which conversation mode is active */
    mode: ConversationMode
    /** Current specialist visual state */
    state: SpecialistState
    /** Video stream from avatar provider (only for avatar mode) */
    videoStream?: MediaStream | null
    /** Size variant */
    size?: "sm" | "md" | "lg"
    /** Additional CSS classes */
    className?: string
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Renders a specialist's visual representation that adapts to the
 * conversation mode and current state.
 */
export function SpecialistPresentation({
    specialist,
    mode,
    state,
    videoStream,
    size = "md",
    className,
}: SpecialistPresentationProps) {
    const videoRef = useRef<HTMLVideoElement>(null)

    // Attach video stream to <video> element when available
    useEffect(() => {
        if (videoRef.current && videoStream) {
            videoRef.current.srcObject = videoStream
            videoRef.current.play().catch((err) => {
                console.warn("[SpecialistPresentation] Video play failed:", err)
            })
        }
        return () => {
            if (videoRef.current) {
                // eslint-disable-next-line react-hooks/exhaustive-deps
                videoRef.current.srcObject = null
            }
        }
    }, [videoStream])

    const sizeClasses = {
        sm: "h-7 w-7",
        md: "h-12 w-12",
        lg: "h-32 w-32",
    }

    const imageSizes = {
        sm: "28px",
        md: "48px",
        lg: "128px",
    }

    // ─── Avatar Mode: Live video stream ──────────────────────────────────
    if (mode === "avatar" && videoStream) {
        return (
            <div className={cn("relative", className)}>
                {/* Live video avatar */}
                <div className={cn(
                    "relative overflow-hidden rounded-2xl bg-muted",
                    size === "lg" ? "h-64 w-64" : sizeClasses[size],
                )}>
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="h-full w-full object-cover"
                        aria-label={`${specialist.name} avatar video`}
                    />

                    {/* State overlay */}
                    {state === "connecting" && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
                            <div className="flex flex-col items-center gap-2">
                                <Wifi className="h-5 w-5 text-international-orange animate-pulse" />
                                <span className="text-xs text-muted-foreground">Connecting...</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* State indicator badges */}
                <StateIndicator state={state} mode={mode} />
            </div>
        )
    }

    // ─── Voice Mode: Animated static avatar ──────────────────────────────
    if (mode === "voice") {
        return (
            <div className={cn("relative flex flex-col items-center gap-2", className)}>
                {/* Avatar with animated ring for speaking */}
                <div className={cn(
                    "relative rounded-full overflow-hidden",
                    sizeClasses[size],
                    state === "speaking" && "ring-2 ring-international-orange ring-offset-2 ring-offset-background",
                    state === "listening" && "ring-2 ring-destructive ring-offset-2 ring-offset-background animate-pulse",
                )}>
                    <AvatarImage specialist={specialist} size={imageSizes[size]} />
                </div>

                {/* Audio visualizer dots (speaking state) */}
                {state === "speaking" && size !== "sm" && (
                    <div className="flex items-center gap-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-international-orange animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="h-1.5 w-1.5 rounded-full bg-international-orange animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="h-1.5 w-1.5 rounded-full bg-international-orange animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                )}

                <StateIndicator state={state} mode={mode} />
            </div>
        )
    }

    // ─── Text Mode: Static avatar with state indicators ──────────────────
    return (
        <div className={cn("relative flex-shrink-0", className)}>
            <div className={cn(
                "relative rounded-full overflow-hidden bg-muted",
                sizeClasses[size],
            )}>
                <AvatarImage specialist={specialist} size={imageSizes[size]} />
            </div>

            {/* Small indicator for TTS playback in text mode */}
            {(state === "speaking") && (
                <Volume2 className="absolute -bottom-1 -right-1 h-3 w-3 text-international-orange animate-pulse" />
            )}
        </div>
    )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/**
 * Renders the specialist's avatar image or initial fallback.
 */
function AvatarImage({ specialist, size }: { specialist: Specialist; size: string }) {
    const [imgError, setImgError] = useState(false)

    if (specialist.avatarImage && !imgError) {
        return (
            <Image
                src={specialist.avatarImage}
                alt={specialist.name}
                fill
                unoptimized
                className="object-cover"
                sizes={size}
                onError={() => setImgError(true)}
            />
        )
    }

    return (
        <div className="flex items-center justify-center h-full w-full">
            <span className="text-lg font-display font-semibold text-foreground">
                {specialist.name.charAt(0)}
            </span>
        </div>
    )
}

/**
 * State indicator badge shown below/beside the avatar.
 * Only shown for non-idle states.
 */
function StateIndicator({
    state,
    mode,
}: {
    state: SpecialistState
    mode: ConversationMode
}) {
    if (state === "idle") return null

    const indicators: Record<SpecialistState, { icon: typeof Loader2; label: string; className: string } | null> = {
        idle: null,
        connecting: {
            icon: Wifi,
            label: "Connecting",
            className: "text-muted-foreground",
        },
        listening: {
            icon: Mic,
            label: "Listening",
            className: "text-destructive animate-pulse",
        },
        thinking: {
            icon: Brain,
            label: mode === "text" ? "Thinking" : "Processing",
            className: "text-international-orange animate-pulse",
        },
        speaking: {
            icon: Volume2,
            label: "Speaking",
            className: "text-international-orange",
        },
        error: {
            icon: AlertCircle,
            label: "Error",
            className: "text-destructive",
        },
    }

    const indicator = indicators[state]
    if (!indicator) return null

    const Icon = indicator.icon

    return (
        <div className={cn("flex items-center gap-1 mt-1", indicator.className)}>
            <Icon className="h-3 w-3" />
            <span className="text-[10px] font-medium">{indicator.label}</span>
        </div>
    )
}

// ─── Inline Chat Avatar ──────────────────────────────────────────────────────

/**
 * Smaller avatar used inline in the chat message list.
 * Shows the specialist's face with optional state indicators.
 */
export function SpecialistChatAvatar({
    specialist,
    state,
    className,
}: {
    specialist: Specialist
    state: SpecialistState
    className?: string
}) {
    return (
        <SpecialistPresentation
            specialist={specialist}
            mode="text"
            state={state}
            size="sm"
            className={className}
        />
    )
}
