"use server"

/**
 * @file cad-grammar-research.ts — Dynamic grammar creation via AI research.
 *
 * @description When no existing grammar matches a user's product description,
 * this module researches the domain via web search and AI analysis, then
 * generates a new grammar following the GRAMMAR_AUTHORING.md template.
 * The new grammar is validated and stored in Supabase for future use.
 *
 * Pipeline:
 *   1. Research the domain (web search + synthesis)
 *   2. Generate grammar code from template
 *   3. Validate grammar structure (static checks)
 *   4. Store in Supabase as source="researched"
 *
 * @security Server-side only. Grammar code is validated before storage.
 * @audit Logs grammar creation events.
 */

import { createClient } from "@/lib/supabase/server"
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { callOpenAI } from "@/lib/cad-lab/api-helpers"
import { fetchWithTimeout } from "@/lib/fetch-with-timeout"

// ─── Types ──────────────────────────────────────────────────────────

export interface GrammarResearchResult {
  success: boolean
  error?: string
  /** Name of the newly created grammar */
  grammarName?: string
  /** Display name */
  displayName?: string
  /** Research findings summary */
  researchSummary?: string
  /** Number of parameters in the grammar */
  paramCount?: number
  /** Tokens used */
  tokensIn: number
  tokensOut: number
}

// ─── AI Call (OpenAI — gpt-5.4 for research synthesis) ──────────────

async function callResearchAI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 16384,
): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  return callOpenAI(systemPrompt, userPrompt, "gpt-5.4", maxTokens, 280_000)
}

// ─── Grammar Template ───────────────────────────────────────────────

const GRAMMAR_TEMPLATE = `You are an expert parametric CAD engineer creating a domain grammar for ForgeOS.

A domain grammar encodes how experienced engineers design a specific class of product. It uses a 3-level pipeline:
1. Parameters (user-facing, validated)
2. derive_skeleton() — pure math, derives ALL dimensions
3. build() — CadQuery geometry from skeleton dict

RULES:
- All dimensions in millimetres
- derive_skeleton() must be PURE MATH — no cadquery, no geometry, no file I/O
- build() reads ONLY from skeleton dict, names every part, sets colours
- Every ParamSpec must have type, unit, description, default, and min/max where applicable
- Use cq.Assembly for multi-part models
- Name every part: name="PartName"
- Set colour on every part: color=cq.Color(r, g, b) where r,g,b are 0-1 float
- Return cq.Assembly from build(), not Workplane

STRUCTURE (must follow exactly):
\`\`\`python
"""
ForgeOS [Domain] Grammar — [Description]
"""
import math
from typing import Any, Dict, List, Tuple
import cadquery as cq

# Geometry primitives (each returns cq.Workplane)
def _build_xxx(...):
    ...

class [Name]Grammar(DomainGrammar):
    @property
    def name(self): return "grammar_name"
    @property
    def display_name(self): return "Display Name"
    @property
    def description(self): return "One line description"

    def param_specs(self):
        return [
            ParamSpec("param_name", "float", "mm", "Description", default, min, max),
            ...
        ]

    def defaults(self):
        return { "param_name": value, ... }

    def constraints(self):
        return [
            Constraint("name", "description", lambda s: (bool, msg), severity="error"),
        ]

    def derive_skeleton(self, params):
        s = dict(params)
        # Pure math derivations
        return s

    def build(self, skeleton):
        s = skeleton
        assy = cq.Assembly(name="ForgeOS_ProductName")
        # Build parts, position with Location, name everything
        return assy
\`\`\`

IMPORTANT:
- Do NOT include "from core.grammar import ..." — the core library is loaded separately
- DomainGrammar, ParamSpec, Constraint, ValidationResult are available as globals
- Use proven CadQuery patterns: box, cylinder, polyline+extrude, cut (boolean subtract)
- Avoid complex operations like loft, sweep, revolve unless necessary
- Test in your head: would this actually produce a valid 3D model?

Respond with ONLY the Python code (no markdown fences, no explanation before or after).`

// ─── Main Research + Create Flow ────────────────────────────────────

