"use client"

/**
 * @file cad-lab-research-report.tsx — Structured research report viewer.
 *
 * @description Parses the markdown research report into scannable sections
 * displayed as cards. Engineers can quickly find dimensions, materials, and
 * constraints without reading a wall of text. Falls back to raw markdown
 * rendering for sections that don't match known patterns.
 *
 * @component
 *
 * @example
 * <CadLabResearchReport
 *   report={editableReport}
 *   onEdit={() => setIsEditing(true)}
 * />
 */

import { useMemo } from "react"
import {
  Ruler,
  Box,
  AlertTriangle,
  FlaskConical,
  CheckCircle2,
  HelpCircle,
  FileText,
  Layers,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// ─── Types ──────────────────────────────────────────────────────────

interface ParsedSection {
  /** Section heading text (without ##) */
  title: string
  /** Raw markdown content of this section */
  content: string
  /** Detected section type for icon/color treatment */
  type: "summary" | "dimensions" | "structure" | "components" | "constraints" | "materials" | "confidence" | "other"
}

interface CadLabResearchReportProps {
  /** The full research report markdown text */
  report: string
}

// ─── Section Type Detection ──────────────────────────────────────────

const SECTION_PATTERNS: Array<{ type: ParsedSection["type"]; patterns: string[] }> = [
  { type: "summary", patterns: ["executive summary", "summary", "overview"] },
  { type: "dimensions", patterns: ["overall dimensions", "dimensions", "envelope"] },
  { type: "structure", patterns: ["primary structure", "structure", "frame", "body"] },
  { type: "components", patterns: ["components", "component", "sub-assemblies", "parts"] },
  { type: "constraints", patterns: ["critical constraints", "constraints", "clearance", "requirements"] },
  { type: "materials", patterns: ["material", "manufacturing", "fabrication"] },
  { type: "confidence", patterns: ["dimensional confidence", "confidence", "data quality"] },
]

/**
 * Detects the semantic type of a section based on its heading.
 *
 * @param title - Section heading text
 * @returns Detected section type
 */
function detectSectionType(title: string): ParsedSection["type"] {
  const lower = title.toLowerCase()
  for (const { type, patterns } of SECTION_PATTERNS) {
    if (patterns.some((p) => lower.includes(p))) return type
  }
  return "other"
}

/**
 * Returns the icon and color for a section type.
 *
 * @param type - Section type
 * @returns Object with icon component and color class
 */
function getSectionStyle(type: ParsedSection["type"]): {
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
} {
  switch (type) {
    case "summary":
      return { icon: FileText, color: "text-international-orange", bgColor: "bg-international-orange-light" }
    case "dimensions":
      return { icon: Ruler, color: "text-electric-blue", bgColor: "bg-status-info-light" }
    case "structure":
      return { icon: Box, color: "text-foreground", bgColor: "bg-muted" }
    case "components":
      return { icon: Layers, color: "text-status-info", bgColor: "bg-status-info-light" }
    case "constraints":
      return { icon: AlertTriangle, color: "text-status-warning", bgColor: "bg-status-warning-light" }
    case "materials":
      return { icon: FlaskConical, color: "text-status-success", bgColor: "bg-status-success-light" }
    case "confidence":
      return { icon: CheckCircle2, color: "text-status-success", bgColor: "bg-status-success-light" }
    default:
      return { icon: FileText, color: "text-muted-foreground", bgColor: "bg-muted" }
  }
}

// ─── Markdown Parsing ────────────────────────────────────────────────

/**
 * Parses a markdown research report into sections based on ## headings.
 *
 * @param report - Full markdown report text
 * @returns Array of parsed sections
 */
function parseReport(report: string): ParsedSection[] {
  if (!report.trim()) return []

  const lines = report.split("\n")
  const sections: ParsedSection[] = []
  let currentTitle = ""
  let currentContent: string[] = []
  let foundFirstH2 = false

  for (const line of lines) {
    // Match ## headings (but not # h1 which is the report title)
    const h2Match = line.match(/^##\s+(.+)$/)

    if (h2Match) {
      // Save previous section
      if (foundFirstH2 && currentTitle) {
        sections.push({
          title: currentTitle,
          content: currentContent.join("\n").trim(),
          type: detectSectionType(currentTitle),
        })
      }
      currentTitle = h2Match[1].trim()
      currentContent = []
      foundFirstH2 = true
    } else if (foundFirstH2) {
      currentContent.push(line)
    }
    // Lines before first ## are considered preamble (title, etc.) — skip
  }

  // Push last section
  if (currentTitle) {
    sections.push({
      title: currentTitle,
      content: currentContent.join("\n").trim(),
      type: detectSectionType(currentTitle),
    })
  }

  return sections
}

/**
 * Extracts the h1 title from the report.
 *
 * @param report - Full markdown report text
 * @returns Title string or null
 */
function extractTitle(report: string): string | null {
  const match = report.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : null
}

// ─── Dimension Extraction ────────────────────────────────────────────

interface DimensionEntry {
  label: string
  value: string
  confidence: "confirmed" | "approximate" | "unknown" | null
}

/**
 * Extracts dimensions from a section content block.
 * Looks for patterns like "- Label: 100 × 50 × 30 mm" or "- Weight: 500 g"
 *
 * @param content - Section content text
 * @returns Array of extracted dimensions
 */
function extractDimensions(content: string): DimensionEntry[] {
  const entries: DimensionEntry[] = []
  const lines = content.split("\n")

  for (const line of lines) {
    // Match "- Label: value" or "- **Label**: value"
    const match = line.match(/^[-*]\s+\*?\*?([^:*]+)\*?\*?\s*:\s*(.+)$/)
    if (match) {
      const label = match[1].trim()
      const value = match[2].trim()

      // Detect confidence markers
      let confidence: DimensionEntry["confidence"] = null
      if (value.includes("✅") || value.toLowerCase().includes("confirmed")) confidence = "confirmed"
      else if (value.includes("⚠️") || value.toLowerCase().includes("approximate")) confidence = "approximate"
      else if (value.includes("❓") || value.toLowerCase().includes("unknown")) confidence = "unknown"

      entries.push({ label, value: value.replace(/[✅⚠️❓]/g, "").trim(), confidence })
    }
  }

  return entries
}

// ─── Components ──────────────────────────────────────────────────────

/**
 * DimensionCard — renders a dimension as a compact metric.
 */
function DimensionCard({ dim }: { dim: DimensionEntry }): React.ReactNode {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-muted last:border-0">
      <span className="text-xs text-muted-foreground">{dim.label}</span>
      <div className="flex items-center gap-1.5 text-right">
        <span className="text-xs font-mono font-semibold text-foreground">{dim.value}</span>
        {dim.confidence === "confirmed" && <CheckCircle2 className="h-3 w-3 text-status-success flex-shrink-0" />}
        {dim.confidence === "approximate" && <AlertTriangle className="h-3 w-3 text-status-warning flex-shrink-0" />}
        {dim.confidence === "unknown" && <HelpCircle className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
      </div>
    </div>
  )
}

/**
 * SectionCard — renders a parsed report section as a styled card.
 */
function SectionCard({ section }: { section: ParsedSection }): React.ReactNode {
  const style = getSectionStyle(section.type)
  const Icon = style.icon

  // For dimensions-type sections, try to extract structured data
  const dimensions = (section.type === "dimensions" || section.type === "confidence")
    ? extractDimensions(section.content)
    : []

  // Render content as simple formatted text
  const contentLines = section.content.split("\n").filter((l) => l.trim())

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className={cn("flex h-6 w-6 items-center justify-center rounded-md", style.bgColor)}>
            <Icon className={cn("h-3.5 w-3.5", style.color)} />
          </div>
          {section.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Structured dimension view for dimension/confidence sections */}
        {dimensions.length > 0 ? (
          <div className="space-y-0">
            {dimensions.map((dim, i) => (
              <DimensionCard key={i} dim={dim} />
            ))}
          </div>
        ) : (
          /* Prose/bullet content for other sections */
          <div className="space-y-1">
            {contentLines.map((line, i) => {
              const trimmed = line.trim()

              // Bold items (markdown **text**)
              if (trimmed.startsWith("- **") || trimmed.startsWith("* **")) {
                const boldMatch = trimmed.match(/^[-*]\s+\*\*([^*]+)\*\*\s*:?\s*(.*)$/)
                if (boldMatch) {
                  return (
                    <div key={i} className="flex items-start gap-2 text-xs py-0.5">
                      <span className="font-semibold text-foreground min-w-[100px]">{boldMatch[1]}</span>
                      <span className="text-muted-foreground flex-1">{boldMatch[2]}</span>
                    </div>
                  )
                }
              }

              // Bullet points
              if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                return (
                  <div key={i} className="flex items-start gap-2 text-xs py-0.5">
                    <span className="text-muted-foreground mt-1">•</span>
                    <span className="text-foreground">{trimmed.replace(/^[-*]\s+/, "")}</span>
                  </div>
                )
              }

              // Confidence markers
              if (trimmed.startsWith("✅") || trimmed.startsWith("⚠️") || trimmed.startsWith("❓")) {
                const isConfirmed = trimmed.startsWith("✅")
                const isApprox = trimmed.startsWith("⚠️")
                return (
                  <div key={i} className={cn(
                    "flex items-start gap-2 text-xs py-0.5 px-2 rounded",
                    isConfirmed && "bg-status-success-light/50",
                    isApprox && "bg-status-warning-light/50",
                    !isConfirmed && !isApprox && "bg-muted/50",
                  )}>
                    <span className="text-foreground">{trimmed}</span>
                  </div>
                )
              }

              // Regular paragraph
              if (trimmed) {
                return (
                  <p key={i} className="text-xs text-foreground leading-relaxed">{trimmed}</p>
                )
              }

              return null
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Main Component ──────────────────────────────────────────────────

/**
 * CadLabResearchReport — Structured research report viewer.
 *
 * @description Parses markdown research report into scannable section cards.
 * Each section gets an icon and color treatment based on its type.
 * Dimensions are extracted into a compact table format.
 */
export function CadLabResearchReport({ report }: CadLabResearchReportProps): React.ReactNode {
  const title = useMemo(() => extractTitle(report), [report])
  const sections = useMemo(() => parseReport(report), [report])

  if (sections.length === 0) {
    // Fallback: if parsing finds no sections, show nothing
    // (the parent component will show raw markdown instead)
    return null
  }

  return (
    <div className="space-y-4">
      {/* Report title */}
      {title && (
        <div className="pb-2">
          <h3 className="text-sm font-semibold text-foreground">{title.replace(/^Engineering Research Report:\s*/i, "")}</h3>
        </div>
      )}

      {/* Confidence legend */}
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="font-medium">Confidence:</span>
        <div className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-status-success" />
          <span>Confirmed</span>
        </div>
        <div className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 text-status-warning" />
          <span>Approximate</span>
        </div>
        <div className="flex items-center gap-1">
          <HelpCircle className="h-3 w-3 text-muted-foreground" />
          <span>Unknown</span>
        </div>
      </div>

      {/* Section cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((section, i) => {
          // Summary gets full width
          const isFullWidth = section.type === "summary" || section.type === "components"
          return (
            <div key={i} className={isFullWidth ? "md:col-span-2" : ""}>
              <SectionCard section={section} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
