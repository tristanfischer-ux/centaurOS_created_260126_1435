"use client"

/**
 * @file design-intake-form.tsx — Collapsible manufacturing details for The Forge.
 *
 * @description Collects use-case, compliance, process, material, tolerance,
 * quantity, and assumption inputs that improve research quality and build
 * toward a supplier-ready RFQ. Collapsed by default with clear explanation
 * of purpose. Also includes the Claude model selector under "Advanced."
 */

import { useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import {
  Box,
  Factory,
  Ruler,
  Scale,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Settings2,
  FileText,
} from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { TextareaWithSpeech } from "@/components/ui/textarea-with-speech"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CLAUDE_MODELS } from "@/lib/cad-lab-types"
import type { ClaudeModelId, CadLabDesignBrief } from "@/lib/cad-lab-types"

// ─── Option constants ────────────────────────────────────────────────

const TARGET_PROCESS_OPTIONS = [
  "CNC Machining",
  "Sheet Metal",
  "Injection Molding",
  "Casting",
  "FDM 3D Print",
  "SLS/Powder Print",
  "Manual Assembly",
  "Undecided",
] as const

const TARGET_MATERIAL_OPTIONS = [
  "Aluminium",
  "Steel/Stainless",
  "ABS/Nylon",
  "PLA/PETG",
  "Carbon Fiber Composite",
  "Copper/Brass",
  "Titanium",
  "Undecided",
] as const

const TOLERANCE_OPTIONS = [
  "±1mm (concept)",
  "±0.5mm (standard)",
  "±0.1mm (precision)",
  "±0.05mm (tight fit)",
  "Undecided",
] as const

const QUANTITY_OPTIONS = [
  "Prototype (1-5)",
  "Pilot (10-100)",
  "Low-volume (100-1000)",
  "Production (1000+)",
  "Undecided",
] as const

// ─── Component ───────────────────────────────────────────────────────

interface DesignIntakeFormProps {
  modelId: ClaudeModelId
  setModelId: (value: ClaudeModelId) => void
  designBrief: CadLabDesignBrief
  setDesignBrief: Dispatch<SetStateAction<CadLabDesignBrief>>
  assumptionNotes: string
  setAssumptionNotes: (value: string) => void
  designReadinessPct: number
  isAnyLoading: boolean
}

/**
 * DesignIntakeForm — Collapsible manufacturing details section.
 *
 * @description Collapsed by default. Explains its purpose clearly:
 * these details improve research quality and build toward a supplier-ready RFQ.
 */
