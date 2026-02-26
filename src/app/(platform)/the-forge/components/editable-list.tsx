"use client"

/**
 * @file editable-list.tsx — Reusable inline list editor for string arrays.
 *
 * @description Renders items as editable rows with remove buttons and an
 * "Add" button at the bottom. Used by EditModuleDialog and ModuleDetailDialog
 * for editing inputs, outputs, key parts, failure modes, etc.
 */

import { Plus, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

// ─── Props ───────────────────────────────────────────────────────────

interface EditableListProps {
  items: string[]
  onChange: (items: string[]) => void
  placeholder: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * EditableList — inline list editor for string arrays.
 *
 * @description Renders items as editable rows with remove buttons,
 * plus an "Add" button at the bottom.
 */
export function EditableList({
  items,
  onChange,
  placeholder,
  label,
  icon: Icon,
}: EditableListProps): React.ReactNode {
  const handleItemChange = (index: number, value: string): void => {
    const next = [...items]
    next[index] = value
    onChange(next)
  }

  const handleRemove = (index: number): void => {
    onChange(items.filter((_, i) => i !== index))
  }

  const handleAdd = (): void => {
    onChange([...items, ""])
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {label} ({items.length})
      </Label>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={item}
              onChange={(e) => handleItemChange(i, e.target.value)}
              placeholder={placeholder}
              className="flex-1 text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => handleRemove(i)}
              aria-label={`Remove item ${i + 1}`}
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-xs text-muted-foreground"
        onClick={handleAdd}
      >
        <Plus className="h-3 w-3 mr-1" />
        Add {label.toLowerCase().replace(/\s*\(\d+\)/, "")}
      </Button>
    </div>
  )
}
