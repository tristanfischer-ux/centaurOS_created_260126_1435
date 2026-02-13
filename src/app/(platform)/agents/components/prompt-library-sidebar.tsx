"use client"

import React, { useState, useMemo, useEffect } from "react"
import { Search, X, GripVertical, Plus, Trash2, User } from "lucide-react"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { PROMPT_LIBRARY, searchPrompts, getPromptsByCategory } from "../lib/prompt-library"
import { CATEGORY_META, PROMPT_CATEGORIES, CATEGORY_ACCENT_COLORS, type PromptCategory, type CustomPrompt, type PromptTemplate } from "../lib/agent-types"
import { deleteAgentCustomPrompt } from "@/actions/agent-workflows"
import type { AgentCustomPromptRow } from "@/actions/agent-workflows"
import { getIcon } from "./prompt-node"
import { cn } from "@/lib/utils"

interface PromptLibrarySidebarProps {
    onClose: () => void
    onCreatePrompt: () => void
    customPrompts: CustomPrompt[]
    dbCustomPrompts: AgentCustomPromptRow[]
    onCustomPromptsChange: (updated: AgentCustomPromptRow[]) => void
}

export function PromptLibrarySidebar({ onClose, onCreatePrompt, customPrompts, dbCustomPrompts, onCustomPromptsChange }: PromptLibrarySidebarProps) {
    const [searchQuery, setSearchQuery] = useState("")
    const [activeCategory, setActiveCategory] = useState<PromptCategory | "all" | "custom">("all")

    // Combine library + custom for search
    const allPrompts = useMemo(() => {
        return [...PROMPT_LIBRARY, ...customPrompts] as PromptTemplate[]
    }, [customPrompts])

    const filteredPrompts = useMemo(() => {
        let prompts = allPrompts
        if (activeCategory === "custom") {
            prompts = customPrompts
        } else if (activeCategory !== "all") {
            prompts = prompts.filter((p) => p.category === activeCategory)
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            prompts = prompts.filter(
                (p) =>
                    p.title.toLowerCase().includes(q) ||
                    p.description.toLowerCase().includes(q) ||
                    p.tags.some((t) => t.toLowerCase().includes(q))
            )
        }
        return prompts
    }, [searchQuery, activeCategory, allPrompts, customPrompts])

    // Group by category for display
    const groupedPrompts = useMemo(() => {
        const groups: Record<string, PromptTemplate[]> = {}

        // Custom prompts first if viewing "all"
        if (activeCategory !== "custom") {
            const customs = filteredPrompts.filter((p) => "isCustom" in p)
            if (customs.length > 0) {
                groups["_custom"] = customs
            }
        }

        for (const p of filteredPrompts) {
            if ("isCustom" in p && activeCategory !== "custom") continue
            if (!groups[p.category]) groups[p.category] = []
            groups[p.category].push(p)
        }

        if (activeCategory === "custom") {
            return { _custom: filteredPrompts }
        }

        return groups
    }, [filteredPrompts, activeCategory])

    const onDragStart = (event: React.DragEvent, promptId: string) => {
        event.dataTransfer.setData("application/promptId", promptId)
        event.dataTransfer.effectAllowed = "move"
    }

    const handleDeleteCustom = async (id: string) => {
        const { error } = await deleteAgentCustomPrompt(id)
        if (error) {
            console.error("[PromptSidebar] Failed to delete custom prompt:", { id, error })
            return
        }
        // Update parent state by removing the deleted prompt
        onCustomPromptsChange(dbCustomPrompts.filter((p) => p.id !== id))
    }

    return (
        <div className="w-80 border-r bg-background flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-foreground">
                        Brief Library
                    </h2>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onCreatePrompt}
                            className="h-7 px-2 text-[11px] gap-1"
                        >
                            <Plus className="w-3 h-3" />
                            Create
                        </Button>
                        <button
                            onClick={onClose}
                            className="p-1 rounded-md hover:bg-muted text-muted-foreground"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search briefs..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9 text-sm"
                    />
                </div>
            </div>

            {/* Category pills */}
            <div className="px-4 py-3 border-b">
                <div className="flex flex-wrap gap-1.5">
                    <button
                        onClick={() => setActiveCategory("all")}
                        className={cn(
                            "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors",
                            activeCategory === "all"
                                ? "bg-slate-900 text-white"
                                : "bg-muted text-muted-foreground hover:bg-muted"
                        )}
                    >
                        All ({allPrompts.length})
                    </button>
                    {customPrompts.length > 0 && (
                        <button
                            onClick={() => setActiveCategory("custom")}
                            className={cn(
                                "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors",
                                activeCategory === "custom"
                                    ? "bg-orange-500 text-white"
                                    : "bg-orange-50 text-orange-600 hover:bg-orange-100"
                            )}
                        >
                            My Briefs ({customPrompts.length})
                        </button>
                    )}
                    {PROMPT_CATEGORIES.map((cat) => {
                        const meta = CATEGORY_META[cat]
                        const count = getPromptsByCategory(cat).length
                        return (
                            <button
                                key={cat}
                                onClick={() =>
                                    setActiveCategory(
                                        activeCategory === cat ? "all" : cat
                                    )
                                }
                                className={cn(
                                    "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors",
                                    activeCategory === cat
                                        ? `${meta.bgColor} ${meta.color} ring-1`
                                        : "bg-muted text-muted-foreground hover:bg-muted"
                                )}
                                style={
                                    activeCategory === cat
                                        ? { '--tw-ring-color': CATEGORY_ACCENT_COLORS[cat] } as React.CSSProperties
                                        : undefined
                                }
                            >
                                {meta.label} ({count})
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Prompt list */}
            <ScrollArea className="flex-1">
                <div className="p-3 space-y-4">
                    {Object.entries(groupedPrompts).map(([category, prompts]) => {
                        const isCustomGroup = category === "_custom"
                        const meta = isCustomGroup ? null : CATEGORY_META[category as PromptCategory]

                        return (
                            <div key={category}>
                                <div className="flex items-center gap-2 px-1 mb-2">
                                    {isCustomGroup ? (
                                        <>
                                            <User className="w-3 h-3 text-orange-500" />
                                            <span className="text-[11px] font-semibold text-orange-600 uppercase tracking-wider">
                                                My Briefs
                                            </span>
                                        </>
                                    ) : meta ? (
                                        <>
                                            <div
                                                className="w-2 h-2 rounded-full"
                                                style={{
                                                    backgroundColor:
                                                        CATEGORY_ACCENT_COLORS[
                                                            category as PromptCategory
                                                        ],
                                                }}
                                            />
                                            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                                {meta.label}
                                            </span>
                                        </>
                                    ) : null}
                                </div>

                                <div className="space-y-1">
                                    {prompts.map((prompt) => {
                                        const Icon = getIcon(prompt.icon)
                                        const color =
                                            CATEGORY_ACCENT_COLORS[
                                                prompt.category
                                            ]
                                        const isCustom = "isCustom" in prompt

                                        return (
                                            <div
                                                key={prompt.id}
                                                draggable
                                                onDragStart={(e) =>
                                                    onDragStart(e, prompt.id)
                                                }
                                                className="group flex items-center gap-2.5 p-2.5 rounded-lg border border-transparent hover:border hover:bg-muted cursor-grab active:cursor-grabbing transition-all"
                                            >
                                                <GripVertical className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                                <div
                                                    className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                                                    style={{
                                                        backgroundColor: `${color}12`,
                                                    }}
                                                >
                                                    <Icon
                                                        className="w-3.5 h-3.5"
                                                        style={{ color }}
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-medium text-foreground truncate">
                                                        {prompt.title}
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground truncate">
                                                        {prompt.description}
                                                    </p>
                                                </div>
                                                {isCustom && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            e.preventDefault()
                                                            handleDeleteCustom(prompt.id)
                                                        }}
                                                        className="p-1 rounded hover:bg-status-error-light text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}

                    {filteredPrompts.length === 0 && (
                        <div className="text-center py-8">
                            <p className="text-sm text-muted-foreground">
                                No briefs found
                            </p>
                            {activeCategory === "custom" && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onCreatePrompt}
                                    className="mt-2 gap-1.5 text-xs"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Create your first brief
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-3 border-t bg-muted/30">
                <p className="text-[10px] text-muted-foreground text-center">
                    Drag briefs onto the canvas to build projects
                </p>
            </div>
        </div>
    )
}
