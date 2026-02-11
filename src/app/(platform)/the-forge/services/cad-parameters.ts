/**
 * @file cad-parameters.ts — Extract and modify parametric CAD parameters
 *
 * @description Provides utilities for working with the PARAMETERS block
 * in CadQuery-generated Python code. The convergence loop uses this to:
 *
 * 1. Extract current parameter values from CadQuery code
 * 2. Apply proposed changes (modify values in-place)
 * 3. Generate modified code with new parameter values
 *
 * The PARAMETERS block format is:
 * ```python
 * # ── PARAMETERS ──────────────────────────
 * BODY_LENGTH = 120.0   # mm — overall length
 * WALL_THICKNESS = 3.0  # mm — shell wall
 * # ── END PARAMETERS ──────────────────────
 * ```
 *
 * @related
 * - CAD generator: ./cad-generator.ts (prompt that requires the block)
 * - Convergence controller: ./convergence-controller.ts (proposes changes)
 * - Design changes dialog: ../components/design-changes-dialog.tsx (UI)
 */

// ─── Types ───────────────────────────────────────────────────────────

/** A single extracted parameter from the PARAMETERS block */
export interface CadParameter {
  /** Parameter name in SCREAMING_SNAKE_CASE (e.g., "BODY_LENGTH") */
  name: string
  /** Current numeric value */
  value: number
  /** Unit from the inline comment (e.g., "mm", "deg") */
  unit: string | null
  /** Description from the inline comment */
  description: string | null
  /** Original line number in the source code (1-indexed) */
  lineNumber: number
}

/** Result of extracting parameters from CadQuery code */
export interface ParameterExtractionResult {
  /** Extracted parameters */
  parameters: CadParameter[]
  /** Whether a valid PARAMETERS block was found */
  hasParameterBlock: boolean
  /** Start line of the PARAMETERS block (1-indexed) */
  blockStartLine?: number
  /** End line of the PARAMETERS block (1-indexed) */
  blockEndLine?: number
}

/** A parameter modification to apply */
export interface ParameterModification {
  /** Parameter name to modify */
  name: string
  /** New numeric value */
  newValue: number
}

// ─── Extraction ──────────────────────────────────────────────────────

/**
 * Extracts parameters from the PARAMETERS block in CadQuery Python code.
 *
 * @description Parses lines between `# ── PARAMETERS` and `# ── END PARAMETERS`
 * markers, extracting variable assignments in the format:
 * `PARAM_NAME = 123.4  # unit — description`
 *
 * @param code - The full CadQuery Python source code
 * @returns Extraction result with parameters and block location
 */
export function extractParameters(code: string): ParameterExtractionResult {
  const lines = code.split("\n")
  let inBlock = false
  let blockStartLine: number | undefined
  let blockEndLine: number | undefined
  const parameters: CadParameter[] = []

  // Pattern for the block markers
  const startPattern = /^#\s*──\s*PARAMETERS/
  const endPattern = /^#\s*──\s*END PARAMETERS/

  // Pattern for parameter assignments: PARAM_NAME = 123.4  # mm — description
  const paramPattern = /^([A-Z][A-Z0-9_]+)\s*=\s*([0-9]+(?:\.[0-9]+)?)\s*(?:#\s*(.*))?$/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const lineNum = i + 1

    if (startPattern.test(line)) {
      inBlock = true
      blockStartLine = lineNum
      continue
    }

    if (endPattern.test(line)) {
      inBlock = false
      blockEndLine = lineNum
      continue
    }

    if (!inBlock) continue

    // Skip empty lines and pure comments
    if (!line || line.startsWith("#")) continue

    const match = line.match(paramPattern)
    if (match) {
      const [, name, valueStr, comment] = match
      const value = parseFloat(valueStr)

      // Parse unit and description from comment
      let unit: string | null = null
      let description: string | null = null

      if (comment) {
        // Try to extract unit — pattern: "mm — description" or "deg — description"
        const commentMatch = comment.match(/^(\w+)\s*[—–-]\s*(.*)$/)
        if (commentMatch) {
          unit = commentMatch[1]
          description = commentMatch[2].trim() || null
        } else {
          description = comment.trim() || null
        }
      }

      parameters.push({ name, value, unit, description, lineNumber: lineNum })
    }
  }

  return {
    parameters,
    hasParameterBlock: blockStartLine !== undefined,
    blockStartLine,
    blockEndLine,
  }
}

// ─── Modification ────────────────────────────────────────────────────

/**
 * Applies parameter modifications to CadQuery Python code.
 *
 * @description Finds each parameter assignment in the PARAMETERS block
 * and replaces its value with the new one, preserving the comment.
 *
 * @param code - The original CadQuery Python source code
 * @param modifications - Array of parameter name → new value pairs
 * @returns Modified code with updated parameter values
 */
export function applyParameterModifications(
  code: string,
  modifications: ParameterModification[],
): string {
  const modMap = new Map(modifications.map((m) => [m.name, m.newValue]))
  const lines = code.split("\n")

  const result = lines.map((line) => {
    const trimmed = line.trim()
    // Pattern: PARAM_NAME = 123.4  # comment
    const match = trimmed.match(/^([A-Z][A-Z0-9_]+)\s*=\s*[0-9]+(?:\.[0-9]+)?\s*(#.*)?$/)
    if (!match) return line

    const paramName = match[1]
    const newValue = modMap.get(paramName)
    if (newValue === undefined) return line

    // Preserve the comment and indentation
    const indent = line.match(/^\s*/)?.[0] ?? ""
    const comment = match[2] ?? ""
    const formattedValue = Number.isInteger(newValue) ? `${newValue}.0` : newValue.toString()

    return `${indent}${paramName} = ${formattedValue}  ${comment}`.trimEnd()
  })

  return result.join("\n")
}

// ─── Utilities ───────────────────────────────────────────────────────

/**
 * Converts a convergence-proposed parameter change to a CadParameter modification.
 *
 * @description Maps from the convergence controller's string-based proposed changes
 * to the numeric parameter modifications this module expects.
 *
 * @param parameterName - The SCREAMING_SNAKE_CASE parameter name
 * @param suggestedValue - The string value from the convergence proposal
 * @returns A ParameterModification, or null if the value can't be parsed
 */
export function proposedChangeToModification(
  parameterName: string,
  suggestedValue: string,
): ParameterModification | null {
  // Extract numeric value from strings like "5.0 mm", "120", "3.5mm"
  const numMatch = suggestedValue.match(/([0-9]+(?:\.[0-9]+)?)/)
  if (!numMatch) return null

  return {
    name: parameterName,
    newValue: parseFloat(numMatch[1]),
  }
}

/**
 * Checks if CadQuery code has a valid PARAMETERS block.
 *
 * @param code - The CadQuery Python source code
 * @returns true if a PARAMETERS block with at least one parameter exists
 */
export function hasParameterBlock(code: string): boolean {
  const result = extractParameters(code)
  return result.hasParameterBlock && result.parameters.length > 0
}
