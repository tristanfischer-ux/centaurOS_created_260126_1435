/**
 * @file illustration-styles.ts — Project-level illustration style registry.
 *
 * @description One style applies to the hero + all per-module images for a
 * project. The choice is stored on `cad_lab_projects.illustration_style` and
 * injected into the reconciliation prompt (so Opus produces style-aware
 * heroImagePrompt + perModuleImagePrompts) AND into the vision-QA rubric
 * (so the scorer doesn't fail photoreal heroes for not being "pure white
 * background thin precise lines").
 *
 * @related
 * - Server action saving the preference: src/actions/cad-lab-projects.ts (saveCadLabIllustrationStyle)
 * - Reconciliation prompt injection: src/actions/cad-lab-images.ts (reconcileDesignAction)
 * - Hero generator + rubric: src/actions/cad-lab-images.ts (generateCadLabSystemIllustrationAction, buildHeroQualityRubric)
 * - UI selector: src/app/(platform)/the-forge/cad-lab/components/illustration-style-selector.tsx
 */

export type IllustrationStyle = "blueprint" | "photoreal" | "isometric_vector"

export const DEFAULT_ILLUSTRATION_STYLE: IllustrationStyle = "blueprint"

/** Metadata for the UI selector. Icons are imported lazily in the component
 *  to avoid pulling `lucide-react` into server-action bundles. */
export interface IllustrationStyleMeta {
  id: IllustrationStyle
  /** Short label shown in the card header. */
  label: string
  /** One-line description shown below the label. Kept tight for card UX. */
  description: string
  /** One-sentence "best for" hint — shown only on hover/expanded. */
  bestFor: string
}

export const ILLUSTRATION_STYLES: readonly IllustrationStyleMeta[] = [
  {
    id: "blueprint",
    label: "Technical blueprint",
    description: "Engineering drawing on white, thin precise lines.",
    bestFor: "Supplier conversations, spec reviews, technical docs.",
  },
  {
    id: "photoreal",
    label: "Photorealistic",
    description: "Studio product render with realistic materials and lighting.",
    bestFor: "Investor decks, marketing, landing-page hero shots.",
  },
  {
    id: "isometric_vector",
    label: "Isometric vector",
    description: "Flat SaaS-landing-page style, bright palette, crisp edges.",
    bestFor: "Public-facing marketing and non-technical audiences.",
  },
] as const

export function isIllustrationStyle(value: unknown): value is IllustrationStyle {
  return value === "blueprint" || value === "photoreal" || value === "isometric_vector"
}

export function getIllustrationStyleMeta(style: IllustrationStyle): IllustrationStyleMeta {
  // Non-null-assertion justified: the type gate above guarantees a match.
  return ILLUSTRATION_STYLES.find((s) => s.id === style)!
}

// ─── Prompt preambles — injected into what Opus sees in reconcileDesignAction ─

/**
 * Style-specific directives appended to the reconciliation user message so
 * that the `heroImagePrompt` and `perModuleImagePrompts` Opus writes are
 * already in the requested style. Placed AFTER the module list + mirror-pair
 * context, so Opus treats it as the terminal visual-style contract.
 */
export function getStyleDirectivesForReconciliation(style: IllustrationStyle): string {
  switch (style) {
    case "blueprint":
      return `

## Illustration Style: Technical Blueprint (DEFAULT)
Every heroImagePrompt and perModuleImagePrompts entry MUST describe a technical engineering illustration:
- Pure white (#FFFFFF) background, subtle engineering grid, thin precise black/dark line work.
- Flat material colours (not photoreal shading). Solid fills, minimal gradients.
- Semi-exploded or exploded-view composition with thin callout leader lines to show assembly.
- 30-degree isometric camera, slightly above-and-right.
- Small shadows acceptable; NO photographic lighting, NO soft focus, NO depth-of-field, NO background scene.
- NO text or labels inside the illustration (image models garble text).`

    case "photoreal":
      return `

## Illustration Style: Photorealistic Studio Render (REQUESTED)
Every heroImagePrompt and perModuleImagePrompts entry MUST describe a photorealistic product render:
- Seamless cyclorama background — light neutral grey or off-white is fine; true white is NOT required.
- Physical materials with convincing microsurface detail: brushed aluminium, anodised finishes, carbon-fibre weave, matte polymer, glass. Specify finish per part.
- Studio lighting: key light + fill + rim. Soft realistic shadows, subtle contact shadows on the ground. Shallow depth-of-field is OPTIONAL.
- Assembled product (not exploded). Full colour. Subtle reflections on metallic/glass surfaces.
- 30-degree 3/4 hero angle. Clean composition with generous negative space.
- NO blueprint lines, NO engineering grid, NO callout arrows, NO text/labels.
- Mirror pairs MUST still share identical material + finish + colour (don't use photorealism as an excuse to distinguish left from right).`

    case "isometric_vector":
      return `

## Illustration Style: Isometric Vector (REQUESTED)
Every heroImagePrompt and perModuleImagePrompts entry MUST describe a flat isometric vector illustration:
- Clean isometric projection (true 30°/30°), no perspective distortion.
- Vibrant flat colours with gentle two-tone shading to imply form (no photorealistic gradients).
- Crisp vector edges; solid fills; minimal linework — suggest detail through shape and colour, not outlines.
- Light pastel or white background. Soft drop shadow beneath the product; no studio lighting.
- Bright, optimistic palette — the SaaS-landing-page aesthetic (Stripe / Vercel / Linear).
- Semi-exploded composition with thin connecting lines is acceptable if it aids comprehension.
- NO photorealistic textures, NO engineering blueprint conventions, NO text/labels.
- Mirror pairs MUST share identical fill colours and vector shape.`
  }
}

// ─── Vision-QA rubric overrides ──────────────────────────────────────────────

/**
 * Returns the base-rubric clauses the vision scorer should OMIT for this
 * style, plus any additional clauses to ADD. The scorer's generic rubric
 * assumes a blueprint-y "pure white background, thin precise lines" render;
 * photoreal and isometric styles legitimately violate those rules.
 */
export function getRubricOverridesForStyle(style: IllustrationStyle): {
  excludeClauses: readonly string[]
  extraClauses: readonly string[]
} {
  switch (style) {
    case "blueprint":
      return { excludeClauses: [], extraClauses: [] }

    case "photoreal":
      return {
        excludeClauses: [
          "pure white background",
          "thin precise lines",
          "flat material colours",
          "engineering grid",
        ],
        extraClauses: [
          "The render should have photorealistic lighting and materials — soft studio shadows, realistic reflections on metallic/glass surfaces, and convincing microsurface detail (brushed / anodised / carbon-fibre).",
          "The background may be a neutral seamless cyclorama (light grey or off-white) — do NOT penalise the render for not having a pure-white background.",
          "Even at photorealistic fidelity, mirror-pair parts MUST share identical material, finish, and colour.",
        ],
      }

    case "isometric_vector":
      return {
        excludeClauses: [
          "thin precise lines",
          "flat material colours",
          "engineering grid",
        ],
        extraClauses: [
          "The render should use flat vector colours with gentle two-tone shading (NOT photorealistic gradients, NOT blueprint linework).",
          "A light pastel or soft white background is expected; do NOT penalise for not being a technical white-on-white blueprint.",
          "Mirror-pair parts MUST use identical fill colours and vector shapes.",
        ],
      }
  }
}
