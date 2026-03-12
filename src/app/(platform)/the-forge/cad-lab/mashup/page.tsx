"use client"

/**
 * Mashup Lab -- Combine 2+ STEP files into a hybrid product.
 *
 * @description Two-phase wizard:
 *   (1) Select sources, (2) Describe mashup concept,
 *   (3) Generate -- Phase A: plan (shows strategy + steps ~10-15s),
 *                  Phase B: execute (code gen + Modal + upload ~1-2min),
 *   (4) Preview, download, and send to RFQ.
 *
 * INTENT: Splitting generation into plan + execute lets the UI reveal
 * what the AI is building partway through, turning dead wait time into
 * an engaging "here's the plan" moment.
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
import { HelpTooltip } from "@/components/ui/help-tooltip"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { MashupSourceSelector } from "../components/mashup-source-selector"
import { MashupConceptSearch } from "../components/mashup-concept-search"
import { MashupGenerationProgress } from "../components/mashup-generation-progress"
import { STLViewer } from "@/components/cad/stl-viewer"
import { planMashup, executeMashupPlan } from "@/actions/cad-lab"
import { createMashupRfqAction } from "@/actions/cad-lab-rfq"
import type { MashupSourceInput, MashupPlan, MashupResult } from "@/lib/cad-lab-types"
import { typography } from "@/lib/design-system"
import { cn } from "@/lib/utils"

type WizardStep = "sources" | "concept" | "generating" | "result"

export default function MashupPage(): React.ReactElement {
  const [step, setStep] = useState<WizardStep>("sources")
  const [sources, setSources] = useState<MashupSourceInput[]>([])
  const [concept, setConcept] = useState("")
  const [result, setResult] = useState<MashupResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  const [mashupPlan, setMashupPlan] = useState<MashupPlan | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)

  const [rfqId, setRfqId] = useState<string | null>(null)
  const [rfqError, setRfqError] = useState<string | null>(null)
  const [isCreatingRfq, startRfqTransition] = useTransition()

  const canProceedFromSources = sources.length >= 2
  const canGenerate = canProceedFromSources && concept.trim().length > 0

  /**
   * INTENT: Two-phase generation so the user sees the mashup plan ~10-15s in
   * while the heavier code-gen + Modal execution runs in Phase 2.
   */
  const handleGenerate = async (): Promise<void> => {
    if (!canGenerate || isGenerating) return
    setIsGenerating(true)
    setError(null)
    setStep("generating")
    setResult(null)
    setMashupPlan(null)
    setIsExecuting(false)
    setRfqId(null)
    setRfqError(null)

    try {
      const planResult = await planMashup(sources, concept.trim())

      if (!planResult.success || !planResult.plan || !planResult.resolvedSources) {
        setError(planResult.error ?? "Planning failed")
        setStep("concept")
        setIsGenerating(false)
        return
      }

      setMashupPlan(planResult.plan)
      setIsExecuting(true)

      const res = await executeMashupPlan(
        planResult.resolvedSources,
        planResult.plan,
        concept.trim(),
      )

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
    } finally {
      setIsGenerating(false)
      setIsExecuting(false)
    }
  }

  const handleReset = (): void => {
    setStep("sources")
    setSources([])
    setConcept("")
    setResult(null)
    setError(null)
    setMashupPlan(null)
    setIsExecuting(false)
    setRfqId(null)
    setRfqError(null)
  }

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
    const url = `/rfq/${rfqId}`
    const win = window.open(url, "_blank", "noopener,noreferrer")
    if (!win) {
      toast.info("Popup was blocked — opening in this tab instead")
      window.location.href = url
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={`${typography.h1} inline-flex items-center gap-1.5`}>Mashup Lab <HelpTooltip content="Combine multiple modules into a single assembly. Mashups inherit parameters from their component modules." /></h1>
          </div>
          <p className={typography.pageSubtitle}>
            Combine two or more STEP files into a hybrid product &mdash; e.g. a radio in a toaster, or an RC car that&apos;s also a drone.
          </p>
        </div>
      </header>

      {step === "sources" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-international-orange" />
                Describe what you want to create
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MashupConceptSearch
                onSelect={(aiSources, aiConcept) => {
                  setSources(aiSources)
                  setConcept(aiConcept)
                  setStep("concept")
                }}
              />
            </CardContent>
          </Card>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-3 text-muted-foreground">or build manually</span>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Box className="h-5 w-5" />
                Browse &amp; select STEP files
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <MashupSourceSelector
                selected={sources}
                onSelectedChange={setSources}
                maxSources={5}
              />
              {sources.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Select at least 2 STEP files to combine into a mashup.
                </p>
              )}
              {sources.length === 1 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Select at least 1 more file &mdash; mashups combine 2 or more sources.
                </p>
              )}
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
        </div>
      )}

      {step === "concept" && (
        <>
          <Card className="bg-muted/50">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                <strong>Selected sources:</strong> {sources.map((s) => s.name).join(", ")}
              </p>
            </CardContent>
          </Card>

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
                <Button onClick={handleGenerate} disabled={!canGenerate || isGenerating}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate mashup
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {step === "generating" && (
        <MashupGenerationProgress
          isActive={true}
          concept={concept}
          sources={sources}
          plan={mashupPlan}
          isExecuting={isExecuting}
        />
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
            {result.stl_b64 && (
              <div className="rounded-lg overflow-hidden border border-border">
                <STLViewer stlData={result.stl_b64} className="min-h-[400px]" />
              </div>
            )}

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

            {result.elapsedMs != null && (
              <p className="text-sm text-muted-foreground">
                Generated in {(result.elapsedMs / 1000).toFixed(1)}s
              </p>
            )}

            {rfqError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{rfqError}</AlertDescription>
              </Alert>
            )}

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
                        Creating RFQ&hellip;
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
    </div>
  )
}
