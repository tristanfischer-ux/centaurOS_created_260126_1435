/**
 * @file artefact-card.tsx — The 9-artefact grid card used on project detail.
 *
 * @description One card per artefact (Brief, Modules, BOM, Suppliers, Cost,
 * Risks, Geometry, Operations, Outputs). Top border is colour-coded by state
 * (green = complete, amber = in progress / warning, red = blocking, grey =
 * pending / not started). Mirrors FORGE-MOCKUP-WORKSPACE.html `.art-card`
 * styling with semantic tokens.
 */

import Link from "next/link"
import { ArrowRight, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type ArtefactState = 'green' | 'amber' | 'red' | 'grey'

export interface ArtefactCardProps {
    icon: LucideIcon
    title: string
    subtitle: string
    body: React.ReactNode
    chips?: Array<{ label: string; tone?: 'success' | 'warning' | 'danger' | 'info' | 'muted' }>
    footerLabel: string
    grounding?: string
    state: ArtefactState
    href: string
}

const STATE_BORDER_CLASS: Record<ArtefactState, string> = {
    green: 'border-t-status-success',
    amber: 'border-t-status-warning',
    red: 'border-t-destructive',
    grey: 'border-t-muted-foreground/40',
}

const STATE_PILL_CLASS: Record<ArtefactState, string> = {
    green: 'bg-status-success-light text-status-success border-status-success/30',
    amber: 'bg-status-warning-light text-status-warning border-status-warning/30',
    red: 'bg-destructive/10 text-destructive border-destructive/30',
    grey: 'bg-muted text-muted-foreground border-border',
}

const CHIP_CLASS: Record<NonNullable<NonNullable<ArtefactCardProps['chips']>[number]['tone']>, string> = {
    success: 'bg-status-success-light text-status-success border-status-success/30',
    warning: 'bg-status-warning-light text-status-warning border-status-warning/30',
    danger: 'bg-destructive/10 text-destructive border-destructive/30',
    info: 'bg-electric-blue/10 text-electric-blue border-electric-blue/30',
    muted: 'bg-muted text-muted-foreground border-border',
}

export function ArtefactCard({
    icon: Icon,
    title,
    subtitle,
    body,
    chips,
    footerLabel,
    grounding,
    state,
    href,
}: ArtefactCardProps): React.ReactElement {
    return (
        <Link
            href={href}
            className={cn(
                "group relative flex flex-col rounded-xl border bg-background shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 overflow-hidden",
                "border-t-[3px]",
                STATE_BORDER_CLASS[state],
            )}
        >
            <div className="p-5 pb-3">
                <div className="flex items-start justify-between gap-3 mb-2">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-international-orange/10 text-international-orange">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <Badge variant="outline" className={cn("text-[10.5px] font-semibold uppercase tracking-wide", STATE_PILL_CLASS[state])}>
                        {state === 'green' ? 'Complete' : state === 'amber' ? 'In progress' : state === 'red' ? 'Blocking' : 'Pending'}
                    </Badge>
                </div>
                <h3 className="text-base font-semibold text-foreground tracking-tight mb-1">{title}</h3>
                <p className="text-[11.5px] text-muted-foreground mb-3">{subtitle}</p>
                <div className="text-sm text-foreground leading-relaxed mb-3">{body}</div>
                {chips && chips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1">
                        {chips.map((c, i) => (
                            <Badge key={i} variant="outline" className={cn("text-[10.5px] font-medium", CHIP_CLASS[c.tone ?? 'muted'])}>
                                {c.label}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>
            <div className="flex items-center justify-between mt-auto px-5 py-3 border-t border-border/50 bg-muted/20">
                <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-international-orange">
                    {footerLabel}
                    <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                </span>
                {grounding && (
                    <span className="text-[10px] text-muted-foreground/70 italic">{grounding}</span>
                )}
            </div>
        </Link>
    )
}
