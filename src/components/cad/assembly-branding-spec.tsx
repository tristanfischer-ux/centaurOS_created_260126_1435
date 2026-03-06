/**
 * @file assembly-branding-spec.tsx — Branding & Packaging form with live box preview.
 *
 * @description Scrolling card layout for product branding configuration:
 *   Card 1 — Logo & Brand Identity (color palette)
 *   Card 2 — Packaging Type (radio group with SVG icons)
 *   Card 3 — Inserts & Documentation (checkboxes + notes)
 *   Card 4 — Regulatory Labels (CE, UKCA, FCC, etc.)
 *   Card 5 — Live Box Preview (reactive SVG mockup)
 *
 * All state stored in parent via BrandingSpec; persisted to localStorage.
 */

"use client"

import { useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  PACKAGING_OPTIONS,
} from "@/lib/assembly-utils"
import type { BrandingSpec } from "@/lib/assembly-utils"

// ─── Regulatory label options ───────────────────────────────────────

const REGULATORY_OPTIONS = [
  { id: "ce", label: "CE Marking" },
  { id: "ukca", label: "UKCA" },
  { id: "fcc", label: "FCC" },
  { id: "ul", label: "UL" },
  { id: "rohs", label: "RoHS" },
  { id: "weee", label: "WEEE" },
] as const

// ─── Props ──────────────────────────────────────────────────────────

interface AssemblyBrandingSpecProps {
  branding: BrandingSpec
  onUpdate: (updates: Partial<BrandingSpec>) => void
}

// ─── Component ──────────────────────────────────────────────────────

