"use client"

/**
 * @file specialist-presentation.tsx
 *
 * @description Renders the specialist's visual representation in text mode.
 * This component is the visual "face" of the specialist in the dialog.
 *
 * @component
 *
 * @example
 * <SpecialistPresentation
 *   specialist={specialist}
 *   mode="text"
 *   state="speaking"
 * />
 */

import { useState } from "react"
import Image from "next/image"
import { AlertCircle, Loader2, Brain } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ConversationMode, SpecialistState } from "@/lib/agents/conversation-engine"
import type { Specialist } from "@/lib/agents/specialists-config"

// ─── Types ───────────────────────────────────────────────────────────────────

interface SpecialistPresentationProps {
    /** Specialist data for rendering name, avatar, etc. */
    specialist: Specialist
    /** Which conversation mode is active */
    mode: ConversationMode
    /** Current specialist visual state */
    state: SpecialistState
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
    state,
    size = "md",
    className,
}: SpecialistPresentationProps) {
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

    // ─── Text Mode: Static avatar with state indicators ──────────────────
    return (
        <div className={cn("relative flex-shrink-0", className)}>
            <div className={cn(
                "relative rounded-full overflow-hidden bg-muted",
                sizeClasses[size],
            )}>
                <AvatarImage specialist={specialist} size={imageSizes[size]} />
            </div>

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
}: {
    state: SpecialistState
}) {
    if (state === "idle") return null

    const indicators: Record<SpecialistState, { icon: typeof Loader2; label: string; className: string } | null> = {
        idle: null,
        connecting: {
            icon: Loader2,
            label: "Connecting",
            className: "text-muted-foreground",
        },
        listening: {
            icon: Loader2,
            label: "Listening",
            className: "text-destructive animate-pulse",
        },
        thinking: {
            icon: Brain,
            label: "Thinking",
            className: "text-international-orange animate-pulse",
        },
        speaking: null,
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
