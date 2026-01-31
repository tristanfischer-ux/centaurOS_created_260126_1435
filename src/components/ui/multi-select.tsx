"use client"

import * as React from "react"
import { X, Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface MultiSelectOption {
    value: string
    label: string
    icon?: React.ReactNode
}

interface MultiSelectProps {
    options: MultiSelectOption[]
    selected: string[]
    onChange: (selected: string[]) => void
    placeholder?: string
    emptyMessage?: string
    className?: string
}

export function MultiSelect({
    options,
    selected,
    onChange,
    placeholder = "Select items...",
    emptyMessage = "No items found.",
    className,
}: MultiSelectProps) {
    const [open, setOpen] = React.useState(false)

    const handleSelect = (value: string) => {
        if (selected.includes(value)) {
            onChange(selected.filter((v) => v !== value))
        } else {
            onChange([...selected, value])
        }
    }

    const handleRemove = (value: string, e: React.MouseEvent) => {
        e.stopPropagation()
        onChange(selected.filter((v) => v !== value))
    }

    const handleClearAll = (e: React.MouseEvent) => {
        e.stopPropagation()
        onChange([])
    }

    const selectedOptions = options.filter((opt) => selected.includes(opt.value))

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="secondary"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "min-w-[200px] justify-between bg-muted border text-foreground hover:bg-muted",
                        className
                    )}
                >
                    <div className="flex flex-wrap gap-1 items-center flex-1 min-w-0">
                        {selectedOptions.length === 0 ? (
                            <span className="text-muted-foreground">{placeholder}</span>
                        ) : selectedOptions.length <= 2 ? (
                            selectedOptions.map((opt) => (
                                <Badge
                                    key={opt.value}
                                    variant="secondary"
                                    className="bg-status-warning-light text-status-warning-dark border-status-warning hover:bg-status-warning-light/80 px-2 py-0.5 text-xs flex items-center gap-1"
                                >
                                    {opt.icon}
                                    <span className="truncate max-w-[80px]">{opt.label}</span>
                                    <X
                                        className="h-3 w-3 cursor-pointer hover:text-amber-900"
                                        onClick={(e) => handleRemove(opt.value, e)}
                                    />
                                </Badge>
                            ))
                        ) : (
                            <Badge
                                variant="secondary"
                                className="bg-status-warning-light text-status-warning-dark border-status-warning px-2 py-0.5 text-xs"
                            >
                                {selectedOptions.length} selected
                                <X
                                    className="h-3 w-3 ml-1 cursor-pointer hover:text-amber-900"
                                    onClick={handleClearAll}
                                />
                            </Badge>
                        )}
                    </div>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[250px] p-0 bg-background border z-50" align="start">
                <div className="max-h-[300px] overflow-y-auto">
                    {options.length === 0 ? (
                        <div className="py-4 text-center text-sm text-muted-foreground">
                            {emptyMessage}
                        </div>
                    ) : (
                        options.map((option) => {
                            const isSelected = selected.includes(option.value)
                            return (
                                <div
                                    key={option.value}
                                    className={cn(
                                        "flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted transition-colors",
                                        isSelected && "bg-muted"
                                    )}
                                    onClick={() => handleSelect(option.value)}
                                    role="option"
                                    aria-selected={isSelected}
                                    aria-label={`Select ${option.label}`}
                                >
                                    <div
                                        className={cn(
                                            "h-4 w-4 rounded border flex items-center justify-center",
                                            isSelected
                                                ? "bg-foreground border-foreground"
                                                : "border"
                                        )}
                                    >
                                        {isSelected && <Check className="h-3 w-3 text-white" />}
                                    </div>
                                    {option.icon && <span>{option.icon}</span>}
                                    <span className="text-sm text-foreground flex-1 truncate">
                                        {option.label}
                                    </span>
                                </div>
                            )
                        })
                    )}
                </div>
                {selected.length > 0 && (
                    <div className="border-t border-muted p-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-muted-foreground hover:text-foreground"
                            onClick={handleClearAll}
                        >
                            Clear all
                        </Button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    )
}
