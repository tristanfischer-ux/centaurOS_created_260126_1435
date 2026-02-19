"use client"

/**
 * @file studio-page.tsx — The main Product Studio client component.
 *
 * INTENT: Single vertical scroll page that progressively reveals sections
 * as the user advances through the pipeline. Replaces the 5-page CAD Lab
 * with one cohesive flow: Brief -> Research -> Design -> Specs -> Quote.
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
    <div className="flex gap-8">
      {/* Sticky vertical progress indicator */}
      <div className="hidden lg:block w-48 flex-shrink-0">
        <div className="sticky top-24">
          <StudioProgress currentStage={currentStage} />
        </div>
      </div>

      {/* Main content — sections progressively reveal */}
      <div className="flex-1 min-w-0 space-y-10">
        {/* 1. Brief — always visible */}
        <section id="studio-brief">
          <BriefSection />
        </section>

        {/* 2. Research — visible after research completes */}
        {hasResearch && (
          <section id="studio-research">
            <ResearchSection />
          </section>
        )}

        {/* 3. Design — visible after modules exist */}
        {modules.length > 0 && (
          <section id="studio-design">
            <DesignSection />
          </section>
        )}

        {/* 4. Specs — visible after at least one module is generated */}
        {generatedModuleCount > 0 && (
          <section id="studio-specs">
            <SpecsSection />
          </section>
        )}

        {/* 5. Quote — visible after all modules generated */}
        {generatedModuleCount > 0 && generatedModuleCount === modules.length && (
          <section id="studio-quote">
            <QuoteSection />
          </section>
        )}
      </div>
    </div>
  )
}
