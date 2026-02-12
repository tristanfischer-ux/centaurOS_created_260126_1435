"use client"

/**
 * @file page.tsx — Hidden CAD Lab for testing CadQuery generation
 *
 * @description Stripped-down page: text input → Gemini 2.5 Pro → Modal → SVGs.
 * Not linked from navigation. Access via /the-forge/cad-lab (behind platform auth).
 * Bakes in all experiment discoveries for maximum model quality.
 */

import { useState, useCallback } from "react"
import { Loader2, Play, Code2, Box, Timer, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

import { generateCadLabModel, GEMINI_MODELS } from "@/actions/cad-lab"

import type { CadLabResult, GeminiModelId } from "@/actions/cad-lab"

export default function CadLabPage(): React.ReactNode {
  const [subject, setSubject] = useState("DJI Mavic Air 2 quadcopter drone")
  const [research, setResearch] = useState(DEFAULT_RESEARCH)
  const [modelId, setModelId] = useState<GeminiModelId>("gemini-2.5-pro")
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<CadLabResult | null>(null)
  const [showCode, setShowCode] = useState(false)

  const handleGenerate = useCallback(async () => {
    setIsRunning(true)
    setResult(null)
    try {
      const res = await generateCadLabModel(subject, research || undefined, modelId)
      setResult(res)
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      })
    } finally {
      setIsRunning(false)
    }
  }, [subject, research, modelId])

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-muted">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 rounded-full bg-international-orange" />
          <h1 className="text-2xl font-bold text-foreground">CAD Lab</h1>
          <span className="text-xs font-mono bg-muted text-muted-foreground px-2 py-1 rounded">
            HIDDEN / DEV ONLY
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Gemini 2.5 Pro → Modal → CadQuery. Two-pass pipeline with 13 strict rules.
        </p>
      </div>

      {/* Input */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., DJI Mavic Air 2 quadcopter drone"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <select
              id="model"
              value={modelId}
              onChange={(e) => setModelId(e.target.value as GeminiModelId)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {GEMINI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="research">
              Research Context{" "}
              <span className="text-muted-foreground font-normal">(real dimensions, components)</span>
            </Label>
            <Textarea
              id="research"
              value={research}
              onChange={(e) => setResearch(e.target.value)}
              className="font-mono text-xs min-h-[200px]"
              placeholder="Paste real-world specs, dimensions, component details..."
            />
          </div>
          <Button onClick={handleGenerate} disabled={isRunning || !subject.trim()}>
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Generating (2-pass, ~3-5 min)...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Generate CAD Model
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Status */}
          {result.error && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <p className="text-sm text-destructive font-mono whitespace-pre-wrap">
                  {result.error}
                </p>
              </CardContent>
            </Card>
          )}

          {/* SVGs */}
          {(result.svgIso || result.svgFront || result.svgTop) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Views</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {result.svgIso && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-mono">Isometric</p>
                      <div className="bg-muted rounded-lg p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={result.svgIso} alt="Isometric view" className="w-full" />
                      </div>
                    </div>
                  )}
                  {result.svgFront && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-mono">Front</p>
                      <div className="bg-muted rounded-lg p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={result.svgFront} alt="Front view" className="w-full" />
                      </div>
                    </div>
                  )}
                  {result.svgTop && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-mono">Top</p>
                      <div className="bg-muted rounded-lg p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={result.svgTop} alt="Top view" className="w-full" />
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {result.bbox && (
                  <Metric
                    icon={<Box className="h-3.5 w-3.5" />}
                    label="Bounding Box"
                    value={`${result.bbox.xLen} × ${result.bbox.yLen} × ${result.bbox.zLen} mm`}
                  />
                )}
                {result.stepSize != null && (
                  <Metric
                    icon={<Box className="h-3.5 w-3.5" />}
                    label="STEP Size"
                    value={result.stepSize > 1024 ? `${(result.stepSize / 1024).toFixed(1)} MB` : `${result.stepSize} KB`}
                  />
                )}
                {result.stlSize != null && (
                  <Metric
                    icon={<Box className="h-3.5 w-3.5" />}
                    label="STL Size"
                    value={result.stlSize > 1024 ? `${(result.stlSize / 1024).toFixed(1)} MB` : `${result.stlSize} KB`}
                  />
                )}
                {result.fillRatio != null && (
                  <Metric label="Fill Ratio" value={`${result.fillRatio}%`} />
                )}
                {result.massGrams != null && (
                  <Metric label="Mass" value={`${result.massGrams} g`} />
                )}
                {result.codeLines != null && (
                  <Metric
                    icon={<Code2 className="h-3.5 w-3.5" />}
                    label="Code Lines"
                    value={`${result.codeLines}`}
                  />
                )}
                {result.modelUsed && (
                  <Metric label="Model" value={result.modelUsed} />
                )}
                {result.generationTime != null && (
                  <Metric
                    icon={<Timer className="h-3.5 w-3.5" />}
                    label="Gemini Time (2-pass)"
                    value={`${(result.generationTime / 1000).toFixed(1)}s`}
                  />
                )}
                {result.modalTime != null && (
                  <Metric
                    icon={<Timer className="h-3.5 w-3.5" />}
                    label="Modal Time"
                    value={`${(result.modalTime / 1000).toFixed(1)}s`}
                  />
                )}
                {result.tokensIn != null && (
                  <Metric label="Tokens In" value={`${result.tokensIn.toLocaleString()}`} />
                )}
                {result.tokensOut != null && (
                  <Metric label="Tokens Out" value={`${result.tokensOut.toLocaleString()}`} />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Code */}
          {result.code && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Code2 className="h-4 w-4" />
                    Generated Code
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowCode(!showCode)}>
                    {showCode ? "Hide" : "Show"}
                  </Button>
                </div>
              </CardHeader>
              {showCode && (
                <CardContent>
                  <pre className="text-xs font-mono bg-muted p-4 rounded-lg overflow-auto max-h-[500px] whitespace-pre-wrap">
                    {result.code}
                  </pre>
                </CardContent>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────

function Metric({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode
  label: string
  value: string
}): React.ReactNode {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-sm font-semibold text-foreground font-mono">{value}</p>
    </div>
  )
}

// ─── Default Research (DJI Mavic Air 2) ──────────────────────────────

const DEFAULT_RESEARCH = `=== DJI MAVIC AIR 2 — REAL SPECIFICATIONS ===

OVERALL DIMENSIONS (folded): 180 × 97 × 84 mm
OVERALL DIMENSIONS (unfolded): 183 × 253 × 77 mm
WEIGHT: 570 g (with battery)

MAIN BODY:
- Dimensions: ~180 × 85 × 48 mm (central fuselage)
- Material: ABS + PC composite, wall thickness 1.8mm
- Front: camera gimbal mount, obstacle avoidance sensors
- Rear: battery bay (~110 × 63 × 30 mm), exhaust vents
- Top: GPS module dome, status LED array
- Bottom: vision positioning sensors (2x), ultrasonic sensor, battery latch

ARMS (4x):
- Front arms fold forward, rear arms fold backward
- Arm dimensions: ~100 × 22 × 15 mm each
- Arm cross-section: oval/rectangular with rounded edges
- Front arm offset: ~±65mm from center X, ~45mm forward of body center
- Rear arm offset: ~±65mm from center X, ~55mm rearward of body center

PROPULSION (4x):
- Motor: brushless, 15mm diameter × 12mm height
- Motor mount: circular platform ~30mm diameter, 5mm thick
- Propeller: 7.4" (188mm) diameter, 2-blade folding
- Motor-to-motor diagonal: ~302mm (12 inch class)

CAMERA/GIMBAL (front):
- 3-axis stabilized gimbal
- Camera housing: ~25 × 20 × 20 mm
- Gimbal base: ~35 × 30 × 15 mm
- Lens diameter: ~12mm
- Position: front-center of body, bottom-mounted

BATTERY (rear):
- Dimensions: ~110 × 63 × 30 mm
- Weight: ~198g
- Capacity: 3500 mAh, 11.55V (3S LiPo)
- Slides in from rear

GPS MODULE (top):
- Dome shape: ~25mm diameter, 10mm height
- Position: top-center, slightly rearward

LANDING GEAR:
- Integrated into bottom of body
- Rubber feet/pads at corners
- Ground clearance: ~25mm`
