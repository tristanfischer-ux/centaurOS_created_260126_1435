/**
 * @file audience-context.ts — Audience-specific prompt steering for the
 * two-phase Design Journey Report pipeline.
 *
 * @description The Opus Phase 1 outliner and the Gemini Phase 2 section
 * writer share structural rules (layouts, JSON schema, slide types) but
 * diverge on register, section priority, and emphasis. Each audience
 * contributes:
 *   1. `getAudienceOpusContext()` — prepended to the Phase 1 system prompt,
 *      steering which sections Opus must include, their order, and the
 *      "why" the reader is opening this document.
 *   2. `getAudienceGeminiTone()` — prepended to the Phase 2 writer system
 *      prompt, controlling voice, sentence length, and vocabulary.
 *   3. `getAudienceImagePromptSuffix()` — appended to each Nano Banana 2
 *      imagePrompt in Phase 2.5 so the per-slide illustrations match the
 *      audience's preferred illustration style.
 *
 * @related
 * - src/actions/cad-lab-report.ts — pipeline consumer
 * - src/lib/cad-lab/audience.ts — ReportAudience type + preferred illustration style
 */

import type { ReportAudience } from '@/lib/cad-lab/audience'
import { AUDIENCE_META } from '@/lib/cad-lab/audience'

// ─── Phase 1 — Opus outliner context per audience ───────────────────

const INVESTOR_OPUS_CONTEXT = `## Audience: Investor / Executive reader

The reader is a venture investor, board member, or executive sponsor. They are deciding whether to fund, approve, or champion this product. Reading time is scarce; they want conviction fast.

- Lead with ONE hero-cover slide, then an executive-summary section framed as the investment thesis (problem → solution → why-now → why-us).
- Include a stat-callouts section early with 3-5 big numbers (module count, mass/cost targets, lead time, standards coverage, addressable market if inferable).
- Use comparison-two-col for "Legacy approach vs Our approach" where the research report supports it.
- Module sections should collapse into ONE architecture-diagram overview (not one slide per module); put module-detail slides only for the 2-3 most strategically important modules.
- Include a quadrant-chart for risk/opportunity framing if risks are identifiable from specialist reviews or assumptions.
- Close with a summary/conclusions section that names the next decision point (what a "yes" unlocks).
- De-emphasise: low-level spec tables, diagnostic answers, every individual supplier match.
- Tone cue: confident, evidence-based, outcome-focused. Every claim should carry a number or a concrete fact.`

const ENGINEER_OPUS_CONTEXT = `## Audience: Engineer / Technical reviewer

The reader is a principal/staff engineer, systems architect, or technical reviewer evaluating buildability. They want density, traceability, and zero spin. They will quote this document in design reviews.

- Cover slide is minimal; jump straight into product-overview + module-overview within the first three sections.
- Include a module-detail section for EVERY module with a data-table layout (process, material, tolerance, finish, mass, lead time, failure modes).
- Include a dedicated specifications section with diagnostic answers in a single consolidated data-table.
- Include an engineering-standards section if ENGINEERING STANDARDS REFERENCED data exists — cite codes, issuing bodies, and which modules they apply to.
- Include a cost-analysis section with per-module £/unit in a data-table, and flag any confidence=low estimates explicitly.
- Include a specialist-reviews section when moduleReviews are present — surface every warn/fail verdict.
- Include a cad-output section if unifiedCadResult is present — mass, volume, bbox, model.
- De-emphasise: marketing framing, investor-style "why-now" prose, press-kit hero imagery.
- Tone cue: terse, precise, unambiguous. Prefer numbers to adjectives. Never embellish.`

const SUPPLIER_OPUS_CONTEXT = `## Audience: Supplier / Procurement reader

The reader is a contract manufacturer, procurement specialist, or supplier quoting on this work. They want a quote-ready pack — quantities, tolerances, materials, processes, lead times, and part classification.

- Cover with a brief product-overview section (what this is, how it's used) — no marketing prose.
- Lead with a part-classification section up front (classifiedParts) — buy vs make with confidence and reasons.
- Include a comprehensive specifications data-table per module: process, material, tolerance, finish, batch size, lead time.
- Include a supplier-analysis section surfacing matched suppliers per module with match reasons (supplierMatches, techniqueRecommendations).
- Include a rfqQuotes-based section when quotes already exist — present as a comparison data-table.
- Include an assembly-logistics section if assemblyPartners are present (partner name, score, reasons, branding/shipping notes).
- Include an engineering-standards section if standards exist — suppliers need to know the compliance bar they are quoting against.
- De-emphasise: narrative prose, marketing framing, investor-style risk framing, exploded architecture diagrams.
- Tone cue: procurement-focused, unambiguous about quantities and tolerances, calls out ambiguity rather than hiding it.`

const MARKETING_OPUS_CONTEXT = `## Audience: Marketing press asset

The reader is a journalist, blogger, website visitor, or social-media audience encountering this product for the first time. The goal is a shareable, editorial document that tells the story of this product without buzzwords.

- Open with a hero-cover slide using glossy editorial imagery — this is the single most important slide in the document.
- Follow with a value-props or stat-callouts section summarising "what it is, who it's for, why it matters" in 3-5 short cards.
- Use comparison-two-col sparingly and only when it tells a clear "before / after" or "what you had / what's new" story.
- Include a product-overview section with a one-paragraph narrative framing — NOT spec-sheet prose.
- Include an architecture-diagram section with an editorial illustration and short annotations.
- At most two module-detail slides, only for the user-visible / flagship modules.
- Close with a one-slide summary covering what the product unlocks for its user.
- De-emphasise: diagnostic answers, supplier names, cost breakdowns, tolerance tables, specialist review verdicts, CAD mass/volume numbers, engineering standards lists.
- Tone cue: editorial magazine voice — vivid, concrete, human-centred. British English. Never markety buzzwords. Never mention AI, specialists, or internal process. Write for someone who has never heard of this product.`

