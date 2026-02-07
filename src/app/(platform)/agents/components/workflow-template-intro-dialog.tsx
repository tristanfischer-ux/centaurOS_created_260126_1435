"use client"

/**
 * @file workflow-template-intro-dialog.tsx
 *
 * @description Intro dialog shown when a user selects a workflow template.
 * Explains what the workflow does, why it matters, and how the human-in-the-loop
 * pattern works — before loading the template onto the canvas.
 *
 * @security No sensitive data handling — purely presentational.
 */

import React from "react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import {
    ArrowRight,
    Clock,
    UserCheck,
    ShoppingBag,
    Layers,
} from "lucide-react"
import Link from "next/link"
import { CATEGORY_ACCENT_COLORS, type PromptCategory } from "../lib/agent-types"
import { getIcon } from "./prompt-node"
import type { WorkflowTemplate } from "../lib/agent-types"

interface WorkflowTemplateIntroDialogProps {
    /** The selected workflow template to preview */
    template: WorkflowTemplate | null
    /** Whether the dialog is open */
    open: boolean
    /** Callback to close the dialog */
    onOpenChange: (open: boolean) => void
    /** Callback to load the template onto the canvas */
    onConfirm: (template: WorkflowTemplate) => void
    /** Callback to go back to the template list */
    onBack: () => void
}

/**
 * Intro dialog that explains a workflow template before loading it.
 *
 * @description Shows three sections: (1) what the workflow does with a visual
 * step chain, (2) why this workflow matters with persuasive copy, and (3) the
 * human-in-the-loop pattern with a marketplace CTA.
 *
 * @param props - Component props
 * @returns The intro dialog, or null if no template is selected
 */
export function WorkflowTemplateIntroDialog({
    template,
    open,
    onOpenChange,
    onConfirm,
    onBack,
}: WorkflowTemplateIntroDialogProps): React.ReactElement | null {
    if (!template) return null

    const Icon = getIcon(template.icon)
    const humanTaskCount = template.nodes.filter(
        (n) => n.data.isHumanTask
    ).length
    const aiStepCount = template.nodeCount - humanTaskCount

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] p-0">
                {/* Header */}
                <DialogHeader className="p-6 pb-4">
                    <div className="flex items-center gap-3">
                        <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{
                                backgroundColor:
                                    template.category === "business"
                                        ? "rgba(59, 130, 246, 0.1)"
                                        : "rgba(234, 88, 12, 0.1)",
                            }}
                        >
                            <Icon
                                className="w-5 h-5"
                                style={{
                                    color:
                                        template.category === "business"
                                            ? "#2563eb"
                                            : "#ea580c",
                                }}
                            />
                        </div>
                        <div>
                            <DialogTitle className="font-display text-xl">
                                {template.name}
                            </DialogTitle>
                            {template.estimatedTime && (
                                <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>
                                        {template.nodeCount} steps &middot;{" "}
                                        {template.estimatedTime}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </DialogHeader>

                <ScrollArea className="max-h-[60vh] px-6 pb-6">
                    <div className="space-y-6">
                        {/* Section 1: What This Workflow Does */}
                        <section>
                            <div className="flex items-center gap-2 mb-3">
                                <Layers className="w-4 h-4 text-foreground" />
                                <h3 className="text-sm font-semibold text-foreground">
                                    What This Workflow Does
                                </h3>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                {template.description}
                            </p>

                            {/* Visual step chain */}
                            <div className="bg-muted/50 rounded-lg p-4">
                                <div className="flex flex-col gap-2">
                                    {template.nodes.map((node, i) => {
                                        const cat = node.data
                                            .category as PromptCategory | undefined
                                        const color = cat
                                            ? CATEGORY_ACCENT_COLORS[cat]
                                            : "#94a3b8"
                                        const isHuman = node.data.isHumanTask
                                        return (
                                            <div
                                                key={node.id}
                                                className="flex items-center gap-2"
                                            >
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    <span className="text-[10px] font-mono text-muted-foreground w-4 text-right flex-shrink-0">
                                                        {i + 1}
                                                    </span>
                                                    <span
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium truncate"
                                                        style={{
                                                            backgroundColor: isHuman
                                                                ? "rgba(148, 163, 184, 0.12)"
                                                                : `${color}12`,
                                                            color: isHuman
                                                                ? "#64748b"
                                                                : color,
                                                        }}
                                                    >
                                                        {isHuman && (
                                                            <UserCheck className="w-3 h-3 flex-shrink-0" />
                                                        )}
                                                        {node.data.label}
                                                    </span>
                                                </div>
                                                {i < template.nodes.length - 1 && (
                                                    <ArrowRight className="w-3 h-3 text-muted-foreground/40 flex-shrink-0 rotate-90" />
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </section>

                        {/* Section 2: Why This Matters */}
                        <section>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-4 h-4 rounded-full bg-international-orange/20 flex items-center justify-center flex-shrink-0">
                                    <div className="w-2 h-2 rounded-full bg-international-orange" />
                                </div>
                                <h3 className="text-sm font-semibold text-foreground">
                                    Why This Matters
                                </h3>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {template.whyItMatters}
                            </p>
                        </section>

                        {/* Section 3: Human in the Loop */}
                        <section className="bg-muted/30 rounded-lg p-4 border border-muted">
                            <div className="flex items-center gap-2 mb-3">
                                <UserCheck className="w-4 h-4 text-foreground" />
                                <h3 className="text-sm font-semibold text-foreground">
                                    Human in the Loop
                                </h3>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                                This workflow includes{" "}
                                <span className="font-semibold text-foreground">
                                    {humanTaskCount} human checkpoint
                                    {humanTaskCount !== 1 ? "s" : ""}
                                </span>{" "}
                                where you review, validate, and make decisions.
                                AI generates the analysis across{" "}
                                <span className="font-semibold text-foreground">
                                    {aiStepCount} steps
                                </span>{" "}
                                — you make the calls.
                            </p>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                For steps where you need expert help, our{" "}
                                <Link
                                    href="/marketplace"
                                    className="text-electric-blue hover:underline font-medium"
                                >
                                    <ShoppingBag className="w-3.5 h-3.5 inline mr-0.5 -mt-0.5" />
                                    Marketplace
                                </Link>{" "}
                                connects you with vetted professionals who can
                                review outputs, validate decisions, and fill
                                expertise gaps.
                            </p>
                        </section>
                    </div>
                </ScrollArea>

                {/* Footer */}
                <DialogFooter className="px-6 py-4 border-t">
                    <div className="flex w-full items-center justify-between">
                        <Button variant="secondary" onClick={onBack}>
                            Back to Templates
                        </Button>
                        <Button
                            onClick={() => onConfirm(template)}
                            className="gap-2"
                        >
                            Load Workflow
                            <ArrowRight className="w-4 h-4" />
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
