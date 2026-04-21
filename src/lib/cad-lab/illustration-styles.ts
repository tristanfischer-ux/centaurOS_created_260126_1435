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

export type IllustrationStyle = "blueprint" | "photoreal" | "isometric_vector" | "photography"

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
  {
    id: "photography",
    label: "Editorial photography",
    description: "Lifestyle product photography with real-world context and atmosphere.",
    bestFor: "Press assets, brand campaigns, social share cards.",
  },
] as const

export function isIllustrationStyle(value: unknown): value is IllustrationStyle {
  return (
    value === "blueprint" ||
    value === "photoreal" ||
    value === "isometric_vector" ||
    value === "photography"
  )
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

    case "photography":
      return `

## Illustration Style: Editorial Photography (REQUESTED)
Every heroImagePrompt and perModuleImagePrompts entry MUST describe a real-world editorial photograph:
- Lifestyle context — product in-situ on a real surface (desk, workbench, studio floor, field location matching the product's deployment environment). NOT a blank cyclorama.
- Natural or naturalistic lighting — soft window light, overcast diffused outdoor, or warm tungsten editorial. Realistic shadows. Avoid cold studio flash feel.
- Photorealistic materials: convincing microsurface, dust, wear, real metal reflections, realistic plastic sheen. Surfaces should look touched, not perfect.
- Shallow depth-of-field is encouraged — subject crisp, background gently falling off. Magazine editorial framing.
- Hero composition follows the rule of thirds. Generous negative space for press crops.
- Full colour, human-scale atmosphere — the image should feel publishable on a brand website or in a print magazine.
- NO blueprint lines, NO engineering grid, NO exploded-view callouts, NO text/labels inside the image.
- Mirror pairs MUST still share identical material + finish + colour.`
  }
}

// ─── Module + hero prompt preamble (shared across BOTH image-gen paths) ─────

/**
 * Short style preamble prepended to BOTH the system-illustration ("cover")
 * prompt and every per-module blueprint prompt, so a project on `blueprint`
 * renders the hero AND all its module cards in the same visual language.
 *
 * V1 historically hit this via `reconcileDesignAction` — Opus crafted a
 * `heroImagePrompt` + `perModuleImagePrompts` that all committed to the
 * same style internally. V2 never runs reconciliation, so both surfaces
 * fell back to their own programmatic prompts and drifted apart — the
 * hero came out iso-illustrative, the modules came out thin-line
 * blueprint, and founders saw "two different projects" in the PDF.
 *
 * This preamble is the minimum shared contract: prepended verbatim at the
 * TOP of the final prompt string (image models weight the start most
 * heavily) so every caller — V1 or V2, hero or module — ships with a
 * consistent style framing. The existing prompt bodies still run
 * underneath; this layer just ensures the style line the model reads
 * first matches across surfaces.
 *
 * @param style - The project's `illustration_style` column value.
 * @returns A ~3-5 line style preamble. Ends with two newlines so the
 *   existing prompt body starts on a fresh paragraph.
 */
export function getStylePreambleForModulePrompt(style: IllustrationStyle): string {
  switch (style) {
    case "blueprint":
      // Tight spec — hex palette, pixel line weights, fill rule,
      // composition lock. Each constraint removes one common Gemini
      // drift pattern: palette stops the cover's green racks / orange
      // HVAC diverging from a module's blue+yellow; line-weight stops
      // cutaway-heavy renders; "assembled, not cutaway" stops
      // cross-section vs exterior drift.
      return `PROJECT ILLUSTRATION STYLE: Technical engineering blueprint. Every illustration in this project — hero and per-module — MUST match the following spec exactly. Drift between cover and module renders makes the design pack read as "stitched together from different projects", which is the single thing we are preventing here.

PALETTE (use these exact hex values, no others):
- Background: pure white #FFFFFF
- Main structural edges: near-black #1A1F26
- Engineering grid: very light grey #EAEDF1
- Structural steel / chassis: slate blue #6B8FB5
- Aluminium / extrusion profiles: cool grey-blue #8FA5B8
- Plastics / HDPE / moulded polymer: off-white #F5F6F8 with #1A1F26 outline
- Plant material / organics: muted green #7FAF5A
- Water / fluid lines: steel blue #3A7BAF
- Electrical / control boxes: warm ochre #D18B2A
- Warning / hot paths / refrigerant: muted red #C85C4E

LINE WEIGHT: ~2-pixel uniform stroke on main edges at #1A1F26. Grid at 1-pixel #EAEDF1. No anti-aliasing halos, no soft glow, no bloom.

FILL RULE: Flat solid colour per material class (palette above). NO gradients, NO two-tone shading, NO ambient-occlusion darkening, NO specular highlights. Single solid fill per surface.

COMPOSITION: 30-degree isometric camera, slightly above-and-right. Assembled view — full module visible from outside. NO cutaways, NO cross-sections, NO interior-view cuts, NO pipes/cables disappearing into other modules. NO exploded views unless the prompt explicitly asks for one.

NEGATIVE (banned): 3D photorealistic rendering; architectural drafting hatching; watercolour or ink-wash effects; vignette; drop shadows under the subject; perspective distortion; fisheye; atmospheric fog; background scenery; text, labels, callouts, annotations, title blocks, revision tags.

`
    case "photoreal":
      return `PROJECT ILLUSTRATION STYLE: Photorealistic studio render. Every illustration in this project — hero and per-module — MUST render as a photorealistic product render on a seamless cyclorama (light neutral grey or off-white), with physically-correct materials (brushed aluminium, anodised finishes, matte polymer, glass), studio lighting (key + fill + rim), subtle contact shadows, and a 30-degree 3/4 hero angle. No blueprint linework, no engineering grid, no callout arrows.

`
    case "isometric_vector":
      return `PROJECT ILLUSTRATION STYLE: Isometric vector. Every illustration in this project — hero and per-module — MUST render as a flat isometric vector illustration (true 30°/30°), vibrant flat colours with gentle two-tone shading, crisp vector edges, on a light pastel or white background with a soft drop shadow. SaaS-landing-page aesthetic. No photorealistic textures, no engineering blueprint conventions.

`
    case "photography":
      return `PROJECT ILLUSTRATION STYLE: Editorial photography. Every illustration in this project — hero and per-module — MUST render as a real-world editorial photograph with lifestyle context, naturalistic lighting, convincing microsurface detail, shallow depth-of-field, and rule-of-thirds framing. No blueprint linework, no exploded-view callouts, no cyclorama.

`
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

    case "photography":
      return {
        excludeClauses: [
          "pure white background",
          "thin precise lines",
          "flat material colours",
          "engineering grid",
          "cyclorama background",
        ],
        extraClauses: [
          "The photograph should feel editorial — natural or naturalistic lighting, real-world environmental context (desk, workbench, outdoor scene), and shallow depth-of-field are all desirable.",
          "Convincing real-world materials (touched metal, worn plastic, dust, fingerprints on glass) are acceptable and expected — the goal is a publishable brand photograph, not a sterile product render.",
          "Even in a lifestyle composition, mirror-pair parts MUST share identical material, finish, and colour.",
        ],
      }
  }
}
