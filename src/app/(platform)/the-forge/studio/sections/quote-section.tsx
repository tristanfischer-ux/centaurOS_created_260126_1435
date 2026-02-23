"use client"

/**
 * @file quote-section.tsx — Section 5: Get Quotes.
 *
 * INTENT: Final section that brings together the review package,
 * drawing package, expert recommendations, and the RFQ creation flow.
 * This is the payoff — the user can send their engineering package
 * directly to marketplace suppliers.
 *
 * DECISION: Reuses CadLabContracting (the RFQ builder), CadLabReviewPackage,
 * CadLabDrawingPackage, and CadLabPeople components directly from the
 * existing Review and Procurement pages.
 */

import {
  Send,
  CheckCircle2,
  FileDown,
  Users,
  Package,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CadLabReviewPackage } from "@/components/cad/cad-lab-review-package"
import { CadLabDrawingPackage } from "@/components/cad/cad-lab-drawing-package"
import { CadLabPeople } from "@/components/cad/cad-lab-people"
import { CadLabContracting } from "@/components/cad/cad-lab-contracting"

import { useCadLab } from "../../cad-lab/cad-lab-context"

export function QuoteSection(): React.ReactNode {
  const {
    modules,
    subject,
    editableReport,
    diagnosticAnswers,
    activeProjectId,
    linkedRfqId,
    linkRfqToProject,
    designBrief,
    assumptionNotes,
  } = useCadLab()

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-international-orange text-white text-xs font-bold">
            5
          </div>
          <h2 className="text-lg font-semibold text-foreground">Get Quotes</h2>
        </div>
        <p className="text-sm text-muted-foreground ml-9">
          Your engineering package is ready. Review it below and send an RFQ to marketplace suppliers.
        </p>
      </div>

      {/* Pipeline complete banner */}
      <Card className="border-status-success/30 bg-gradient-to-r from-status-success-light/20 to-background">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-success-light">
              <CheckCircle2 className="h-5 w-5 text-status-success" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                All {modules.length} modules generated
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your engineering package for &quot;{subject}&quot; is ready. Send it to suppliers or download files.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Review Package */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Review Package
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CadLabReviewPackage
            modules={modules}
            projectName={subject}
            researchReport={editableReport}
            diagnosticAnswers={diagnosticAnswers}
          />
        </CardContent>
      </Card>

      {/* Drawing Package */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileDown className="h-4 w-4" />
            Drawing Package
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CadLabDrawingPackage modules={modules} projectName={subject} diagnosticAnswers={diagnosticAnswers} />
        </CardContent>
      </Card>

      {/* Expert Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Recommended Experts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CadLabPeople modules={modules} diagnosticAnswers={diagnosticAnswers} />
        </CardContent>
      </Card>

      {/* RFQ Creation (send to marketplace) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4" />
            Request for Quote
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Package your design and send it to marketplace suppliers for quotes.
          </p>
        </CardHeader>
        <CardContent>
          <CadLabContracting
            modules={modules}
            projectName={subject}
            diagnosticAnswers={diagnosticAnswers}
            projectId={activeProjectId}
            linkedRfqId={linkedRfqId}
            onRfqLinked={linkRfqToProject}
            designBrief={designBrief}
            assumptionNotes={assumptionNotes}
          />
        </CardContent>
      </Card>
    </div>
  )
}
