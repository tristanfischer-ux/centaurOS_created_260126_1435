"use client"

import React, { useState, useCallback } from "react"
import {
    Save,
    Plus,
    LayoutTemplate,
    Copy,
    Check,
    PanelLeftClose,
    PanelLeft,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip"

interface WorkflowToolbarProps {
    workflowName: string
    onNameChange: (name: string) => void
    onSave: () => void
    onNew: () => void
    onOpenTemplates: () => void
    onCopyAll: () => void
    onToggleSidebar: () => void
    sidebarOpen: boolean
    nodeCount: number
}

export function WorkflowToolbar({
    workflowName,
    onNameChange,
    onSave,
    onNew,
    onOpenTemplates,
    onCopyAll,
    onToggleSidebar,
    sidebarOpen,
    nodeCount,
}: WorkflowToolbarProps) {
    const [copied, setCopied] = useState(false)
    const [saved, setSaved] = useState(false)

    const handleCopy = useCallback(() => {
        onCopyAll()
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [onCopyAll])

    const handleSave = useCallback(() => {
        onSave()
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
    }, [onSave])

    return (
        <div className="h-14 bg-white border-b border-slate-100 flex items-center justify-between px-4 gap-4 flex-shrink-0">
            {/* Left: sidebar toggle + title */}
            <div className="flex items-center gap-3 min-w-0">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={onToggleSidebar}
                            className="p-2 rounded-lg hover:bg-slate-100 text-muted-foreground transition-colors"
                        >
                            {sidebarOpen ? (
                                <PanelLeftClose className="w-4 h-4" />
                            ) : (
                                <PanelLeft className="w-4 h-4" />
                            )}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent>
                        {sidebarOpen ? "Hide library" : "Show library"}
                    </TooltipContent>
                </Tooltip>

                {/* Orange accent */}
                <div className="h-6 w-1 bg-international-orange rounded-full shadow-[0_0_8px_rgba(255,69,0,0.4)]" />

                <div className="flex items-center gap-2 min-w-0">
                    <Input
                        value={workflowName}
                        onChange={(e) => onNameChange(e.target.value)}
                        className="h-8 text-sm font-semibold border-transparent hover:border-slate-200 focus:border-slate-300 bg-transparent px-2 max-w-[240px]"
                    />
                    {nodeCount > 0 && (
                        <span className="text-[10px] text-muted-foreground bg-slate-100 px-2 py-0.5 rounded-full flex-shrink-0">
                            {nodeCount} {nodeCount === 1 ? "step" : "steps"}
                        </span>
                    )}
                </div>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-2">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onNew}
                            className="gap-1.5 text-xs"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            New
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>New blank workflow</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onOpenTemplates}
                            className="gap-1.5 text-xs"
                        >
                            <LayoutTemplate className="w-3.5 h-3.5" />
                            Templates
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Load a pre-built workflow</TooltipContent>
                </Tooltip>

                <div className="h-5 w-px bg-slate-200" />

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCopy}
                            className="gap-1.5 text-xs"
                            disabled={nodeCount === 0}
                        >
                            {copied ? (
                                <>
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    <span className="text-emerald-600">Copied</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="w-3.5 h-3.5" />
                                    Copy All
                                </>
                            )}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        Copy all prompts as a chained text
                    </TooltipContent>
                </Tooltip>

                <Button
                    size="sm"
                    onClick={handleSave}
                    className="gap-1.5 text-xs"
                    style={
                        saved
                            ? { backgroundColor: "#059669" }
                            : { backgroundColor: "#ff4500" }
                    }
                >
                    {saved ? (
                        <>
                            <Check className="w-3.5 h-3.5" /> Saved
                        </>
                    ) : (
                        <>
                            <Save className="w-3.5 h-3.5" /> Save
                        </>
                    )}
                </Button>
            </div>
        </div>
    )
}
