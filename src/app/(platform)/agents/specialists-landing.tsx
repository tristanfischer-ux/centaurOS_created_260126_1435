"use client"

import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { ArrowRight, Layers, Users, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
// Design system imported only when needed for inline usage
import { SPECIALISTS, SPECIALIST_ROWS, getSpecialistsByRow } from "./specialists-data"
import { SpecialistCard } from "./specialist-card"
import { getPromptsByCategory } from "./lib/prompt-library"
import { BriefSpecialistDialog } from "./brief-specialist-dialog"
import { TeamMeetingDialog } from "./team-meeting-dialog"

interface SpecialistsLandingProps {
    /** Callback to switch to the workflow builder ("Team Project" mode) */
    onOpenProjectBuilder: () => void
}

/**
 * SpecialistsLanding -- The default view for the Specialists page.
 *
 * @description Displays a 3x3 grid of specialist cards organized by
 * KNOW / GROW / RUN rows, with a hero message, row labels, and a
 * "Plan a Team Project" CTA that opens the workflow builder.
 */
export function SpecialistsLanding({
    onOpenProjectBuilder,
}: SpecialistsLandingProps) {
    const [briefSpecialistId, setBriefSpecialistId] = useState<string | null>(null)
    const [isMeetingOpen, setIsMeetingOpen] = useState(false)
    const [handoffContext, setHandoffContext] = useState<string | null>(null)
    const [referredByName, setReferredByName] = useState<string | null>(null)

    // Pre-compute capability counts for each specialist
    const capabilityCounts = useMemo(() => {
        const counts: Record<string, number> = {}
        for (const specialist of SPECIALISTS) {
            let count = 0
            for (const cat of specialist.categories) {
                count += getPromptsByCategory(cat).length
            }
            counts[specialist.id] = count
        }
        return counts
    }, [])

    const totalBriefs = useMemo(() => {
        return Object.values(capabilityCounts).reduce((sum, count) => sum + count, 0)
    }, [capabilityCounts])

    const selectedSpecialist = SPECIALISTS.find((s) => s.id === briefSpecialistId)

    const handleBrief = (specialistId: string) => {
        // Clear handoff when opening directly (not via switch)
        setHandoffContext(null)
        setReferredByName(null)
        setBriefSpecialistId(specialistId)
    }

    // Running index for staggered animation across all cards
    let cardIndex = 0

    return (
        <div className="space-y-10 pb-12">
            {/* ── Hero Section ──────────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="space-y-5"
            >
                <div className="max-w-3xl space-y-4">
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-display font-bold text-foreground tracking-tight leading-tight">
                        Your team is bigger than you think.
                    </h2>
                    <p className="text-lg text-muted-foreground leading-relaxed">
                        Nine specialists, ready right now. Brief them on anything &mdash; strategy, sales,
                        fundraising, legal, hiring, product, and more. No recruiting. No waiting. No payroll.
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-sm text-foreground font-medium">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span>9 specialists</span>
                            <span className="text-muted-foreground">&middot;</span>
                            <span>{totalBriefs} briefs ready</span>
                        </div>
                        <Button
                            onClick={() => setIsMeetingOpen(true)}
                            className="bg-international-orange hover:bg-international-orange-hover text-white rounded-full"
                            size="sm"
                        >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Call a Team Meeting
                        </Button>
                    </div>
                </div>
            </motion.div>

            {/* ── Specialist Rows ───────────────────────────────────────── */}
            {SPECIALIST_ROWS.map((row, rowIndex) => {
                const rowSpecialists = getSpecialistsByRow(row.id)

                return (
                    <div key={row.id} className="space-y-4">
                        {/* Row Label */}
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.4, delay: rowIndex * 0.15 }}
                            className="flex items-center gap-3"
                        >
                            <div className={`h-6 w-1 rounded-full ${row.accentColor}`} />
                            <div>
                                <h3 className="text-xs font-mono uppercase tracking-widest text-foreground font-semibold">
                                    {row.label}
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                    {row.subtitle}
                                </p>
                            </div>
                        </motion.div>

                        {/* Specialist Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {rowSpecialists.map((specialist) => {
                                const idx = cardIndex++
                                return (
                                    <SpecialistCard
                                        key={specialist.id}
                                        specialist={specialist}
                                        capabilityCount={capabilityCounts[specialist.id] ?? 0}
                                        onBrief={handleBrief}
                                        index={idx}
                                    />
                                )
                            })}
                        </div>
                    </div>
                )
            })}

            {/* ── Team Project CTA ─────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.8 }}
            >
                <Card className="border-dashed border-2 bg-muted/30 rounded-xl">
                    <CardContent className="pt-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-muted">
                                    <Layers className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div>
                                    <h3 className="font-display font-semibold text-foreground">
                                        Plan a Team Project
                                    </h3>
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                        For complex, multi-step work &mdash; brief multiple specialists in sequence
                                        and build a complete project from start to finish.
                                    </p>
                                </div>
                            </div>
                            <Button
                                variant="secondary"
                                className="flex-shrink-0"
                                onClick={onOpenProjectBuilder}
                            >
                                Open Project Builder
                                <ArrowRight className="h-4 w-4 ml-2" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* ── Brief Dialog ──────────────────────────────────────────── */}
            {selectedSpecialist && (
                <BriefSpecialistDialog
                    specialist={selectedSpecialist}
                    open={briefSpecialistId !== null}
                    onOpenChange={(open) => {
                        if (!open) {
                            setBriefSpecialistId(null)
                            setHandoffContext(null)
                            setReferredByName(null)
                        }
                    }}
                    onSwitchSpecialist={(id, context) => {
                        // Capture the current specialist's name for the "Referred by" badge
                        const fromName = selectedSpecialist.name
                        setHandoffContext(context ?? null)
                        setReferredByName(context ? fromName : null)
                        setBriefSpecialistId(id)
                    }}
                    handoffContext={handoffContext}
                    referredBy={referredByName}
                />
            )}

            {/* ── Team Meeting Dialog ──────────────────────────────────── */}
            <TeamMeetingDialog
                open={isMeetingOpen}
                onOpenChange={setIsMeetingOpen}
            />
        </div>
    )
}
