"use client"

/**
 * @file studio-page.tsx — The main Product Studio client component.
 *
 * INTENT: Single vertical scroll page that progressively reveals sections
 * as the user advances through the pipeline. A compact horizontal progress
 * bar sits above the content so sections get the full available width.
 * Flow: Brief -> Research -> Design -> Specs -> Quote.
 */

import { useMemo } from "react"

import { useCadLab } from "../cad-lab/cad-lab-context"
import { StudioProgress } from "./components/studio-progress"
import { BriefSection } from "./sections/brief-section"
import { ResearchSection } from "./sections/research-section"
import { DesignSection } from "./sections/design-section"
import { SpecsSection } from "./sections/specs-section"
import { QuoteSection } from "./sections/quote-section"

export type StudioStage = "brief" | "research" | "design" | "specs" | "quote"

export function StudioPage(): React.ReactNode {
  const { hasResearch, modules, generatedModuleCount } = useCadLab()

  const currentStage = useMemo((): StudioStage => {
    if (generatedModuleCount > 0 && generatedModuleCount === modules.length) return "quote"
    if (generatedModuleCount > 0) return "specs"
    if (modules.length > 0) return "design"
    if (hasResearch) return "research"
    return "brief"
  }, [hasResearch, modules.length, generatedModuleCount])

  return (
    <div className="space-y-8">
      {/* Sticky horizontal progress bar */}
      <div className="sticky top-20 z-10 bg-background/95 backdrop-blur-sm pb-4 -mx-2 px-2">
        <StudioProgress currentStage={currentStage} />
      </div>

      {/* Main content — sections progressively reveal (full width) */}
      <div className="space-y-10">
        <section id="studio-brief">
          <BriefSection />
        </section>

        {hasResearch && (
          <section id="studio-research">
            <ResearchSection />
          </section>
        )}

        {modules.length > 0 && (
          <section id="studio-design">
            <DesignSection />
          </section>
        )}

        {generatedModuleCount > 0 && (
          <section id="studio-specs">
            <SpecsSection />
          </section>
        )}

        {generatedModuleCount > 0 && generatedModuleCount === modules.length && (
          <section id="studio-quote">
            <QuoteSection />
          </section>
        )}
      </div>
    </div>
  )
}
