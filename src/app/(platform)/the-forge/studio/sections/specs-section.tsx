"use client"

/**
 * @file specs-section.tsx — Section 4: Engineering Specifications.
 *
 * INTENT: Consolidates the Analysis and Procurement pages into collapsible
 * inline sections. Shows DFM analysis, risk register, timeline, cost
 * estimates, and supply chain diagnostics — all in one scrollable block.
 *
 * DECISION: All sub-sections are collapsible because this is dense data
 * that not every user will need to inspect in detail. The section
 * header shows summary counts for quick scanning.
 */

import { useState } from "react"
import {
  BarChart3,
  Clock,
  AlertTriangle,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Truck,
  ClipboardCheck,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CadLabAnalysisDashboard } from "@/components/cad/cad-lab-analysis-dashboard"
import { CadLabTimeline } from "@/components/cad/cad-lab-timeline"
import { CadLabRiskRegister } from "@/components/cad/cad-lab-risk-register"
import { CadLabDiagnostics } from "@/components/cad/cad-lab-diagnostics"
import { CadLabSupplyChain } from "@/components/cad/cad-lab-supply-chain"
import { CadLabCostEstimate } from "@/components/cad/cad-lab-cost-estimate"
import { ProcurementEnrichment } from "@/components/cad/procurement-enrichment"

import { useCadLab } from "../../cad-lab/cad-lab-context"

type SpecSubSection = "analysis" | "timeline" | "risks" | "diagnostics" | "supply" | "cost"

export function SpecsSection(): React.ReactNode {
  const {
    modules,
    subject,
    riskCount,
    diagnosticAnswers,
    setDiagnosticAnswers,
    aiPrefilled,
    diagCompletedCount,
  } = useCadLab()

  const [expanded, setExpanded] = useState<Set<SpecSubSection>>(new Set(["analysis"]))

  function toggleSection(section: SpecSubSection): void {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const componentNames = modules.map((m) => m.name).filter(Boolean)
  const criticalPath = modules.length > 0 ? Math.max(...modules.map((m) => m.leadWeeks)) : 0

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-international-orange text-white text-xs font-bold">
            4
          </div>
          <h2 className="text-lg font-semibold text-foreground">Specifications</h2>
        </div>
        <p className="text-sm text-muted-foreground ml-9">
          Engineering analysis, risk register, cost estimates, and supply chain diagnostics.
        </p>
        {/* Summary stats */}
        <div className="flex flex-wrap gap-4 ml-9 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> {riskCount} risks
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {criticalPath}w critical path
          </span>
          <span className="flex items-center gap-1">
            <ClipboardCheck className="h-3 w-3" /> {diagCompletedCount}/{modules.length} diagnostics
          </span>
        </div>
      </div>

      {/* Analysis Dashboard */}
      <CollapsibleCard
        title="Engineering Analysis"
        icon={<BarChart3 className="h-4 w-4" />}
        isExpanded={expanded.has("analysis")}
        onToggle={() => toggleSection("analysis")}
      >
        <CadLabAnalysisDashboard modules={modules} projectName={subject} />
      </CollapsibleCard>

      {/* Timeline */}
      <CollapsibleCard
        title="Timeline & Critical Path"
        icon={<Clock className="h-4 w-4" />}
        isExpanded={expanded.has("timeline")}
        onToggle={() => toggleSection("timeline")}
      >
        <CadLabTimeline modules={modules} />
      </CollapsibleCard>

      {/* Risk Register */}
      <CollapsibleCard
        title="Risk Register"
        icon={<AlertTriangle className="h-4 w-4" />}
        subtitle={`${riskCount} items`}
        isExpanded={expanded.has("risks")}
        onToggle={() => toggleSection("risks")}
      >
        <CadLabRiskRegister modules={modules} />
      </CollapsibleCard>

      {/* Manufacturing Diagnostics */}
      <CollapsibleCard
        title="Manufacturing Diagnostics"
        icon={<ClipboardCheck className="h-4 w-4" />}
        subtitle={`${diagCompletedCount}/${modules.length} complete`}
        isExpanded={expanded.has("diagnostics")}
        onToggle={() => toggleSection("diagnostics")}
      >
        <CadLabDiagnostics
          modules={modules}
          answers={diagnosticAnswers}
          onAnswersChange={setDiagnosticAnswers}
          aiPrefilled={aiPrefilled}
        />
      </CollapsibleCard>

      {/* Supply Chain */}
      <CollapsibleCard
        title="Supply Chain Analysis"
        icon={<Truck className="h-4 w-4" />}
        isExpanded={expanded.has("supply")}
        onToggle={() => toggleSection("supply")}
      >
        <CadLabSupplyChain modules={modules} diagnosticAnswers={diagnosticAnswers} />
        <div className="mt-6">
          <ProcurementEnrichment componentNames={componentNames} />
        </div>
      </CollapsibleCard>

      {/* Cost Estimate */}
      <CollapsibleCard
        title="Cost Estimate"
        icon={<DollarSign className="h-4 w-4" />}
        isExpanded={expanded.has("cost")}
        onToggle={() => toggleSection("cost")}
      >
        <CadLabCostEstimate modules={modules} diagnosticAnswers={diagnosticAnswers} />
      </CollapsibleCard>
    </div>
  )
}

function CollapsibleCard({
  title,
  icon,
  subtitle,
  isExpanded,
  onToggle,
  children,
}: {
  title: string
  icon: React.ReactNode
  subtitle?: string
  isExpanded: boolean
  onToggle: () => void
  children: React.ReactNode
}): React.ReactNode {
  return (
    <Card>
      <CardHeader>
        <button
          onClick={onToggle}
          className="flex items-center justify-between w-full text-left"
          aria-expanded={isExpanded}
        >
          <CardTitle className="text-base flex items-center gap-2">
            {icon}
            {title}
            {subtitle && (
              <span className="text-xs font-normal text-muted-foreground">{subtitle}</span>
            )}
          </CardTitle>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </CardHeader>
      {isExpanded && <CardContent>{children}</CardContent>}
    </Card>
  )
}
