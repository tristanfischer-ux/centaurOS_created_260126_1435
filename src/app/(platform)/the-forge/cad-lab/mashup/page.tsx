"use client"

/**
 * Mashup Lab — Combine 2+ STEP files into a hybrid product.
 *
 * @description Wizard: (1) Select sources, (2) Describe mashup concept,
 * (3) Generate (plan + code + Modal), (4) Preview, download, and send to RFQ.
 */

import { useState, useTransition } from "react"
import {
  Loader2,
  Sparkles,
  Download,
  ArrowRight,
  Box,
  FileText,
  CheckCircle2,
  SendHorizonal,
  ExternalLink,
  AlertCircle,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { MashupSourceSelector } from "../components/mashup-source-selector"
import { STLViewer } from "@/components/cad/stl-viewer"
import { generateMashup } from "@/actions/cad-lab"
import { createMashupRfqAction } from "@/actions/cad-lab-rfq"
import type { MashupSourceInput, MashupResult } from "@/lib/cad-lab-types"
import { typography } from "@/lib/design-system"
import { cn } from "@/lib/utils"

type WizardStep = "sources" | "concept" | "generating" | "result"

export default function MashupPage(): React.ReactElement {
  const [step, setStep] = useState<WizardStep>("sources")
  const [sources, setSources] = useState<MashupSourceInput[]>([])
  const [concept, setConcept] = useState("")
  const [result, setResult] = useState<MashupResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // RFQ state
  const [rfqId, setRfqId] = useState<string | null>(null)
  const [rfqError, setRfqError] = useState<string | null>(null)
  const [isCreatingRfq, startRfqTransition] = useTransition()

  const canProceedFromSources = sources.length >= 2
  const canGenerate = canProceedFromSources && concept.trim().length > 0

  const handleGenerate = async (): Promise<void> => {
    if (!canGenerate) return
    setError(null)
    setStep("generating")
    setResult(null)
    setRfqId(null)
    setRfqError(null)

    try {
      const res = await generateMashup(sources, concept.trim())
      setResult(res)
      if (res.success) {
        setStep("result")
      } else {
        setError(res.error ?? "Generation failed")
        setStep("concept")
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
      setStep("concept")
    }
  }

  const handleReset = (): void => {
    setStep("sources")
    setSources([])
    setConcept("")
    setResult(null)
    setError(null)
    setRfqId(null)
    setRfqError(null)
  }

  /**
   * Creates a marketplace RFQ from the generated mashup artifacts.
   * STEP URL is required; STL is optional but included if present.
   */
  const handleSendToRfq = (): void => {
    if (!result?.step_url) return
    setRfqError(null)

    startRfqTransition(async () => {
      const res = await createMashupRfqAction({
        concept: concept.trim(),
        sources: sources.map((s) => ({
          name: s.name ?? "unnamed",
          description: s.description,
        })),
        stepUrl: result.step_url!,
        stlUrl: result.stl_url ?? null,
        strategy: typeof result.mashup_plan === "object" && result.mashup_plan !== null
          ? (result.mashup_plan as { strategy?: string }).strategy
          : undefined,
      })

      if ("error" in res) {
        setRfqError(res.error)
        toast.error("Failed to create RFQ", { description: res.error })
        return
      }

      setRfqId(res.rfqId)
      toast.success("RFQ created", {
        description: "Your mashup design has been sent to the marketplace.",
      })
    })
  }

  const handleViewRfq = (): void => {
    if (!rfqId) return
    window.open(`/rfq/${rfqId}`, "_blank", "noopener,noreferrer")
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Mashup Lab</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Combine two or more STEP files into a hybrid product — e.g. a radio in a toaster, or an RC car that&apos;s also a drone.
          </p>
        </div>
      </header>

      {step === "sources" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Box className="h-5 w-5" />
              Step 1: Select source STEPs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <MashupSourceSelector
              selected={sources}
              onSelectedChange={setSources}
              maxSources={5}
            />
            <div className="flex justify-end">
              <Button
                onClick={() => setStep("concept")}
                disabled={!canProceedFromSources}
              >
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "concept" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Step 2: Describe your mashup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mashup-concept">What do you want to create?</Label>
              <Textarea
                id="mashup-concept"
                placeholder="e.g. A toaster with a built-in FM radio and speaker grille on the side"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep("sources")}>
                Back
              </Button>
              <Button onClick={handleGenerate} disabled={!canGenerate}>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate mashup
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "generating" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-12 w-12 animate-spin text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-foreground">Generating mashup…</p>
            <p className="text-sm text-muted-foreground mt-1">
              Planning, writing CadQuery, and running on Modal. This may take 1–3 minutes.
            </p>
          </CardContent>
        </Card>
      )}

      {step === "result" && result?.success && (
        <Card>
          <CardHeader>
            <CardTitle className={cn("flex items-center gap-2", "text-status-success")}>
              <CheckCircle2 className="h-5 w-5" />
              Mashup complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 3D preview */}
            {result.stl_b64 && (
              <div className="rounded-lg overflow-hidden border border-border">
                <STLViewer stlData={result.stl_b64} className="min-h-[400px]" />
              </div>
            )}

            {/* Download buttons */}
            <div className="flex flex-wrap gap-2">
              {result.step_url && (
                <Button variant="outline" asChild>
                  <a href={result.step_url} download="mashup.step" target="_blank" rel="noreferrer">
                    <Download className="h-4 w-4 mr-2" />
                    Download STEP
                  </a>
                </Button>
              )}
              {result.stl_url && (
                <Button variant="outline" asChild>
                  <a href={result.stl_url} download="mashup.stl" target="_blank" rel="noreferrer">
                    <Download className="h-4 w-4 mr-2" />
                    Download STL
                  </a>
                </Button>
              )}
            </div>

            {/* Generation time */}
            {result.elapsedMs != null && (
              <p className="text-sm text-muted-foreground">
                Generated in {(result.elapsedMs / 1000).toFixed(1)}s
              </p>
            )}

            {/* RFQ error */}
            {rfqError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{rfqError}</AlertDescription>
              </Alert>
            )}

            {/* Footer actions */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <Button variant="secondary" onClick={handleReset}>
                Start over
              </Button>

              <div className="flex items-center gap-2">
                {rfqId ? (
                  <Button onClick={handleViewRfq} variant="outline">
                    View RFQ
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSendToRfq}
                    disabled={!result.step_url || isCreatingRfq}
                  >
                    {isCreatingRfq ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating RFQ…
                      </>
                    ) : (
                      <>
                        <SendHorizonal className="h-4 w-4 mr-2" />
                        Create Marketplace RFQ
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "concept" && (
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              <strong>Selected sources:</strong> {sources.map((s) => s.name).join(", ")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
