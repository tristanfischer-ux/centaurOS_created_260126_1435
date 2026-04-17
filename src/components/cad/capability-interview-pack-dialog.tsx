"use client"

/**
 * @file capability-interview-pack-dialog.tsx — Generate + preview a supplier Q&A pack.
 *
 * @description Renders a structured list of questions a founder should ask a
 * supplier before awarding work — MOQ, tooling, lead time, payment terms,
 * quality systems, compliance, continuity. Includes a "Red flags" panel of
 * warning signs to watch for in replies.
 *
 * Output is copy-to-clipboard + download as .txt. The founder can paste it
 * into an email directly.
 *
 * @related
 * - Template: src/lib/cad-lab/capability-interview-template.ts
 */

import React, { useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Copy, Download, AlertTriangle, CheckCircle2, FileText } from "lucide-react"
import { toast } from "sonner"
import {
  buildDefaultInterviewPack,
  renderInterviewPackAsText,
  INTERVIEW_SECTIONS,
  DEFAULT_RED_FLAGS,
} from "@/lib/cad-lab/capability-interview-template"

interface CapabilityInterviewPackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  productName: string
  supplierName?: string
  moduleNames?: string[]
}

export function CapabilityInterviewPackDialog({
  open,
  onOpenChange,
  productName,
  supplierName,
  moduleNames,
}: CapabilityInterviewPackDialogProps) {
  const pack = useMemo(
    () => buildDefaultInterviewPack({ productName, supplierName, moduleNames }),
    [productName, supplierName, moduleNames],
  )

  const text = useMemo(() => renderInterviewPackAsText(pack), [pack])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Interview pack copied to clipboard")
    } catch {
      toast.error("Copy failed — try download instead")
    }
  }

  const handleDownload = () => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const safeName = (supplierName ?? productName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    const a = document.createElement("a")
    a.href = url
    a.download = `capability-interview-${safeName || "pack"}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success("Downloaded")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-international-orange" />
            Capability Interview Pack
            {supplierName && (
              <Badge variant="secondary" className="ml-1 font-normal">{supplierName}</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Send this to the supplier before awarding any work. Short answers are fine — specifics beat polish.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-2">
          {/* Sections */}
          {INTERVIEW_SECTIONS.map((section) => (
            <Card key={section.id} className="border-border">
              <CardContent className="pt-4">
                <p className="text-sm font-semibold text-foreground">{section.title}</p>
                <p className="text-xs text-muted-foreground italic mt-0.5 mb-2">{section.intent}</p>
                <ul className="space-y-1.5">
                  {section.questions.map((q, i) => (
                    <li key={i} className="text-xs text-foreground flex items-start gap-2">
                      <CheckCircle2 className="h-3 w-3 text-international-orange mt-0.5 flex-shrink-0" aria-hidden />
                      <span>{q}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}

          {/* Red flags */}
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-4">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Red flags when reviewing the reply
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                Anything that matches one of these is worth a follow-up question — or a move to a different supplier.
              </p>
              <ul className="space-y-1.5">
                {DEFAULT_RED_FLAGS.map((flag, i) => (
                  <li key={i} className="text-xs text-foreground flex items-start gap-2">
                    <span className="text-destructive mt-0.5 flex-shrink-0">⚠</span>
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="secondary" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-1.5" />
            Download .txt
          </Button>
          <Button onClick={handleCopy}>
            <Copy className="h-4 w-4 mr-1.5" />
            Copy to clipboard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