export function AssemblyBrandingSpec({
  branding,
  onUpdate,
}: AssemblyBrandingSpecProps) {
  const handleColorChange = useCallback((index: number, value: string) => {
    const next = [...branding.colorPalette]
    next[index] = value
    onUpdate({ colorPalette: next })
  }, [branding.colorPalette, onUpdate])

  const addColor = useCallback(() => {
    if (branding.colorPalette.length < 5) {
      onUpdate({ colorPalette: [...branding.colorPalette, "#ff4500"] })
    }
  }, [branding.colorPalette, onUpdate])

  const removeColor = useCallback((index: number) => {
    const next = branding.colorPalette.filter((_, i) => i !== index)
    onUpdate({ colorPalette: next })
  }, [branding.colorPalette, onUpdate])

  const toggleRegLabel = useCallback((label: string) => {
    const has = branding.regulatoryLabels.includes(label)
    onUpdate({
      regulatoryLabels: has
        ? branding.regulatoryLabels.filter((l) => l !== label)
        : [...branding.regulatoryLabels, label],
    })
  }, [branding.regulatoryLabels, onUpdate])

  const toggleInsert = useCallback((insert: string) => {
    const has = branding.customInserts.includes(insert)
    onUpdate({
      customInserts: has
        ? branding.customInserts.filter((i) => i !== insert)
        : [...branding.customInserts, insert],
    })
  }, [branding.customInserts, onUpdate])

  const primaryColor = branding.colorPalette[0] ?? "#ff4500"

  return (
    <div className="space-y-6">
      {/* ── Card 1: Logo & Brand Identity ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Logo & Brand Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="logo-url">Logo URL</Label>
            <Input
              id="logo-url"
              placeholder="https://example.com/logo.png or upload later"
              value={branding.logoUrl ?? ""}
              onChange={(e) => onUpdate({ logoUrl: e.target.value || null })}
            />
            <p className="text-xs text-muted-foreground">
              PNG or SVG recommended. Will appear on packaging.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Color Palette</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {branding.colorPalette.map((color, i) => (
                <div key={i} className="flex items-center gap-1">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => handleColorChange(i, e.target.value)}
                    className="h-8 w-8 rounded border border-border cursor-pointer"
                  />
                  <Input
                    value={color}
                    onChange={(e) => handleColorChange(i, e.target.value)}
                    className="w-24 h-8 text-xs font-mono"
                  />
                  <button
                    onClick={() => removeColor(i)}
                    className="text-muted-foreground hover:text-destructive text-xs px-1"
                    aria-label="Remove color"
                  >
                    x
                  </button>
                </div>
              ))}
              {branding.colorPalette.length < 5 && (
                <button
                  onClick={addColor}
                  className="h-8 w-8 rounded border-2 border-dashed border-border text-muted-foreground hover:border-foreground hover:text-foreground flex items-center justify-center text-lg transition-colors"
                  aria-label="Add color"
                >
                  +
                </button>
              )}
            </div>
            {branding.colorPalette.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Click + to add brand colors (up to 5).
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Card 2: Packaging Type ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Packaging Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PACKAGING_OPTIONS.map((opt) => {
              const isSelected = branding.packagingType === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => onUpdate({ packagingType: opt.id })}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${
                    isSelected
                      ? "border-international-orange bg-international-orange/5"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {/* Simple box icon variant for each type */}
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="shrink-0">
                      {opt.id === "box" && (
                        <path d="M3 8l9-4 9 4v8l-9 4-9-4V8z" stroke={isSelected ? "#ff4500" : "#94a3b8"} strokeWidth="1.5" fill={isSelected ? "#ff450010" : "none"} />
                      )}
                      {opt.id === "mailer" && (
                        <path d="M4 6h16v12H4V6zm0 0l8 6 8-6" stroke={isSelected ? "#ff4500" : "#94a3b8"} strokeWidth="1.5" fill="none" />
                      )}
                      {opt.id === "clamshell" && (
                        <path d="M6 12h12M6 6a6 6 0 0112 0v12a6 6 0 01-12 0V6z" stroke={isSelected ? "#ff4500" : "#94a3b8"} strokeWidth="1.5" fill="none" />
                      )}
                      {opt.id === "blister" && (
                        <rect x="4" y="4" width="16" height="16" rx="2" stroke={isSelected ? "#ff4500" : "#94a3b8"} strokeWidth="1.5" fill="none" />
                      )}
                      {opt.id === "custom" && (
                        <>
                          <circle cx="12" cy="12" r="8" stroke={isSelected ? "#ff4500" : "#94a3b8"} strokeWidth="1.5" fill="none" />
                          <path d="M12 8v8M8 12h8" stroke={isSelected ? "#ff4500" : "#94a3b8"} strokeWidth="1.5" />
                        </>
                      )}
                    </svg>
                    <div>
                      <p className={`text-sm font-medium ${isSelected ? "text-international-orange" : "text-foreground"}`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Card 3: Inserts & Documentation ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Inserts & Documentation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {["Instruction Card", "Warranty Card", "Thank You Card", "QR Code Sticker", "Packing Slip"].map((insert) => {
              const isChecked = insert === "Instruction Card"
                ? branding.includeInstructionCard
                : insert === "Warranty Card"
                  ? branding.includeWarrantyCard
                  : branding.customInserts.includes(insert)
              return (
                <button
                  key={insert}
                  onClick={() => {
                    if (insert === "Instruction Card") {
                      onUpdate({ includeInstructionCard: !branding.includeInstructionCard })
                    } else if (insert === "Warranty Card") {
                      onUpdate({ includeWarrantyCard: !branding.includeWarrantyCard })
                    } else {
                      toggleInsert(insert)
                    }
                  }}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${
                    isChecked
                      ? "border-international-orange bg-international-orange/5"
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${
                      isChecked ? "border-international-orange bg-international-orange" : "border-muted-foreground"
                    }`}>
                      {isChecked && (
                        <svg width="10" height="10" viewBox="0 0 10 10">
                          <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none" />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm">{insert}</span>
                  </div>
                </button>
              )
            })}
          </div>

          {branding.includeInstructionCard && (
            <div className="space-y-1.5">
              <Label htmlFor="instruction-notes">Instruction Card Notes</Label>
              <Textarea
                id="instruction-notes"
                placeholder="Key assembly or usage instructions to include..."
                value={branding.instructionCardNotes}
                onChange={(e) => onUpdate({ instructionCardNotes: e.target.value })}
                rows={3}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="unboxing-notes">Unboxing Experience Notes</Label>
            <Textarea
              id="unboxing-notes"
              placeholder="Any special unboxing requirements (tissue paper, foam inserts, etc.)..."
              value={branding.unboxingNotes}
              onChange={(e) => onUpdate({ unboxingNotes: e.target.value })}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Card 4: Regulatory Labels ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Regulatory Labels</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {REGULATORY_OPTIONS.map((opt) => {
              const isSelected = branding.regulatoryLabels.includes(opt.label)
              return (
                <button
                  key={opt.id}
                  onClick={() => toggleRegLabel(opt.label)}
                  className={`px-3 py-1.5 rounded-full border text-sm transition-all ${
                    isSelected
                      ? "border-international-orange bg-international-orange/10 text-international-orange font-medium"
                      : "border-border text-muted-foreground hover:border-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Card 5: Live Box Preview ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Packaging Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center">
            <svg width="360" height="280" viewBox="0 0 360 280">
              {/* Box base */}
              <rect
                x="40" y="60" width="280" height="180" rx="4"
                fill="white"
                stroke={primaryColor}
                strokeWidth="2"
              />
              {/* Box lid flap */}
              <path
                d="M40 60 L60 30 L320 30 L320 60"
                fill={`${primaryColor}10`}
                stroke={primaryColor}
                strokeWidth="1.5"
              />
              {/* Box side flap */}
              <path
                d="M320 60 L340 40 L340 220 L320 240"
                fill={`${primaryColor}08`}
                stroke={primaryColor}
                strokeWidth="1"
              />
              {/* Logo area */}
              <rect
                x="130" y="90" width="100" height="40" rx="4"
                fill={`${primaryColor}15`}
                stroke={primaryColor}
                strokeWidth="1"
                strokeDasharray={branding.logoUrl ? "0" : "4 2"}
              />
              <text
                x="180" y="115"
                textAnchor="middle"
                fill={primaryColor}
                className="text-[11px] font-medium"
              >
                {branding.logoUrl ? "LOGO" : "Add Logo"}
              </text>

              {/* Color swatches on box */}
              {branding.colorPalette.slice(0, 3).map((color, i) => (
                <rect
                  key={i}
                  x={140 + i * 28}
                  y={145}
                  width={22}
                  height={8}
                  rx={2}
                  fill={color}
                />
              ))}

              {/* Insert icons inside box */}
              <g transform="translate(80, 170)">
                {branding.includeInstructionCard && (
                  <g>
                    <rect x="0" y="0" width="50" height="35" rx="2" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="0.5" />
                    <text x="25" y="14" textAnchor="middle" className="text-[7px] fill-muted-foreground">Instruction</text>
                    <text x="25" y="24" textAnchor="middle" className="text-[7px] fill-muted-foreground">Card</text>
                  </g>
                )}
                {branding.includeWarrantyCard && (
                  <g transform="translate(60, 0)">
                    <rect x="0" y="0" width="50" height="35" rx="2" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="0.5" />
                    <text x="25" y="14" textAnchor="middle" className="text-[7px] fill-muted-foreground">Warranty</text>
                    <text x="25" y="24" textAnchor="middle" className="text-[7px] fill-muted-foreground">Card</text>
                  </g>
                )}
                {branding.customInserts.length > 0 && (
                  <g transform={`translate(${(branding.includeInstructionCard ? 60 : 0) + (branding.includeWarrantyCard ? 60 : 0)}, 0)`}>
                    <rect x="0" y="0" width="50" height="35" rx="2" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="0.5" />
                    <text x="25" y="20" textAnchor="middle" className="text-[7px] fill-muted-foreground">
                      +{branding.customInserts.length}
                    </text>
                  </g>
                )}
              </g>

              {/* Regulatory badges */}
              {branding.regulatoryLabels.slice(0, 4).map((label, i) => (
                <g key={label} transform={`translate(${80 + i * 50}, 220)`}>
                  <rect x="0" y="0" width="42" height="16" rx="3" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="0.5" />
                  <text x="21" y="11" textAnchor="middle" className="text-[7px] fill-muted-foreground font-medium">
                    {label.length > 6 ? label.slice(0, 5) + "\u2026" : label}
                  </text>
                </g>
              ))}

              {/* Packaging type label */}
              <text x="180" y="268" textAnchor="middle" className="text-[10px] fill-muted-foreground">
                {PACKAGING_OPTIONS.find((o) => o.id === branding.packagingType)?.label ?? "Box"}
              </text>
            </svg>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
