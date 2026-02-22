/**
 * @file ai-disclaimer.tsx
 *
 * @description Reusable disclaimer component for AI-generated content.
 * Reinforces the human-first philosophy: users are in charge, AI Specialists
 * can make mistakes, and critical decisions require human verification.
 *
 * @example
 * <AiDisclaimer />
 * <AiDisclaimer variant="legal" />
 * <AiDisclaimer specialistId="legal-counsel" /> // auto-selects legal variant
 */

import { AlertTriangle, Info, Scale } from 'lucide-react'
import { cn } from '@/lib/utils'

// INTENT: Specialist IDs that auto-upgrade to their domain-specific disclaimer
// variant, because the stakes of acting on wrong AI output are highest in these areas.
const LEGAL_SPECIALIST_IDS = ['legal-counsel'] as const
const FINANCIAL_SPECIALIST_IDS = ['finance-lead', 'fundraising-advisor'] as const

type DisclaimerVariant = 'standard' | 'legal' | 'financial'

interface AiDisclaimerProps {
    /** Visual severity tier. Auto-detected from specialistId when omitted. */
    variant?: DisclaimerVariant
    /** When provided, auto-selects the appropriate variant for the specialist's domain. */
    specialistId?: string
    /** Additional CSS classes */
    className?: string
}

const VARIANT_CONFIG = {
    standard: {
        icon: Info,
        containerClass: '',
        textClass: 'text-muted-foreground',
        message:
            'AI Specialists can make mistakes, just like people. You\'re in charge\u00a0\u2014\u00a0always verify what matters.',
    },
    legal: {
        icon: Scale,
        containerClass:
            'border-l-2 border-l-status-warning bg-status-warning-light/40 px-3 py-2 rounded-r-md',
        textClass: 'text-status-warning-dark',
        message:
            'This is AI-generated guidance, not professional legal advice. AI can hallucinate or miss critical nuances. Always have a qualified attorney review before making legal decisions.',
    },
    financial: {
        icon: AlertTriangle,
        containerClass:
            'border-l-2 border-l-status-info bg-status-info-light/40 px-3 py-2 rounded-r-md',
        textClass: 'text-status-info-dark',
        message:
            'This is AI-generated financial guidance, not professional financial advice. Always verify figures and consult a qualified financial advisor before making financial decisions.',
    },
} as const satisfies Record<DisclaimerVariant, {
    icon: typeof Info
    containerClass: string
    textClass: string
    message: string
}>

function resolveVariant(
    explicit?: DisclaimerVariant,
    specialistId?: string,
): DisclaimerVariant {
    if (explicit) return explicit
    if (specialistId) {
        if ((LEGAL_SPECIALIST_IDS as readonly string[]).includes(specialistId)) return 'legal'
        if ((FINANCIAL_SPECIALIST_IDS as readonly string[]).includes(specialistId)) return 'financial'
    }
    return 'standard'
}

/**
 * Displays a human-first AI disclaimer appropriate to the content domain.
 *
 * @param props - Component props
 * @returns A non-intrusive but always-visible disclaimer element
 */
export function AiDisclaimer({
    variant: explicitVariant,
    specialistId,
    className,
}: AiDisclaimerProps): React.JSX.Element {
    const variant = resolveVariant(explicitVariant, specialistId)
    const config = VARIANT_CONFIG[variant]
    const Icon = config.icon

    return (
        <div
            className={cn(
                'flex items-start gap-1.5',
                config.containerClass,
                className,
            )}
            role="note"
            aria-label="AI disclaimer"
        >
            <Icon
                className={cn(
                    'mt-0.5 h-3 w-3 shrink-0',
                    variant === 'standard' ? 'text-muted-foreground' : config.textClass,
                )}
            />
            <p
                className={cn(
                    'text-[11px] leading-relaxed',
                    config.textClass,
                )}
            >
                {config.message}
            </p>
        </div>
    )
}
