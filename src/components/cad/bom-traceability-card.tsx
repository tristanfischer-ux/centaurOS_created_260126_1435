"use client"

/**
 * @file bom-traceability-card.tsx — Per-unit BOM traceability template.
 *
 * @description For each shipped unit, founders should retain: module → supplier
 * → lot number → material cert → date code. This component generates a
 * printable template + shows the current per-module assignment so the founder
 * knows whether their traceability is set up before the first production run.
 *
 * @related
 * - Consumer: Assemble page, Assembly Flow tab
 */

import React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { QrCode, Download, Boxes } from "lucide-react"
import { toast } from "sonner"

interface Module {
  id: string
  name: string
}

interface BOMTraceabilityCardProps {
  productName: string
  modules: Module[]
  /** Optional mapping moduleId → supplier display name (from the selected ranked supplier) */
  supplierByModule?: Map<string, string>
}

export function BOMTraceabilityCard({ productName, modules, supplierByModule }: BOMTraceabilityCardProps) {
  const handleDownload = () => {
    const lines: string[] = []
    lines.push(`BOM TRACEABILITY CARD — ${productName}`)
    lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`)
    lines.push("")
    lines.push("For each physical unit you ship, retain this record for the life of the warranty plus regulatory retention (typically 7-10 years).")
    lines.push("")
    lines.push(`Unit serial number: ______________________________`)
    lines.push(`Unit date code:     ______________________________`)
    lines.push(`Final inspector:    ______________________________`)
    lines.push(`Final QC date:      ______________________________`)
    lines.push("")
    lines.push("─── PER-MODULE PROVENANCE ───")
    lines.push("")
    for (const mod of modules) {
      const supplier = supplierByModule?.get(mod.id) ?? "[supplier name]"
      lines.push(`Module: ${mod.name}`)
      lines.push(`  Supplier:        ${supplier}`)
      lines.push(`  PO number:       _______________________________`)
      lines.push(`  Lot / batch #:   _______________________________`)
      lines.push(`  Material cert:   _______________________________`)
      lines.push(`  Date code:       _______________________________`)
      lines.push(`  FAI ref:         _______________________________`)
      lines.push("")
    }
    lines.push("─── ASSEMBLY + TEST ───")
    lines.push("")
    lines.push("Assembly workstation:   ____________")
    lines.push("Assembly operator:      ____________")
    lines.push("Final functional test:  ____________")
    lines.push("Burn-in start:          ____________")
    lines.push("Burn-in end:            ____________")
    lines.push("Shipping label ID:      ____________")
    lines.push("")
    lines.push("Retention: 7-10 years post-ship. Store digitally + archive hard-copy.")

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    const safe = productName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    a.href = url
    a.download = `bom-traceability-${safe || "template"}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success("Traceability template downloaded")
  }

  return (
    <Card className="border-border">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Boxes className="h-4 w-4 text-international-orange" />
              BOM traceability
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Per-unit provenance record. Download the template, one card per unit shipped.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Download template
          </Button>
        </div>

        {/* Preview grid */}
        <div className="space-y-1.5 pt-3 border-t border-border">
          {modules.map((mod) => {
            const supplier = supplierByModule?.get(mod.id)
            return (
              <div key={mod.id} className="flex items-start gap-3 px-2.5 py-1.5 rounded hover:bg-muted/30 transition-colors">
                <QrCode className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{mod.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {supplier ? `Supplier: ${supplier}` : <span className="italic">Supplier not yet ranked — fields will be blank on the card</span>}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">
                  lot · cert · date
                </span>
              </div>
            )
          })}
        </div>

        <p className="text-[10px] text-muted-foreground mt-3">
          Retention: 7–10 years post-ship typical. Store digitally (e.g., per-serial folder) + archive hard copy.
        </p>
      </CardContent>
    </Card>
  )
}
