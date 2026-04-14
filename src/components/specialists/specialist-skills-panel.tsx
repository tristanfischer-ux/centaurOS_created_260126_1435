"use client"

/**
 * @file specialist-skills-panel.tsx — Compact panel showing available skills for a specialist.
 *
 * @description Renders a horizontal row of skill chips inside the chat dialog.
 * Each chip shows the skill name, a short description, an icon, and an output-type badge.
 * Clicking a chip injects a trigger phrase into the chat input.
 *
 * Design rules:
 * - Semantic color tokens only (no hardcoded hex)
 * - International Orange accents on hover
 * - Badge component from shadcn
 * - Compact — each skill chip is ~200px wide
 * - Horizontal scroll on mobile, all visible on desktop
 *
 * @related
 * - Skill definitions: src/lib/agents/specialist-skills.ts
 * - Chat dialog: src/app/(platform)/agents/brief-specialist-dialog.tsx
 * - Specialist config: src/lib/agents/specialists-config.ts
 */

import { type SpecialistSkill, getSkillsForSpecialist } from "@/lib/agents/specialist-skills"
import type { SpecialistId } from "@/lib/agents/specialists-config"
import { Badge } from "@/components/ui/badge"
import { useMemo } from "react"
import {
    Target, FileText, ListChecks, Cpu, GitBranch, Map,
    LayoutGrid, AlertTriangle, Workflow, Factory, GanttChart, Scale,
    ClipboardList, Send, ShieldAlert, ListOrdered, Users, Rocket,
    Calendar, Search, Mail, BarChart3, DollarSign, BookOpen, ScrollText,
    Calculator, TrendingDown, Coins, Presentation, UserSearch, Network,
    Shield, Lock, CheckSquare,
} from "lucide-react"

// ─── Icon Map ────────────────────────────────────────────────────────────────
// INTENT: Maps icon name strings from skill definitions to actual Lucide components.
// This allows the skill registry to be plain data (serializable) while the UI
// resolves icons at render time.

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    Target, FileText, ListChecks, Cpu, GitBranch, Map,
    LayoutGrid, AlertTriangle, Workflow, Factory, GanttChart, Scale,
    ClipboardList, Send, ShieldAlert, ListOrdered, Users, Rocket,
    Calendar, Search, Mail, BarChart3, DollarSign, BookOpen, ScrollText,
    Calculator, TrendingDown, Coins, Presentation, UserSearch, Network,
    Shield, Lock, CheckSquare,
}

// ─── Output Type Labels ──────────────────────────────────────────────────────

const OUTPUT_LABELS: Record<string, string> = {
    document: "PDF",
    presentation: "PPTX",
    spreadsheet: "CSV",
    email: "Email",
    checklist: "Checklist",
    analysis: "Analysis",
    report: "Report",
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface SpecialistSkillsPanelProps {
    /** Canonical specialist ID used to look up available skills */
    specialistId: string
    /** Called when the user clicks a skill chip */
    onSkillSelect: (skill: SpecialistSkill) => void
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * SpecialistSkillsPanel — Renders a horizontal row of skill chips.
 *
 * @description Used inside the specialist chat dialog to surface available
 * structured-output capabilities. Each chip is clickable and triggers the
 * onSkillSelect callback with the full skill definition.
 *
 * Returns null if the specialist has no registered skills, so it can be
 * rendered unconditionally without layout side effects.
 */
export function SpecialistSkillsPanel({ specialistId, onSkillSelect }: SpecialistSkillsPanelProps) {
    const skills = useMemo(
        () => getSkillsForSpecialist(specialistId as SpecialistId),
        [specialistId]
    )

    if (skills.length === 0) return null

    return (
        <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Skills
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
                {skills.map((skill) => {
                    const Icon = ICON_MAP[skill.icon] || FileText
                    return (
                        <button
                            key={skill.id}
                            type="button"
                            onClick={() => onSkillSelect(skill)}
                            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-card hover:bg-international-orange/5 border-border hover:border-international-orange/40 transition-all duration-200 whitespace-nowrap group min-w-0 shrink-0"
                        >
                            <div className="h-7 w-7 rounded-md bg-international-orange/10 flex items-center justify-center shrink-0">
                                <Icon className="h-3.5 w-3.5 text-international-orange" />
                            </div>
                            <div className="text-left min-w-0">
                                <p className="text-xs font-semibold text-foreground group-hover:text-international-orange transition-colors">
                                    {skill.name}
                                </p>
                                <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                                    {skill.description}
                                </p>
                            </div>
                            <Badge variant="secondary" size="sm" className="shrink-0 ml-1">
                                {OUTPUT_LABELS[skill.outputType] || skill.outputType}
                            </Badge>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
