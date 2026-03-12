"use client"

/**
 * @file integration-view.tsx
 *
 * @description Integration sub-step: combine all module STEPs into a single
 * system assembly. Shows "Generate integrated assembly" and side-by-side
 * reference model vs generated assembly when available.
 */

import { Loader2, Layers, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ReferenceModelViewer } from "./reference-model-viewer"
import type { ReferenceModel } from "@/actions/reference-models"

interface IntegrationViewProps {
  /** All modules have generated CAD */
  allModulesGenerated: boolean
  /** Reference model for left side of comparison */
  referenceModel: ReferenceModel | null
  /** Integrated assembly STL URL (after generation) */
  integratedAssemblyStlUrl: string | null
  /** Whether integration is in progress */
  isIntegrating: boolean
  /** Trigger integration step */
  onGenerateIntegration: () => Promise<void>
  /** Last error from integration (e.g. "Not yet implemented") */
  integrationError: string | null
  onClearError?: () => void
  /** CadQuery Python code generated for the assembly (for debugging) */
  assemblyCode?: string | null
}

/**
 * Shown when all modules are generated. Offers "Generate integrated assembly"
 * and side-by-side reference vs assembly when integration has run.
 */
export function IntegrationView({
  allModulesGenerated,
  referenceModel,
  integratedAssemblyStlUrl,
  isIntegrating,
  onGenerateIntegration,
  integrationError,
  onClearError,
  assemblyCode,
}: IntegrationViewProps): React.ReactNode {
  if (!allModulesGenerated) return null

  return (
    <Card className="border-international-orange/20">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" />
          System integration
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Combine all modules into a single assembly. Compare to the reference model below.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!integratedAssemblyStlUrl ? (
          <>
            <Button
              onClick={onGenerateIntegration}
              disabled={isIntegrating}
              className="gap-2"
            >
              {isIntegrating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating assembly...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Generate integrated assembly
                </>
              )}
            </Button>
            {integrationError && (
              <p className="text-sm text-muted-foreground rounded-md bg-muted/50 p-3">
                {integrationError}
              </p>
            )}
            {integrationError && assemblyCode && (
              <details className="mt-2">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  View generated code
                </summary>
                <pre className="mt-2 text-xs bg-muted rounded-md p-3 overflow-x-auto max-h-64 overflow-y-auto">
                  <code>{assemblyCode}</code>
                </pre>
              </details>
            )}
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Reference model</p>
              <ReferenceModelViewer stlUrl={referenceModel?.stlUrl ?? null} minHeight={200} />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Generated assembly</p>
              <ReferenceModelViewer stlUrl={integratedAssemblyStlUrl} minHeight={200} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