export function DesignIntakeForm({
  modelId,
  setModelId,
  designBrief,
  setDesignBrief,
  assumptionNotes,
  setAssumptionNotes,
  designReadinessPct,
  isAnyLoading,
}: DesignIntakeFormProps): React.ReactNode {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  return (
    <Card>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left p-4 sm:p-6 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors rounded-xl"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Add manufacturing details
              <span className="ml-2 text-xs font-normal text-muted-foreground">(optional)</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Improve research accuracy and build toward a supplier-ready RFQ
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* RFQ readiness indicator */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-international-orange rounded-full transition-all duration-500"
                style={{ width: `${designReadinessPct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              {designReadinessPct}%
            </span>
          </div>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <CardContent className="pt-0 pb-6 px-4 sm:px-6 space-y-5">
          {/* Explanation */}
          <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground leading-relaxed">
            Specifying materials, tolerances, and manufacturing process helps the research
            phase find more relevant reference designs. These details also build toward a
            complete Request for Quote (RFQ) that you can send directly to suppliers.
          </div>

          {/* RFQ readiness bar (visible on mobile) */}
          <div className="sm:hidden space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">RFQ readiness</span>
              <span className="font-mono text-muted-foreground">{designReadinessPct}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-international-orange rounded-full transition-all duration-500"
                style={{ width: `${designReadinessPct}%` }}
              />
            </div>
          </div>

          {/* Use case + Compliance */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="use-case" className="flex items-center gap-1.5">
                <Ruler className="h-3.5 w-3.5" /> Use case & critical dimensions
              </Label>
              <TextareaWithSpeech
                id="use-case"
                enableSpeech
                value={designBrief.useCase}
                onChange={(e) => setDesignBrief((prev) => ({ ...prev, useCase: e.target.value }))}
                onSpeechTranscript={(text) => setDesignBrief((prev) => ({ ...prev, useCase: prev.useCase ? prev.useCase + " " + text : text }))}
                placeholder="e.g. Outdoor heavy-lift UAV payload mount, 300×220×120mm envelope, must survive 20g shock"
                className="min-h-[84px]"
                disabled={isAnyLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="compliance" className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" /> Compliance and constraints
              </Label>
              <TextareaWithSpeech
                id="compliance"
                enableSpeech
                value={designBrief.complianceNotes}
                onChange={(e) => setDesignBrief((prev) => ({ ...prev, complianceNotes: e.target.value }))}
                onSpeechTranscript={(text) => setDesignBrief((prev) => ({ ...prev, complianceNotes: prev.complianceNotes ? prev.complianceNotes + " " + text : text }))}
                placeholder="e.g. IP54 ingress protection, ASTM F963 edges, RoHS, food-safe surfaces"
                className="min-h-[84px]"
                disabled={isAnyLoading}
              />
            </div>
          </div>

          {/* Process, Material, Tolerance, Quantity */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="target-process" className="flex items-center gap-1.5">
                <Factory className="h-3.5 w-3.5" /> Process
              </Label>
              <Select
                value={designBrief.targetProcess}
                onValueChange={(v) => setDesignBrief((prev) => ({ ...prev, targetProcess: v }))}
                disabled={isAnyLoading}
              >
                <SelectTrigger id="target-process">
                  <SelectValue placeholder="Select process" />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_PROCESS_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-material" className="flex items-center gap-1.5">
                <Box className="h-3.5 w-3.5" /> Material
              </Label>
              <Select
                value={designBrief.targetMaterial}
                onValueChange={(v) => setDesignBrief((prev) => ({ ...prev, targetMaterial: v }))}
                disabled={isAnyLoading}
              >
                <SelectTrigger id="target-material">
                  <SelectValue placeholder="Select material" />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_MATERIAL_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-tolerance" className="flex items-center gap-1.5">
                <Scale className="h-3.5 w-3.5" /> Tolerance
              </Label>
              <Select
                value={designBrief.toleranceTarget}
                onValueChange={(v) => setDesignBrief((prev) => ({ ...prev, toleranceTarget: v }))}
                disabled={isAnyLoading}
              >
                <SelectTrigger id="target-tolerance">
                  <SelectValue placeholder="Select tolerance" />
                </SelectTrigger>
                <SelectContent>
                  {TOLERANCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-quantity">Quantity target</Label>
              <Select
                value={designBrief.quantityTarget}
                onValueChange={(v) => setDesignBrief((prev) => ({ ...prev, quantityTarget: v }))}
                disabled={isAnyLoading}
              >
                <SelectTrigger id="target-quantity">
                  <SelectValue placeholder="Select quantity" />
                </SelectTrigger>
                <SelectContent>
                  {QUANTITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Assumptions */}
          <div className="space-y-2">
            <Label htmlFor="assumptions">Known assumptions or non-negotiables</Label>
            <TextareaWithSpeech
              id="assumptions"
              enableSpeech
              value={assumptionNotes}
              onChange={(e) => setAssumptionNotes(e.target.value)}
              onSpeechTranscript={(text) => setAssumptionNotes(assumptionNotes ? assumptionNotes + " " + text : text)}
              placeholder="e.g. Must fit existing M3 bolt pattern at 60mm PCD; supplier must support PPAP level 3"
              className="min-h-[72px]"
              disabled={isAnyLoading}
            />
          </div>

          {/* Advanced: Model selector */}
          <div className="border-t pt-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span className="font-medium">Advanced settings</span>
              {showAdvanced ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
            {showAdvanced && (
              <div className="mt-3 max-w-xs space-y-2">
                <Label htmlFor="model">Claude Model</Label>
                <Select
                  value={modelId}
                  onValueChange={(v) => setModelId(v as ClaudeModelId)}
                  disabled={isAnyLoading}
                >
                  <SelectTrigger id="model">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLAUDE_MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
