"use client"

import React, { useState, useCallback } from "react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { WORKFLOW_TEMPLATES } from "../lib/workflow-templates"
import { CATEGORY_ACCENT_COLORS, type PromptCategory } from "../lib/agent-types"
import { getIcon } from "./prompt-node"
import { WorkflowTemplateIntroDialog } from "./workflow-template-intro-dialog"
import type { WorkflowTemplate } from "../lib/agent-types"

interface WorkflowTemplatesDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSelectTemplate: (template: WorkflowTemplate) => void
}

/**
 * Dialog listing all workflow templates, grouped by category.
 *
 * @description When a user clicks "Use" on a template, an intro dialog
 * is shown first to explain what the workflow does, why it matters, and
 * the human-in-the-loop pattern. The user can then confirm to load it.
 */
export function WorkflowTemplatesDialog({
    open,
    onOpenChange,
    onSelectTemplate,
}: WorkflowTemplatesDialogProps) {
    const [previewTemplate, setPreviewTemplate] = useState<WorkflowTemplate | null>(null)

    const startupTemplates = WORKFLOW_TEMPLATES.filter(
        (t) => t.category === "startup"
    )
    const businessTemplates = WORKFLOW_TEMPLATES.filter(
        (t) => t.category === "business"
    )
    const manufacturingTemplates = WORKFLOW_TEMPLATES.filter(
        (t) => t.category === "manufacturing"
    )

    const handleSelectForPreview = useCallback((template: WorkflowTemplate) => {
        setPreviewTemplate(template)
    }, [])

    const handleConfirmLoad = useCallback(
        (template: WorkflowTemplate) => {
            setPreviewTemplate(null)
            onOpenChange(false)
            onSelectTemplate(template)
        },
        [onOpenChange, onSelectTemplate]
    )

    const handleBackToList = useCallback(() => {
        setPreviewTemplate(null)
    }, [])

    // Show intro dialog when a template is selected for preview
    if (previewTemplate) {
        return (
            <WorkflowTemplateIntroDialog
                template={previewTemplate}
                open={true}
                onOpenChange={(isOpen) => {
                    if (!isOpen) {
                        setPreviewTemplate(null)
                    }
                }}
                onConfirm={handleConfirmLoad}
                onBack={handleBackToList}
            />
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[80vh] p-0">
                <DialogHeader className="p-6 pb-4">
                    <DialogTitle className="font-display text-xl">
                        Workflow Templates
                    </DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground">
                        Start with a pre-built workflow. Each template is a
                        daisy-chain of prompts designed to work together.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[60vh] px-6 pb-6">
                    <div className="space-y-8">
                        {/* Startup templates */}
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <div className="h-5 w-1 bg-international-orange rounded-full" />
                                <h3 className="text-sm font-semibold text-foreground">
                                    Startup & Fundraising
                                </h3>
                            </div>
                            <div className="grid gap-3">
                                {startupTemplates.map((template) => (
                                    <TemplateCard
                                        key={template.id}
                                        template={template}
                                        onSelect={handleSelectForPreview}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Manufacturing templates */}
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <div className="h-5 w-1 bg-international-orange rounded-full" />
                                <h3 className="text-sm font-semibold text-foreground">
                                    Manufacturing & Materials
                                </h3>
                            </div>
                            <div className="grid gap-3">
                                {manufacturingTemplates.map((template) => (
                                    <TemplateCard
                                        key={template.id}
                                        template={template}
                                        onSelect={handleSelectForPreview}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Business templates */}
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <div className="h-5 w-1 bg-electric-blue rounded-full" />
                                <h3 className="text-sm font-semibold text-foreground">
                                    General Business
                                </h3>
                            </div>
                            <div className="grid gap-3">
                                {businessTemplates.map((template) => (
                                    <TemplateCard
                                        key={template.id}
                                        template={template}
                                        onSelect={handleSelectForPreview}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    )
}

function TemplateCard({
    template,
    onSelect,
}: {
    template: WorkflowTemplate
    onSelect: (template: WorkflowTemplate) => void
}) {
    const Icon = getIcon(template.icon)

    // Get a preview of the chain
    const chainPreview = template.nodes.map((n) => n.data.label).filter(Boolean)

    return (
        <div className="group border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{
                            backgroundColor:
                                template.category === "startup"
                                    ? "rgba(234, 88, 12, 0.1)"
                                    : template.category === "manufacturing"
                                      ? "rgba(234, 88, 12, 0.1)"
                                      : "rgba(59, 130, 246, 0.1)",
                        }}
                    >
                        <Icon
                            className="w-5 h-5"
                            style={{
                                color:
                                    template.category === "startup"
                                        ? "#ea580c"
                                        : template.category === "manufacturing"
                                          ? "#ea580c"
                                          : "#2563eb",
                            }}
                        />
                    </div>
                    <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-foreground">
                            {template.name}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            {template.description}
                        </p>

                        {/* Chain preview */}
                        <div className="flex flex-wrap items-center gap-1 mt-3">
                            {chainPreview.map((label, i) => {
                                const nodeData = template.nodes[i]?.data
                                const cat = nodeData?.category as PromptCategory | undefined
                                const color = cat
                                    ? CATEGORY_ACCENT_COLORS[cat]
                                    : "#94a3b8"
                                return (
                                    <React.Fragment key={i}>
                                        <span
                                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium"
                                            style={{
                                                backgroundColor: `${color}12`,
                                                color: color,
                                            }}
                                        >
                                            {label}
                                        </span>
                                        {i < chainPreview.length - 1 && (
                                            <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                                        )}
                                    </React.Fragment>
                                )
                            })}
                        </div>
                    </div>
                </div>

                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onSelect(template)}
                    className="gap-1.5 text-xs flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    Use
                    <ArrowRight className="w-3.5 h-3.5" />
                </Button>
            </div>
        </div>
    )
}