/**
 * Researches a product domain and creates a new grammar.
 *
 * @description When no existing grammar matches, this function:
 *   1. Uses Claude to research the domain's engineering principles
 *   2. Generates grammar code following the ForgeOS template
 *   3. Validates the grammar structure
 *   4. Stores it in Supabase for future use
 *
 * @param productDescription - What the user wants to design
 * @param domainHint - Optional domain name hint (e.g. "smartphone", "bicycle")
 * @returns Result with new grammar name or error
 *
 * @security Requires authenticated user. Grammar code is validated.
 * @audit Logs grammar creation.
 */
export async function researchAndCreateGrammar(
  productDescription: string,
  domainHint?: string,
): Promise<GrammarResearchResult> {
  let totalTokensIn = 0
  let totalTokensOut = 0

  try {
    // AUTH: Verify authenticated user
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: "Authentication required", tokensIn: 0, tokensOut: 0 }
    }

    // SECURITY: Rate limit AI calls
    const rateLimitError = await checkRateLimit('aiGrammar', user.id)
    if (rateLimitError) {
      return { success: false, error: rateLimitError, tokensIn: 0, tokensOut: 0 }
    }

    // ── Step 1: Research the domain ──
    console.info("[CAD-GRAMMAR-RESEARCH] Step 1: Researching domain...")

    const domain = domainHint ?? productDescription.split(" ").slice(0, 3).join("_").toLowerCase()

    const researchPrompt = `Research the engineering principles for designing a "${productDescription}".

I need to create a parametric CAD grammar that can generate 3D models of this product category. Tell me:

1. **Key parameters** that define the design (with typical ranges and units in mm)
2. **Engineering constraints** (structural limits, manufacturing tolerances, safety standards)
3. **Common sub-components** (what parts make up the assembly?)
4. **Standard dimensions** for a typical/default version
5. **Geometry approach** (what CadQuery operations would work best?)
6. **Industry standards** or references to follow

Be specific with dimensions and ranges. Focus on what a parametric model needs.`

    const { text: researchText, tokensIn: rIn, tokensOut: rOut } = await callResearchAI(
      "You are a senior mechanical engineer. Provide precise engineering specifications.",
      researchPrompt,
      4096,
    )
    totalTokensIn += rIn
    totalTokensOut += rOut

    // ── Step 2: Generate grammar code ──
    console.info("[CAD-GRAMMAR-RESEARCH] Step 2: Generating grammar code...")

    const grammarName = domain.replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").slice(0, 30)
    const displayName = productDescription
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
      .slice(0, 50)

    const generatePrompt = `Based on this engineering research, create a ForgeOS domain grammar:

DOMAIN: ${grammarName}
DISPLAY NAME: ${displayName}
PRODUCT: ${productDescription}

ENGINEERING RESEARCH:
${researchText}

Generate the complete Python grammar code. The grammar class name should be ${grammarName.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join("")}Grammar.

Requirements:
- Include at least 6 parameters with sensible defaults
- Include at least 2 constraints
- derive_skeleton() must compute all derived dimensions
- build() must create a multi-part cq.Assembly with at least 3 named parts
- Use realistic default values from the research
- Grammar name must be "${grammarName}"

Output ONLY the Python code.`

    const { text: grammarCode, tokensIn: gIn, tokensOut: gOut } = await callResearchAI(
      GRAMMAR_TEMPLATE,
      generatePrompt,
      16384,
    )
    totalTokensIn += gIn
    totalTokensOut += gOut

    // Clean up the code (remove markdown fences if present)
    let cleanCode = grammarCode.trim()
    if (cleanCode.startsWith("```python")) {
      cleanCode = cleanCode.replace(/^```python\n?/, "").replace(/\n?```$/, "")
    } else if (cleanCode.startsWith("```")) {
      cleanCode = cleanCode.replace(/^```\n?/, "").replace(/\n?```$/, "")
    }

    // ── Step 3: Validate grammar structure ──
    console.info("[CAD-GRAMMAR-RESEARCH] Step 3: Validating grammar...")

    const validationErrors = validateGrammarCode(cleanCode, grammarName)
    if (validationErrors.length > 0) {
      console.warn("[CAD-GRAMMAR-RESEARCH] Validation errors:", validationErrors)
      return {
        success: false,
        error: `Grammar validation failed: ${validationErrors.join("; ")}`,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
      }
    }

    // ── Step 4: Generate metadata ──
    const { text: metadataText, tokensIn: mIn, tokensOut: mOut } = await callResearchAI(
      `Extract metadata from this grammar code. Return ONLY a JSON object:
{
  "domain_keywords": ["keyword1", "keyword2", ...],
  "example_prompts": ["Design a ...", "Build a ...", ...],
  "param_specs_json": [...],
  "defaults_json": {...},
  "constraints_summary": "Brief description of constraints"
}`,
      `Grammar name: ${grammarName}\nProduct: ${productDescription}\n\nCode:\n${cleanCode.slice(0, 3000)}`,
      4096,
    )
    totalTokensIn += mIn
    totalTokensOut += mOut

    let metadata: {
      domain_keywords: string[]
      example_prompts: string[]
      param_specs_json: unknown[]
      defaults_json: Record<string, unknown>
      constraints_summary: string
    }

    try {
      const jsonStr = metadataText.replace(/```json?\n?/g, "").replace(/```/g, "").trim()
      metadata = JSON.parse(jsonStr)
    } catch {
      // Fallback metadata
      metadata = {
        domain_keywords: [grammarName, ...productDescription.toLowerCase().split(" ").filter((w) => w.length > 3)],
        example_prompts: [`Design a ${productDescription}`, `Build a ${displayName}`],
        param_specs_json: [],
        defaults_json: {},
        constraints_summary: "See grammar code for constraints",
      }
    }

    // ── Step 4b: Fetch core library for Modal validation ──
    const { data: coreRow } = await supabase
      .from("cad_grammars")
      .select("python_code")
      .eq("name", "__core_library__")
      .eq("is_active", true)
      .single()

    const coreLibraryCode = coreRow?.python_code ?? ""
    if (!coreLibraryCode) {
      return {
        success: false,
        error: "No core library available in database. Cannot validate grammar on Modal.",
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
      }
    }

    // ── Step 4c: Validate grammar executes on Modal ──
    console.info("[CAD-GRAMMAR-RESEARCH] Step 4c: Validating grammar on Modal...")

    const modalValidation = await validateGrammarOnModal(
      coreLibraryCode,
      cleanCode,
      metadata.defaults_json ?? {},
    )
    if (!modalValidation.success) {
      console.warn("[CAD-GRAMMAR-RESEARCH] Modal validation failed:", modalValidation.error)
      return {
        success: false,
        error: `Grammar failed execution on Modal: ${modalValidation.error}`,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
      }
    }

    // ── Step 5: Store in Supabase ──
    console.info("[CAD-GRAMMAR-RESEARCH] Step 5: Storing grammar in Supabase...")

    // Safe cast: param_specs and defaults are JSONB — cast through JSON stringify/parse
    const paramSpecsJson = JSON.parse(JSON.stringify(
      metadata.param_specs_json.length > 0 ? metadata.param_specs_json : []
    ))
    const defaultsJson = JSON.parse(JSON.stringify(metadata.defaults_json))

    const { error: insertError } = await supabase
      .from("cad_grammars")
      .upsert({
        name: grammarName,
        display_name: displayName,
        description: `${productDescription}. Auto-generated grammar based on domain research.`,
        domain_keywords: metadata.domain_keywords,
        example_prompts: metadata.example_prompts,
        python_code: cleanCode,
        core_library_code: null, // Uses __core_library__ at runtime
        param_specs: paramSpecsJson,
        defaults: defaultsJson,
        constraints_summary: metadata.constraints_summary,
        source: "researched",
        is_active: true,
        version: 1,
      }, { onConflict: "name" })

    if (insertError) {
      console.error("[CAD-GRAMMAR-RESEARCH] Supabase insert failed:", insertError.message)
      return {
        success: false,
        error: `Failed to store grammar: ${sanitizeErrorMessage(insertError)}`,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
      }
    }

    // AUDIT: Log grammar creation
    console.info(`[CAD-GRAMMAR-RESEARCH] Grammar "${grammarName}" created successfully`)

    return {
      success: true,
      grammarName,
      displayName,
      researchSummary: researchText.slice(0, 500),
      paramCount: metadata.param_specs_json.length,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
    }
  } catch (err) {
    console.error("[CAD-GRAMMAR-RESEARCH] Research failed:", err)
    return {
      success: false,
      error: `Grammar research error: ${sanitizeErrorMessage(err)}`,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
    }
  }
}

