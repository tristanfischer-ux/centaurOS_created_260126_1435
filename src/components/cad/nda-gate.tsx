"use client"

/**
 * @file nda-gate.tsx — NDA acknowledgement gate before sharing design pack.
 *
 * @description Founders protect IP by requiring a signed NDA before sharing
 * design packs with suppliers. This component is a soft gate — it's a
 * discipline prompt, not a legal enforcement. It captures the NDA reference
 * (doc ID) and a checkbox acknowledgement so the founder has a paper trail
 * they can point to later.
 *
 * @related
 * - Consumer: Source page, Shortlist tab
 */

import React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Lock, ExternalLink, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface NDAState {
  acknowledged: boolean
  ndaReference: string
  acknowledgedAt?: string
}

interface NDAGateProps {
  state: NDAState
  onChange: (next: NDAState) => void
  /** Optional link to the founder's preferred NDA template */
  templateUrl?: string
}

const DEFAULT_TEMPLATE_URL = "https://www.docracy.com/8/mutual-non-disclosure-agreement-short-form"

export function NDAGate({ state, onChange, templateUrl }: NDAGateProps) {
  const effectiveTemplateUrl = templateUrl ?? DEFAULT_TEMPLATE_URL

  const handleAck = (checked: boolean) => {
    onChange({
      ...state,
      acknowledged: checked,
      acknowledgedAt: checked ? new Date().toISOString() : undefined,
    })
  }

  return (
    <Card className={cn("border", state.acknowledged ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5")}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          {state.acknowledged ? (
            <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
          ) : (
            <Lock className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {state.acknowledged ? "NDA acknowledged" : "NDA before design share"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {state.acknowledged
                ? "You've confirmed an NDA is in place. Design packs can be shared with ranked suppliers."
                : "Before sending drawings, specs, or any confidential material to a supplier, make sure you have a signed NDA in place. Track the reference ID here so you can prove it later."}
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2.5">
              <Input
                type="text"
                placeholder="NDA reference / doc ID (e.g., NDA-2026-001)"
                value={state.ndaReference}
                onChange={(e) => onChange({ ...state, ndaReference: e.target.value })}
                className="h-8 text-xs flex-1"
              />
              <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer select-none flex-shrink-0">
                <input
                  type="checkbox"
                  checked={state.acknowledged}
                  onChange={(e) => handleAck(e.target.checked)}
                  className="h-3.5 w-3.5 accent-international-orange"
                />
                NDA signed &amp; stored
              </label>
            </div>
            <a
              href={effectiveTemplateUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-info hover:underline mt-2"
            >
              Need a mutual NDA template? <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
