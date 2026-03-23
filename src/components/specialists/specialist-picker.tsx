"use client"

/**
 * @file specialist-picker.tsx
 *
 * @description A compact popover grid showing all specialists,
 * letting the user choose which specialist to consult. Each item
 * shows the specialist's avatar, name, and title. Clicking one
 * fires onSelect with the specialist ID.
 */

import Image from "next/image"
import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Compass, Package, Crown, Megaphone, Handshake,
  TrendingUp, Calculator, UserPlus, Scale, Cpu, Code2, Factory, Route,
} from "lucide-react"
import { SPECIALISTS } from "@/app/(platform)/agents/specialists-data"
import type { Specialist } from "@/app/(platform)/agents/specialists-data"

/** Map icon string names to Lucide components */
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Compass,
  Package,
  Crown,
  Megaphone,
  Handshake,
  TrendingUp,
  Calculator,
  UserPlus,
  Users: UserPlus,
  Scale,
  Cpu,
  Code2,
  Factory,
  Route,
}

interface SpecialistPickerProps {
  /** Called when a specialist is selected */
  onSelect: (specialistId: string) => void
  /** Optional: highlight a recommended specialist */
  recommendedId?: string
  /** The trigger element that opens the popover */
  children: React.ReactNode
  /** Optional alignment of the popover */
  align?: "start" | "center" | "end"
}

/**
 * SpecialistPicker -- Popover grid of all specialists.
 *
 * @description Opens a compact 3x3 grid showing each specialist with
 * their avatar, name, and title. The recommended specialist (if provided)
 * gets a subtle highlight. Clicking fires onSelect.
 */
export function SpecialistPicker({
  onSelect,
  recommendedId,
  children,
  align = "end",
}: SpecialistPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent
        className="w-[340px] p-3"
        align={align}
        sideOffset={8}
      >
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground px-1">
            Choose a specialist
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            {SPECIALISTS.map((specialist) => (
              <SpecialistPickerItem
                key={specialist.id}
                specialist={specialist}
                isRecommended={specialist.id === recommendedId}
                onClick={() => onSelect(specialist.id)}
              />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── Picker Item ─────────────────────────────────────────────────────────────

function SpecialistPickerItem({
  specialist,
  isRecommended,
  onClick,
}: {
  specialist: Specialist
  isRecommended: boolean
  onClick: () => void
}) {
  const Icon = ICON_MAP[specialist.icon] ?? Compass

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-lg p-2.5 transition-colors text-center",
        "hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isRecommended && "ring-1 ring-international-orange/30 bg-international-orange/5",
      )}
    >
      {/* Avatar */}
      <div className="relative h-9 w-9 rounded-full overflow-hidden bg-muted flex-shrink-0">
        {specialist.avatarImage ? (
          <Image
            src={specialist.avatarImage}
            alt={specialist.name}
            fill
            unoptimized
            className="object-cover"
            sizes="36px"
          />
        ) : (
          <div className="flex items-center justify-center h-full w-full">
            <Icon className="h-4 w-4 text-foreground" />
          </div>
        )}
      </div>

      {/* Name + Title */}
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground leading-tight truncate">
          {specialist.name}
        </p>
        <p className="text-[10px] text-muted-foreground leading-tight truncate">
          {specialist.title}
        </p>
      </div>
    </button>
  )
}