const AUDIENCE_OPUS_CONTEXT: Record<ReportAudience, string> = {
  investor: INVESTOR_OPUS_CONTEXT,
  engineer: ENGINEER_OPUS_CONTEXT,
  supplier: SUPPLIER_OPUS_CONTEXT,
  marketing: MARKETING_OPUS_CONTEXT,
}

export function getAudienceOpusContext(audience: ReportAudience): string {
  return AUDIENCE_OPUS_CONTEXT[audience]
}

// ─── Phase 2 — Gemini writer tone per audience ──────────────────────

const INVESTOR_WRITER_TONE = `## Writing register

You are writing for a venture investor or executive. Each paragraph must earn its place. Lead sentences carry the claim; supporting sentences carry the evidence. Prefer specifics to adjectives ("£28,678 per unit" beats "cost-effective"). British English. Avoid hedging ("may", "could", "potentially") unless the source data itself is uncertain. Never use "our" or "we" in this document — third-person throughout.`

const ENGINEER_WRITER_TONE = `## Writing register

You are writing for a senior hardware engineer. Be terse and technical. Name materials by grade, processes by industry-standard term, tolerances by number. No marketing framing. No hedging. If the data flags a low-confidence estimate, say so explicitly. Prefer the passive voice when it shortens a sentence. British English. Never explain basic engineering concepts — the reader already knows them.`

const SUPPLIER_WRITER_TONE = `## Writing register

You are writing a quote-ready brief for a supplier or procurement partner. Every paragraph should make the reader more certain about what they're being asked to quote. Name quantities, tolerances, finishes, and deadlines explicitly. When ambiguity exists in the source data, call it out in one sentence so the supplier knows to seek clarification rather than price padding. British English. Avoid investor- or marketing-style language.`

const MARKETING_WRITER_TONE = `## Writing register

You are writing an editorial piece for a press or brand publication. Voice is warm, grounded, human-centred. Use specific sensory detail from the product's deployment context. Short sentences. Concrete nouns over abstract ones. No buzzwords ("innovative", "cutting-edge", "revolutionary", "leverage", "synergy", "AI-powered"). Never mention internal process, AI, specialists, or the fact that this is an AI-generated report. British English. Never use exclamation marks. Write as if this piece will be read aloud on a podcast.`

const AUDIENCE_WRITER_TONE: Record<ReportAudience, string> = {
  investor: INVESTOR_WRITER_TONE,
  engineer: ENGINEER_WRITER_TONE,
  supplier: SUPPLIER_WRITER_TONE,
  marketing: MARKETING_WRITER_TONE,
}

export function getAudienceGeminiTone(audience: ReportAudience): string {
  return AUDIENCE_WRITER_TONE[audience]
}

// ─── Phase 2.5 — Image prompt style suffix per audience ─────────────

/** Appended to every imagePrompt when generating per-slide illustrations.
 *  Aligns the visual output with the audience's preferred illustration
 *  style (see AUDIENCE_META.preferredIllustrationStyle). */
export function getAudienceImagePromptSuffix(audience: ReportAudience): string {
  const style = AUDIENCE_META[audience].preferredIllustrationStyle
  switch (style) {
    case 'photoreal':
      return "\n\nSTYLE OVERRIDE: Render as a photorealistic studio product render. Seamless cyclorama background (light grey or off-white), photorealistic materials (brushed aluminium, anodised, matte polymer, glass), soft studio lighting with contact shadows, 30-degree 3/4 hero angle. Assembled product — no exploded view. Absolutely no blueprint lines, no engineering grid, no callout arrows. NO text, letters, words, labels, or annotations."
    case 'blueprint':
      return "\n\nSTYLE OVERRIDE: Render as a technical engineering blueprint illustration. Pure white (#FFFFFF) background, subtle engineering grid, thin precise black line work, flat material colours. 30-degree isometric camera. Small shadows acceptable. NO photographic lighting, NO depth-of-field, NO background scene. NO text, letters, words, labels, or annotations."
    case 'isometric_vector':
      return "\n\nSTYLE OVERRIDE: Render as a flat isometric vector illustration in a modern SaaS aesthetic (Stripe / Vercel / Linear). True 30°/30° projection, no perspective distortion. Vibrant flat colours with gentle two-tone shading. Light pastel background with a soft drop shadow. NO photorealistic textures, NO blueprint linework. NO text, letters, words, labels, or annotations."
    case 'photography':
      return "\n\nSTYLE OVERRIDE: Render as an editorial lifestyle photograph — magazine-ready. Product in-situ on a real surface (desk, workbench, laboratory, outdoor field) matching its deployment context. Natural or naturalistic lighting (window light, overcast, warm tungsten). Shallow depth-of-field. Realistic wear and surface detail. Composition follows the rule of thirds with negative space for press crops. NO blueprint lines, NO engineering grid, NO callout arrows, NO text, letters, words, labels, or annotations."
  }
}