// ─── Grammar Validation ─────────────────────────────────────────────

/**
 * Validates grammar code structure (static checks, no execution).
 *
 * @param code - Python grammar code
 * @param expectedName - Expected grammar name
 * @returns Array of validation error messages (empty = valid)
 */
function validateGrammarCode(code: string, expectedName: string): string[] {
  const errors: string[] = []

  // Must contain a DomainGrammar subclass
  if (!code.includes("DomainGrammar")) {
    errors.push("Missing DomainGrammar subclass")
  }

  // Must have required methods
  const requiredMethods = ["def param_specs", "def derive_skeleton", "def build"]
  for (const method of requiredMethods) {
    if (!code.includes(method)) {
      errors.push(`Missing required method: ${method}`)
    }
  }

  // Must have name property
  if (!code.includes("def name")) {
    errors.push("Missing 'name' property")
  }

  // Must return an Assembly
  if (!code.includes("cq.Assembly")) {
    errors.push("build() must return a cq.Assembly")
  }

  // Must not import from core.grammar (handled by the harness)
  if (code.includes("from core.grammar import") || code.includes("from core import")) {
    errors.push("Must not import from core.grammar — base classes are loaded separately")
  }

  // Security: no dangerous patterns
  const blockedPatterns = [
    "import os", "import sys", "import subprocess",
    "open(", "__import__", "eval(", "exec(",
    "import socket", "import http", "import urllib",
  ]
  for (const pattern of blockedPatterns) {
    if (code.includes(pattern)) {
      errors.push(`Blocked pattern found: "${pattern}"`)
    }
  }

  // Must have ParamSpec definitions
  if (!code.includes("ParamSpec(")) {
    errors.push("Must define at least one ParamSpec")
  }

  return errors
}

