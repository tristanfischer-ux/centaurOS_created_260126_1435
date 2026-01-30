"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDown, X } from "lucide-react"
import { Button } from "./button"

interface ExpandableCardProps {
    children: React.ReactNode
    expandedContent: React.ReactNode
    isExpanded?: boolean
    onExpandedChange?: (expanded: boolean) => void
    className?: string
    expandedClassName?: string
    showCloseButton?: boolean
    triggerClassName?: string
}

export function ExpandableCard({
    children,
    expandedContent,
    isExpanded: controlledExpanded,
    onExpandedChange,
    className,
    expandedClassName,
    showCloseButton = true,
    triggerClassName,
}: ExpandableCardProps) {
    const [internalExpanded, setInternalExpanded] = React.useState(false)
    
    const isControlled = controlledExpanded !== undefined
    const isExpanded = isControlled ? controlledExpanded : internalExpanded
    
    const handleToggle = () => {
        const newValue = !isExpanded
        if (!isControlled) {
            setInternalExpanded(newValue)
        }
        onExpandedChange?.(newValue)
    }

    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!isControlled) {
            setInternalExpanded(false)
        }
        onExpandedChange?.(false)
    }

    // Scroll into view when expanded
    const contentRef = React.useRef<HTMLDivElement>(null)
    React.useEffect(() => {
        if (isExpanded && contentRef.current) {
            setTimeout(() => {
                contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
            }, 100)
        }
    }, [isExpanded])

    return (
        <div
            className={cn(
                "rounded-lg shadow-sm transition-all duration-200",
                isExpanded && "shadow-md ring-1 ring-slate-200",
                className
            )}
        >
            {/* Summary - always visible */}
            <div 
                className={cn(
                    "cursor-pointer",
                    triggerClassName
                )}
                onClick={handleToggle}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleToggle()
                    }
                }}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
            >
                {children}
            </div>

            {/* Expanded content with animation */}
            <div
                ref={contentRef}
                className={cn(
                    "grid transition-all duration-300 ease-in-out",
                    isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                )}
            >
                <div className="overflow-hidden">
                    <div className={cn(
                        "border-t border-slate-100 bg-muted/50",
                        expandedClassName
                    )}>
                        {/* Close button */}
                        {showCloseButton && isExpanded && (
                            <div className="flex justify-end p-2 pb-0">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleClose}
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-4 w-4" />
                                    <span className="sr-only">Close</span>
                                </Button>
                            </div>
                        )}
                        {expandedContent}
                    </div>
                </div>
            </div>
        </div>
    )
}

// Simpler inline expand trigger button
interface ExpandTriggerProps {
    isExpanded: boolean
    onClick: () => void
    label?: string
    className?: string
}

export function ExpandTrigger({ isExpanded, onClick, label = "View details", className }: ExpandTriggerProps) {
    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
                e.stopPropagation()
                onClick()
            }}
            className={cn("text-xs gap-1", className)}
        >
            {isExpanded ? "Hide" : label}
            <ChevronDown className={cn(
                "h-3 w-3 transition-transform duration-200",
                isExpanded && "rotate-180"
            )} />
        </Button>
    )
}

// Context for managing single-expanded-at-a-time behavior
interface ExpandableContextValue {
    expandedId: string | null
    setExpandedId: (id: string | null) => void
}

const ExpandableContext = React.createContext<ExpandableContextValue | null>(null)

export function ExpandableProvider({ children }: { children: React.ReactNode }) {
    const [expandedId, setExpandedId] = React.useState<string | null>(null)
    
    return (
        <ExpandableContext.Provider value={{ expandedId, setExpandedId }}>
            {children}
        </ExpandableContext.Provider>
    )
}

export function useExpandable(id: string) {
    const context = React.useContext(ExpandableContext)
    
    if (!context) {
        // Not within provider, use local state
        const [isExpanded, setIsExpanded] = React.useState(false)
        return {
            isExpanded,
            toggle: () => setIsExpanded(prev => !prev),
            expand: () => setIsExpanded(true),
            collapse: () => setIsExpanded(false),
        }
    }
    
    const { expandedId, setExpandedId } = context
    const isExpanded = expandedId === id
    
    return {
        isExpanded,
        toggle: () => setExpandedId(isExpanded ? null : id),
        expand: () => setExpandedId(id),
        collapse: () => setExpandedId(null),
    }
}
