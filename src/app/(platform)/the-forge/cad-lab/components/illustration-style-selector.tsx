"use client"

/**
 * @file illustration-style-selector.tsx — Three-card selector for the
 * project-level illustration style (Blueprint / Photorealistic / Isometric
 * Vector).
 *
 * @description Shown on the Design stage before first hero/module generation,
 * and editable afterwards. Selection is a silent preference update — no
 * auto-regeneration. When the user changes style after an initial generation
 * the `IllustrationStyleAppliedChip` below the selector surfaces the
 * "(Regenerate to apply)" hint so users understand the preference won't
 * take effect until they explicitly regenerate.
 *
 * @related
 * - Context wiring: src/app/(platform)/the-forge/cad-lab/cad-lab-context.tsx
 * - Registry + prompts: src/lib/cad-lab/illustration-styles.ts
 */

import { Camera, Grid2x2, Layers, Loader2, Newspaper } from "lucide-react"
import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import {
  ILLUSTRATION_STYLES,
  type IllustrationStyle,
  type IllustrationStyleMeta,
} from "@/lib/cad-lab/illustration-styles"
import { useCadLab } from "../cad-lab-context"

// ─── Icons ─────────────────────────────────────────────────────────────

const ICONS: Record<IllustrationStyle, (props: { className?: string }) => React.ReactNode> = {
  blueprint: ({ className }) => <Layers className={className} />,
  photoreal: ({ className }) => <Camera className={className} />,
  isometric_vector: ({ className }) => <Grid2x2 className={className} />,
  photography: ({ className }) => <Newspaper className={className} />,
}

// ─── Selector ──────────────────────────────────────────────────────────

export function IllustrationStyleSelector(): React.ReactNode {
  const { illustrationStyle, handleSetIllustrationStyle } = useCadLab()
  const [pending, setPending] = useState<IllustrationStyle | null>(null)

  const handleSelect = async (next: IllustrationStyle) => {
    if (next === illustrationStyle || pending) return
    setPending(next)
    try {
      await handleSetIllustrationStyle(next)
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-foreground">Illustration style</p>
        <p className="text-xs text-muted-foreground">
          Applied on next regeneration · no extra cost to change
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {ILLUSTRATION_STYLES.map((style) => (
          <StyleCard
            key={style.id}
            style={style}
            selected={style.id === illustrationStyle}
            busy={pending === style.id}
            onSelect={() => handleSelect(style.id)}
          />
        ))}
      </div>
    </div>
  )
}

// ─── StyleCard ─────────────────────────────────────────────────────────

interface StyleCardProps {
  style: IllustrationStyleMeta
  selected: boolean
  busy: boolean
  onSelect: () => void
}

function StyleCard({ style, selected, busy, onSelect }: StyleCardProps): React.ReactNode {
  const Icon = ICONS[style.id]
  return (
    <Card
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect()
        }
      }}
      className={`cursor-pointer transition-all hover:-translate-y-0.5 active:scale-[0.99] duration-200 ${
        selected
          ? "ring-2 ring-international-orange border-international-orange/30"
          : "hover:border-international-orange/30"
      }`}
    >
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div
            className={`h-8 w-8 rounded-md flex items-center justify-center ${
              selected ? "bg-international-orange/10" : "bg-muted"
            }`}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin text-international-orange" />
            ) : (
              <Icon className={`h-4 w-4 ${selected ? "text-international-orange" : "text-muted-foreground"}`} />
            )}
          </div>
          {selected && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-international-orange">
              Selected
            </span>
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{style.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{style.description}</p>
        </div>
        <p className="text-[11px] text-muted-foreground/80 italic leading-snug">{style.bestFor}</p>
      </CardContent>
    </Card>
  )
}
