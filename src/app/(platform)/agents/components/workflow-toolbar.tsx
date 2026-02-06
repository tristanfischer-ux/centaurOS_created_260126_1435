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
    Play,
    Square,
    Loader2,
    AlignVerticalSpaceAround,
    Trash2,
    HelpCircle,
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
    onRunChain: () => void
    onStopChain: () => void
    isChainRunning: boolean
    chainProgress?: { current: number; total: number }
    onAutoArrange?: () => void
    onClearCanvas?: () => void
    onOpenHelp?: () => void
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
    onRunChain,
    onStopChain,
    isChainRunning,
    chainProgress,
    onAutoArrange,
    onClearCanvas,
    onOpenHelp,
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

                {nodeCount > 0 && (
                    <>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onAutoArrange}
                                    className="gap-1.5 text-xs"
                                    disabled={nodeCount === 0}
                                >
                                    <AlignVerticalSpaceAround className="w-3.5 h-3.5" />
                                    Tidy Up
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Auto-arrange nodes into a clean layout</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onClearCanvas}
                                    className="gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Clear
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Remove all nodes from canvas</TooltipContent>
                        </Tooltip>
                    </>
                )}

                <div className="h-5 w-px bg-slate-200" />

                {/* Run Chain button */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        {isChainRunning ? (
                            <Button
                                size="sm"
                                onClick={onStopChain}
                                className="gap-1.5 text-xs"
                                variant="outline"
                            >
                                <Square className="w-3 h-3" />
                                Stop
                                {chainProgress && (
                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full ml-1">
                                        {chainProgress.current}/{chainProgress.total}
                                    </span>
                                )}
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                onClick={onRunChain}
                                disabled={nodeCount === 0}
                                className="gap-1.5 text-xs text-white"
                                style={{ backgroundColor: nodeCount > 0 ? "#3b82f6" : undefined }}
                            >
                                <Play className="w-3.5 h-3.5" />
                                Run Chain
                            </Button>
                        )}
                    </TooltipTrigger>
                    <TooltipContent>
                        {isChainRunning
                            ? "Stop chain execution"
                            : "Run all prompts in order (with human review at each step)"}
                    </TooltipContent>
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

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={onOpenHelp}
                            className="p-2 rounded-lg hover:bg-slate-100 text-muted-foreground transition-colors"
                            aria-label="Help and keyboard shortcuts"
                        >
                            <HelpCircle className="w-4 h-4" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent>Help & keyboard shortcuts</TooltipContent>
                </Tooltip>
            </div>
        </div>
    )
}
