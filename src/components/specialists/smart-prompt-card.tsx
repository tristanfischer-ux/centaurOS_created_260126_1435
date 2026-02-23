'use client'

/**
 * @file smart-prompt-card.tsx
 *
 * @description Renders a context-aware prompt suggestion with the reason
 * it's being recommended based on company stage, recent decisions, etc.
 */

import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SmartPrompt {
    prompt: string
    reason: string
    score: number
}

interface SmartPromptCardProps {
    prompts: SmartPrompt[]
    onSelect: (prompt: string) => void
    disabled?: boolean
    className?: string
}

/**
 * Renders smart prompt suggestions as clickable cards.
 */
export function SmartPromptCard({
    prompts,
    onSelect,
    disabled = false,
    className,
}: SmartPromptCardProps) {
    if (prompts.length === 0) return null

    return (
        <div className={cn('space-y-1.5', className)}>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Sparkles className="h-3 w-3 text-international-orange" />
                Suggested for you
            </div>
            {prompts.map((item) => (
                <button
                    key={item.prompt}
                    type="button"
                    onClick={() => onSelect(item.prompt)}
                    disabled={disabled}
                    className={cn(
                        'w-full text-left rounded-lg border bg-background p-2.5',
                        'hover:border-international-orange/40 hover:bg-international-orange/5',
                        'transition-all duration-150',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-international-orange focus-visible:ring-offset-2',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                >
                    <p className="text-xs font-medium text-foreground leading-snug">
                        {item.prompt}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                        {item.reason}
                    </p>
                </button>
            ))}
        </div>
    )
}
