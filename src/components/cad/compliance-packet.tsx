"use client"

/**
 * @file compliance-packet.tsx — Per-region regulatory checklist with supplier attestation.
 *
 * @description Founder selects target markets, system surfaces the canonical
 * regulations that apply, and founder marks each one applicable / attested /
 * certified. Attestations track which supplier has committed.
 *
 * State is persisted via the parent page (JSONB column on cad_lab_projects or
 * localStorage fallback).
 *
 * @related
 * - Lib: src/lib/cad-lab/compliance-regulations.ts
 * - Assemble page: src/app/(platform)/the-forge/cad-lab/assemble/page.tsx
 */

import React, { useCallback, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ShieldCheck, ExternalLink, Plus, X, Globe2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  CANONICAL_REGULATIONS,
  starterPacketForMarkets,
} from "@/lib/cad-lab/compliance-regulations"
import type {
  CompliancePacketState,
  PacketRegulationEntry,
  RegulationStatus,
} from "@/lib/cad-lab/compliance-regulations"

interface CompliancePacketProps {
  state: CompliancePacketState
  onChange: (next: CompliancePacketState) => void
  /** Optional supplier name lookup for attestation display */
  supplierNameById?: Map<string, string>
}

const MARKETS: Array<"UK" | "EU" | "US" | "Global"> = ["UK", "EU", "US", "Global"]

const STATUS_LABEL: Record<RegulationStatus, string> = {
  not_started: "Not started",
  required: "Required",
  attested: "Attested",
  certified: "Certified",
  not_applicable: "N/A",
}

const STATUS_VARIANT: Record<RegulationStatus, "secondary" | "warning" | "success" | "info"> = {
  not_started: "secondary",
  required: "warning",
  attested: "info",
  certified: "success",
  not_applicable: "secondary",
}

