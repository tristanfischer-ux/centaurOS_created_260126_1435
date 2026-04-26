/**
 * @file set-launch-date-button.tsx
 *
 * @description Small inline button that opens a date picker to set or clear
 * the project's target launch date. Used in the shortlist header.
 * Calls setProjectLaunchDate server action on confirm.
 */

"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CalendarDays, Loader2 } from "lucide-react"
import { setProjectLaunchDate } from "@/actions/project-supplier-shortlists"

interface Props {
  projectId: string
  currentDate: string | null
}

export function SetLaunchDateButton({ projectId, currentDate }: Props) {
  const [open, setOpen] = useState(false)
  const [dateValue, setDateValue] = useState(currentDate ?? "")
  const [saved, setSaved] = useState(currentDate)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const result = await setProjectLaunchDate({
        projectId,
        targetLaunchDate: dateValue || null,
      })
      if (result.success) {
        setSaved(dateValue || null)
        setOpen(false)
      }
    })
  }

  const label = saved
    ? `Launch: ${new Date(saved).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
    : "Set launch date"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1.5"
          aria-label="Set project target launch date"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-4 space-y-3" align="end">
        <div className="space-y-1">
          <Label htmlFor="launch-date-input" className="text-xs font-medium">
            Target launch date
          </Label>
          <Input
            id="launch-date-input"
            type="date"
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
            className="h-9 text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            Used to compute lead-time buffer weeks for each shortlisted supplier.
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          {saved && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => {
                setDateValue("")
                startTransition(async () => {
                  await setProjectLaunchDate({ projectId, targetLaunchDate: null })
                  setSaved(null)
                  setOpen(false)
                })
              }}
              disabled={isPending}
            >
              Clear
            </Button>
          )}
          <Button
            size="sm"
            className="h-7 text-xs ml-auto"
            onClick={handleSave}
            disabled={isPending || !dateValue}
          >
            {isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
