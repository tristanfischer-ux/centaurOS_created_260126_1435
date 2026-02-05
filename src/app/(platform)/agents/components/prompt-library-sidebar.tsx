"use client"

import React, { useState, useMemo } from "react"
import { Search, X, GripVertical } from "lucide-react"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PROMPT_LIBRARY, searchPrompts, getPromptsByCategory } from "../lib/prompt-library"
import { CATEGORY_META, PROMPT_CATEGORIES, CATEGORY_ACCENT_COLORS, type PromptCategory } from "../lib/agent-types"
import { getIcon } from "./prompt-node"
import { cn } from "@/lib/utils"

interface PromptLibrarySidebarProps {
    onClose: () => void
}

export function PromptLibrarySidebar({ onClose }: PromptLibrarySidebarProps) {
    const [searchQuery, setSearchQuery] = useState("")
    const [activeCategory, setActiveCategory] = useState<PromptCategory | "all">("all")

    const filteredPrompts = useMemo(() => {
        let prompts = PROMPT_LIBRARY
        if (searchQuery.trim()) {
            prompts = searchPrompts(searchQuery)
        }
        if (activeCategory !== "all") {
            prompts = prompts.filter((p) => p.category === activeCategory)
        }
        return prompts
    }, [searchQuery, activeCategory])

    // Group by category for display
    const groupedPrompts = useMemo(() => {
        const groups: Record<string, typeof filteredPrompts> = {}
        for (const p of filteredPrompts) {
            if (!groups[p.category]) groups[p.category] = []
            groups[p.category].push(p)
        }
        return groups
    }, [filteredPrompts])

    const onDragStart = (event: React.DragEvent, promptId: string) => {
        event.dataTransfer.setData("application/promptId", promptId)
        event.dataTransfer.effectAllowed = "move"
    }

    return (
        <div className="w-80 border-r border-slate-100 bg-white flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b border-slate-100">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-foreground">
                        Prompt Library
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-slate-100 text-muted-foreground"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search prompts..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9 text-sm"
                    />
                </div>
            </div>

            {/* Category pills */}
            <div className="px-4 py-3 border-b border-slate-100">
                <div className="flex flex-wrap gap-1.5">
                    <button
                        onClick={() => setActiveCategory("all")}
                        className={cn(
                            "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors",
                            activeCategory === "all"
                                ? "bg-slate-900 text-white"
                                : "bg-slate-100 text-muted-foreground hover:bg-slate-200"
                        )}
                    >
                        All ({PROMPT_LIBRARY.length})
                    </button>
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
                                        : "bg-slate-100 text-muted-foreground hover:bg-slate-200"
                                )}
                                style={
                                    activeCategory === cat
                                        ? { ringColor: CATEGORY_ACCENT_COLORS[cat] }
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
                        const meta = CATEGORY_META[category as PromptCategory]
                        if (!meta) return null

                        return (
                            <div key={category}>
                                <div className="flex items-center gap-2 px-1 mb-2">
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
                                </div>

                                <div className="space-y-1">
                                    {prompts.map((prompt) => {
                                        const Icon = getIcon(prompt.icon)
                                        const color =
                                            CATEGORY_ACCENT_COLORS[
                                                prompt.category
                                            ]

                                        return (
                                            <div
                                                key={prompt.id}
                                                draggable
                                                onDragStart={(e) =>
                                                    onDragStart(e, prompt.id)
                                                }
                                                className="group flex items-center gap-2.5 p-2.5 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 cursor-grab active:cursor-grabbing transition-all"
                                            >
                                                <GripVertical className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
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
                                No prompts found
                            </p>
                        </div>
                    )}
                </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-3 border-t border-slate-100 bg-slate-50/50">
                <p className="text-[10px] text-muted-foreground text-center">
                    Drag prompts onto the canvas to build workflows
                </p>
            </div>
        </div>
    )
}