export function CompliancePacket({ state, onChange, supplierNameById }: CompliancePacketProps) {
  const [customRegLabel, setCustomRegLabel] = useState("")

  // INTENT: Memoise to keep a stable reference for hooks that list it in deps.
  const regs = useMemo<PacketRegulationEntry[]>(
    () => state.regulations ?? [],
    [state.regulations],
  )

  const toggleMarket = useCallback((market: "UK" | "EU" | "US" | "Global") => {
    const current = new Set(state.targetMarkets ?? [])
    if (current.has(market)) current.delete(market)
    else current.add(market)
    const markets = [...current]
    // INTENT: Keep existing regulation entries but add any canonical regs for newly-selected markets
    const existingIds = new Set(regs.map((r) => r.id))
    const additions: PacketRegulationEntry[] = CANONICAL_REGULATIONS
      .filter((r) => markets.includes(r.jurisdiction) && !existingIds.has(r.id))
      .map((r) => ({
        id: r.id,
        label: r.label,
        applicable: false,
        status: "not_started",
        attestingSuppliers: [],
      }))
    onChange({
      ...state,
      targetMarkets: markets,
      regulations: [...regs, ...additions],
      updatedAt: new Date().toISOString(),
    })
  }, [state, regs, onChange])

  const updateReg = useCallback((id: string, patch: Partial<PacketRegulationEntry>) => {
    const next = regs.map((r) => r.id === id ? { ...r, ...patch } : r)
    onChange({ ...state, regulations: next, updatedAt: new Date().toISOString() })
  }, [regs, state, onChange])

  const removeReg = useCallback((id: string) => {
    onChange({ ...state, regulations: regs.filter((r) => r.id !== id), updatedAt: new Date().toISOString() })
  }, [regs, state, onChange])

  const addCustomReg = useCallback(() => {
    const label = customRegLabel.trim()
    if (!label) return
    const slug = `custom_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Date.now().toString(36)}`
    const entry: PacketRegulationEntry = {
      id: slug,
      label,
      applicable: true,
      status: "required",
      attestingSuppliers: [],
    }
    onChange({ ...state, regulations: [...regs, entry], updatedAt: new Date().toISOString() })
    setCustomRegLabel("")
  }, [customRegLabel, regs, state, onChange])

  const loadStarter = useCallback(() => {
    if ((state.targetMarkets ?? []).length === 0) return
    const starter = starterPacketForMarkets(state.targetMarkets as Array<"UK" | "EU" | "US" | "Global">)
    onChange({
      ...state,
      regulations: starter.regulations,
      updatedAt: new Date().toISOString(),
    })
  }, [state, onChange])

  const applicableCount = useMemo(() => regs.filter((r) => r.applicable).length, [regs])
  const satisfiedCount = useMemo(
    () => regs.filter((r) => r.applicable && (r.status === "attested" || r.status === "certified")).length,
    [regs],
  )

  return (
    <div className="space-y-4">
      {/* ── Market selector ── */}
      <Card className="border-border">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-international-orange" />
                Target markets
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Select where you plan to ship. We&apos;ll load the relevant regulations.
              </p>
            </div>
            {regs.length === 0 && (state.targetMarkets ?? []).length > 0 && (
              <Button variant="secondary" size="sm" onClick={loadStarter}>
                Load starter regulations
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {MARKETS.map((m) => {
              const active = (state.targetMarkets ?? []).includes(m)
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMarket(m)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                    active
                      ? "bg-international-orange text-primary-foreground border-international-orange"
                      : "bg-background text-muted-foreground border-border hover:text-foreground hover:border-international-orange/40",
                  )}
                >
                  {m}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Summary ── */}
      {regs.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50">
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{satisfiedCount}</span> of <span className="font-semibold text-foreground">{applicableCount}</span> applicable regulations satisfied.
          </div>
          <span className="text-[10px] text-muted-foreground">
            {state.updatedAt ? `Updated ${new Date(state.updatedAt).toLocaleDateString()}` : "Not yet saved"}
          </span>
        </div>
      )}

      {/* ── Regulation list ── */}
      {regs.length > 0 && (
        <div className="space-y-2">
          {regs.map((reg) => {
            const canonical = CANONICAL_REGULATIONS.find((r) => r.id === reg.id)
            return (
              <Card key={reg.id} className="border-border">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">{reg.label}</p>
                        {canonical && (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                            {canonical.jurisdiction}
                          </Badge>
                        )}
                        <Badge variant={STATUS_VARIANT[reg.status]} className="h-4 px-1.5 text-[10px]">
                          {STATUS_LABEL[reg.status]}
                        </Badge>
                      </div>
                      {canonical && (
                        <p className="text-xs text-muted-foreground mt-0.5">{canonical.description}</p>
                      )}
                      {canonical?.referenceUrl && (
                        <a
                          href={canonical.referenceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-info hover:underline mt-1"
                        >
                          Reference <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                      {reg.attestingSuppliers.length > 0 && (
                        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                          <span className="text-[10px] text-muted-foreground">Attested by:</span>
                          {reg.attestingSuppliers.map((sid) => (
                            <span key={sid} className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success">
                              <ShieldCheck className="h-2.5 w-2.5 inline mr-0.5" />
                              {supplierNameById?.get(sid) ?? sid.slice(0, 8)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Right column: controls */}
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <label className="flex items-center gap-1.5 text-[11px] text-foreground cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={reg.applicable}
                          onChange={(e) => updateReg(reg.id, { applicable: e.target.checked })}
                          className="h-3.5 w-3.5 accent-international-orange"
                        />
                        Applicable
                      </label>
                      <select
                        value={reg.status}
                        onChange={(e) => updateReg(reg.id, { status: e.target.value as RegulationStatus })}
                        className="text-[11px] border border-input rounded px-1.5 py-1 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-international-orange"
                        aria-label={`Status for ${reg.label}`}
                      >
                        <option value="not_started">Not started</option>
                        <option value="required">Required</option>
                        <option value="attested">Attested</option>
                        <option value="certified">Certified</option>
                        <option value="not_applicable">N/A</option>
                      </select>
                      {reg.id.startsWith("custom_") && (
                        <button
                          type="button"
                          onClick={() => removeReg(reg.id)}
                          className="text-[10px] text-muted-foreground hover:text-destructive transition-colors inline-flex items-center gap-0.5"
                          aria-label={`Remove ${reg.label}`}
                        >
                          <X className="h-3 w-3" /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Add custom regulation ── */}
      <Card className="border-border border-dashed">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs font-semibold text-foreground mb-2">Add a custom regulation</p>
          <p className="text-[11px] text-muted-foreground mb-2">
            For regulated industries: FDA 510(k), ISO 13485, ITAR, EN 60601-1, etc.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customRegLabel}
              onChange={(e) => setCustomRegLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomReg() } }}
              placeholder="e.g., FDA 510(k)"
              className="flex-1 text-xs border border-input rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-international-orange"
            />
            <Button size="sm" onClick={addCustomReg} disabled={!customRegLabel.trim()}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
