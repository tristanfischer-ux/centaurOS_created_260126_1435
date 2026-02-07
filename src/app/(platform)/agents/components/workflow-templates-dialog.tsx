"use client"

import React, { useState, useCallback, useRef, useEffect } from "react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react"
import { WORKFLOW_TEMPLATES } from "../lib/workflow-templates"
import { CATEGORY_ACCENT_COLORS, type PromptCategory } from "../lib/agent-types"
import { getIcon } from "./prompt-node"
import { WorkflowTemplateIntroDialog } from "./workflow-template-intro-dialog"
import { cn } from "@/lib/utils"
import type { WorkflowTemplate } from "../lib/agent-types"

/** Category definition used for navigation and rendering. */
interface CategoryDef {
    id: string
    label: string
    accentClass: string
    templates: WorkflowTemplate[]
}

interface WorkflowTemplatesDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSelectTemplate: (template: WorkflowTemplate) => void
}

/**
 * Dialog listing all workflow templates, grouped by category.
 *
 * @description Includes a sticky category navigation bar with chevron
 * prev/next buttons so users can jump between categories without scrolling.
 * When a user clicks "Use" on a template, an intro dialog is shown first
 * to explain what the workflow does, why it matters, and the human-in-the-loop
 * pattern. The user can then confirm to load it.
 */
export function WorkflowTemplatesDialog({
    open,
    onOpenChange,
    onSelectTemplate,
}: WorkflowTemplatesDialogProps) {
    const [previewTemplate, setPreviewTemplate] = useState<WorkflowTemplate | null>(null)
    const [activeCategoryId, setActiveCategoryId] = useState<string>("startup")

    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

    const categories: CategoryDef[] = [
        {
            id: "startup",
            label: "Startup & Fundraising",
            accentClass: "bg-international-orange",
            templates: WORKFLOW_TEMPLATES.filter((t) => t.category === "startup"),
        },
        {
            id: "manufacturing",
            label: "Manufacturing & Materials",
            accentClass: "bg-international-orange",
            templates: WORKFLOW_TEMPLATES.filter((t) => t.category === "manufacturing"),
        },
        {
            id: "business",
            label: "General Business",
            accentClass: "bg-electric-blue",
            templates: WORKFLOW_TEMPLATES.filter((t) => t.category === "business"),
        },
    ]

    // Track which category section is visible via IntersectionObserver
    useEffect(() => {
        if (!open) return

        const container = scrollContainerRef.current
        if (!container) return

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        const id = entry.target.getAttribute("data-category-id")
                        if (id) setActiveCategoryId(id)
                    }
                }
            },
            {
                root: container,
                // Trigger when top of section is near top of scroll area
                rootMargin: "-10% 0px -80% 0px",
                threshold: 0,
            }
        )

        // Observe each section after a tick (refs need to be set)
        const timer = setTimeout(() => {
            for (const cat of categories) {
                const el = sectionRefs.current[cat.id]
                if (el) observer.observe(el)
            }
        }, 50)

        return () => {
            clearTimeout(timer)
            observer.disconnect()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    /** Smooth-scroll to a category section. */
    const scrollToCategory = useCallback((categoryId: string) => {
        const el = sectionRefs.current[categoryId]
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" })
            setActiveCategoryId(categoryId)
        }
    }, [])

    const activeCategoryIndex = categories.findIndex((c) => c.id === activeCategoryId)
    const isFirstCategory = activeCategoryIndex <= 0
    const isLastCategory = activeCategoryIndex >= categories.length - 1

    const goToPrevCategory = useCallback(() => {
        const idx = categories.findIndex((c) => c.id === activeCategoryId)
        if (idx > 0) scrollToCategory(categories[idx - 1].id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeCategoryId, scrollToCategory])

    const goToNextCategory = useCallback(() => {
        const idx = categories.findIndex((c) => c.id === activeCategoryId)
        if (idx < categories.length - 1) scrollToCategory(categories[idx + 1].id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeCategoryId, scrollToCategory])

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
            <DialogContent className="max-w-3xl max-h-[80vh] p-0 flex flex-col">
                <DialogHeader className="p-6 pb-4 flex-shrink-0">
                    <DialogTitle className="font-display text-xl">
                        Workflow Templates
                    </DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground">
                        Start with a pre-built workflow. Each template is a
                        daisy-chain of prompts designed to work together.
                    </DialogDescription>
                </DialogHeader>

                {/* Sticky category navigation bar */}
                <div className="flex-shrink-0 px-6 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={goToPrevCategory}
                            disabled={isFirstCategory}
                            className={cn(
                                "p-1.5 rounded-lg transition-colors flex-shrink-0",
                                isFirstCategory
                                    ? "text-muted-foreground/30 cursor-not-allowed"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                            aria-label="Previous category"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-1.5 flex-1 overflow-x-auto">
                            {categories.map((cat) => {
                                const isActive = cat.id === activeCategoryId
                                return (
                                    <button
                                        key={cat.id}
                                        onClick={() => scrollToCategory(cat.id)}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
                                            isActive
                                                ? "bg-international-orange text-white"
                                                : "bg-muted text-foreground hover:bg-muted/80"
                                        )}
                                    >
                                        {cat.label}
                                        <span
                                            className={cn(
                                                "text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center leading-none",
                                                isActive
                                                    ? "bg-white/25 text-white"
                                                    : "bg-background text-muted-foreground"
                                            )}
                                        >
                                            {cat.templates.length}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>

                        <button
                            onClick={goToNextCategory}
                            disabled={isLastCategory}
                            className={cn(
                                "p-1.5 rounded-lg transition-colors flex-shrink-0",
                                isLastCategory
                                    ? "text-muted-foreground/30 cursor-not-allowed"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                            aria-label="Next category"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Scrollable template list */}
                <div
                    ref={scrollContainerRef}
                    className="overflow-y-auto flex-1 px-6 pb-6"
                    style={{ maxHeight: "55vh" }}
                >
                    <div className="space-y-8 pt-4">
                        {categories.map((cat) => (
                            <div
                                key={cat.id}
                                ref={(el) => { sectionRefs.current[cat.id] = el }}
                                data-category-id={cat.id}
                            >
                                <div className="flex items-center gap-2 mb-4">
                                    <div className={cn("h-5 w-1 rounded-full", cat.accentClass)} />
                                    <h3 className="text-sm font-semibold text-foreground">
                                        {cat.label}
                                    </h3>
                                    <span className="text-xs text-muted-foreground">
                                        ({cat.templates.length})
                                    </span>
                                </div>
                                <div className="grid gap-3">
                                    {cat.templates.map((template) => (
                                        <TemplateCard
                                            key={template.id}
                                            template={template}
                                            onSelect={handleSelectForPreview}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
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