/** Response shape from Modal generate-from-grammar endpoint */
interface ModalGrammarResponse {
  error: string | null
  step: string | null
  stl: string | null
  svg_iso: string | null
  svg_top: string | null
  svg_front: string | null
  svg_back: string | null
  svg_right: string | null
  svg_left: string | null
  svg_exploded: string | null
}

/**
 * Validates that grammar code executes successfully on Modal.
 * Calls generate_from_grammar_endpoint with default params and verifies output.
 *
 * @param coreCode - Core library Python code
 * @param grammarCode - Grammar Python code
 * @param params - Default parameter values
 * @returns Success and optional error message
 */
async function validateGrammarOnModal(
  coreCode: string,
  grammarCode: string,
  params: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const baseUrl = process.env.MODAL_CAD_ENDPOINT_URL?.replace(/\/$/, "")
  if (!baseUrl) {
    return { success: false, error: "MODAL_CAD_ENDPOINT_URL not configured" }
  }

  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/grammar`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          core_code: coreCode,
          grammar_code: grammarCode,
          params,
          material_density: 1240,
        }),
      },
      120_000, // 2 min for validation
    )

    if (!response.ok) {
      const errText = await response.text()
      return {
        success: false,
        error: `Modal returned ${response.status}: ${errText.slice(0, 200)}`,
      }
    }

    const data = (await response.json()) as ModalGrammarResponse
    if (data.error) {
      return { success: false, error: data.error }
    }

    const hasOutput =
      (data.step && data.step.length > 0) ||
      (data.stl && data.stl.length > 0) ||
      (data.svg_iso && data.svg_iso.length > 0) ||
      (data.svg_top && data.svg_top.length > 0) ||
      (data.svg_front && data.svg_front.length > 0)

    if (!hasOutput) {
      return {
        success: false,
        error: "Modal execution produced no SVG, STEP, or STL output",
      }
    }

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: sanitizeErrorMessage(err),
    }
  }
}
