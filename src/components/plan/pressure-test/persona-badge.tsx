"use client"

/**
 * @file persona-badge.tsx — Pressure-test persona tag
 *
 * @description Renders the stress-test role tag (Bull / Bear / Realist /
 * Disruptor / Wildcard) used in the pressure-test transcript. Colour mapping
 * is fixed per PLAN-SCHEMA §10 and the pressure-test mockup:
 *   Bull      → red-pill  (semantic: destructive / warn-strong)
 *   Bear      → blue-pill (semantic: info / electric-blue)
 *   Realist   → amber     (semantic: warning)
 *   Disruptor → purple    (semantic: accent)
 *   Wildcard  → grey      (semantic: muted)
 *
 * Only design-token classes — no hardcoded hex.
 *
 * Copy rule: these are "stress-test roles", NOT "AI personas".
 */

import { cn } from "@/lib/utils"

export type PressurePersonaRole =
  | "bull"
  | "bear"
  | "realist"
  | "disruptor"
  | "wildcard"

interface PersonaConfig {
  /** UI label — always short, always sentence-free. */
  label: string
  /** One-line role description — shown in tooltips and the avatar row. */
  role: string
  /** Pill classes — background + text + border, tokens only. */
  pill: string
  /** Solo dot — used in compact avatar rows. */
  dot: string
}

const PERSONA_CONFIG: Record<PressurePersonaRole, PersonaConfig> = {
  bull: {
    label: "Bull",
    role: "Argues for the bet",
    pill: "bg-destructive/10 text-destructive border-destructive/20",
    dot: "bg-destructive",
  },
  bear: {
    label: "Bear",
    role: "Argues against the bet",
    pill: "bg-info/10 text-info border-info/20",
    dot: "bg-info",
  },
  realist: {
    label: "Realist",
    role: "Stress-tests the numbers",
    pill: "bg-warning/10 text-warning border-warning/20",
    dot: "bg-warning",
  },
  disruptor: {
    label: "Disruptor",
    role: "Reframes the question",
    pill: "bg-accent text-accent-foreground border-accent",
    dot: "bg-accent-foreground",
  },
  wildcard: {
    label: "Wildcard",
    role: "Outside-view challenge",
    pill: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground",
  },
}

/** Look up a persona config for consumers that want label / role outside the badge. */
export function getPressurePersona(role: string): PersonaConfig | null {
  const key = role.toLowerCase() as PressurePersonaRole
  return PERSONA_CONFIG[key] ?? null
}

interface PersonaBadgeProps {
  role: PressurePersonaRole | string
  /** Optional character name (e.g. "Sage") rendered after the label. */
  characterName?: string
  /** Compact dot-only form for the avatar row. */
  variant?: "pill" | "dot"
  className?: string
}

export function PersonaBadge({
  role,
  characterName,
  variant = "pill",
  className,
}: PersonaBadgeProps) {
  const cfg = getPressurePersona(role)
  if (!cfg) {
    // Graceful fallback — unknown role still renders something readable
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground",
          className,
        )}
      >
        {role}
      </span>
    )
  }

  if (variant === "dot") {
    return (
      <span
        className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}
        title={`${cfg.label} — ${cfg.role}`}
      >
        <span
          aria-hidden
          className={cn("inline-block h-2 w-2 rounded-full", cfg.dot)}
        />
        <span className="font-medium text-foreground">{cfg.label}</span>
      </span>
    )
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        cfg.pill,
        className,
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      <span>{cfg.label}</span>
      {characterName ? (
        <span className="text-muted-foreground">· {characterName}</span>
      ) : null}
    </span>
  )
}

/** All supported roles — useful for rendering the avatar row in the modal header. */
export const PRESSURE_PERSONA_ORDER: PressurePersonaRole[] = [
  "bull",
  "bear",
  "realist",
  "disruptor",
  "wildcard",
]
