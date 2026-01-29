"use client"

import * as React from "react"
import { format, addDays } from "date-fns"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerWithShortcutsProps {
    date?: Date
    onDateChange: (date: Date | undefined) => void
    placeholder?: string
    className?: string
}

export function DatePickerWithShortcuts({
    date,
    onDateChange,
    placeholder = "Pick a date",
    className
}: DatePickerWithShortcutsProps) {
    const [open, setOpen] = React.useState(false)

    const handleQuickDate = (newDate: Date) => {
        onDateChange(newDate)
        setOpen(false)
    }

    const handleClear = () => {
        onDateChange(undefined)
        setOpen(false)
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant={"secondary"}
                    className={cn(
                        "w-full justify-start text-left font-normal",
                        !date && "text-muted-foreground",
                        className
                    )}
                >
                    <CalendarIcon className="h-4 w-4" />
                    {date ? format(date, "PPP") : <span>{placeholder}</span>}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-[100]">
                {/* Quick Date Shortcuts */}
                <div className="flex gap-1 p-2 border-b border-border">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleQuickDate(new Date())}
                        className="text-xs h-7"
                    >
                        Today
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleQuickDate(addDays(new Date(), 1))}
                        className="text-xs h-7"
                    >
                        Tomorrow
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleQuickDate(addDays(new Date(), 7))}
                        className="text-xs h-7"
                    >
                        +7d
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleQuickDate(addDays(new Date(), 14))}
                        className="text-xs h-7"
                    >
                        +14d
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleClear}
                        className="text-xs h-7"
                    >
                        Clear
                    </Button>
                </div>
                {/* Calendar */}
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(selectedDate) => {
                        onDateChange(selectedDate)
                        setOpen(false)
                    }}
                    initialFocus
                    className="bg-white"
                />
            </PopoverContent>
        </Popover>
    )
}
