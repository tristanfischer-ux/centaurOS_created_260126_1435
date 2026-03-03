/**
 * @file parameter-extractor.ts — Parse CadQuery code for named numeric parameters.
 *
 * @description CadQuery convention places named variables at the top of the file
 * before any imports or function definitions. This module extracts those numeric
 * parameters so they can be exposed as sliders in the UI.
 *
 * Only parses lines before the first `import` or `def` statement (the parameter block).
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface ExtractedParameter {
  /** Python variable name (e.g., wall_thickness) */
  name: string
  /** Current numeric value */
  value: number
  /** Original numeric value (for reset) */
  originalValue: number
  /** Optional label from inline comment */
  label?: string
  /** Line number in the source code (0-indexed) */
  line: number
}

// ─── Parameter line regex ───────────────────────────────────────────

/** Matches: `variable_name = -123.45  # optional comment`
 * Handles: lowercase, UPPER_CASE, negative numbers */
const PARAM_RE = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(-?[0-9]+\.?[0-9]*)\s*(?:#\s*(.+))?$/

// ─── Extractor ──────────────────────────────────────────────────────

/**
 * Extracts numeric parameter assignments from the top of CadQuery code.
 *
 * @description Only parses lines before the first `import` or `def` statement.
 * This matches the CadQuery convention of a parameter block at the top of the file.
 *
 * @param code - Complete CadQuery Python source code
 * @returns Array of extracted parameters with names, values, and optional labels
 */
export function extractParameters(code: string): ExtractedParameter[] {
  if (!code) return []

  const lines = code.split("\n")
  const params: ExtractedParameter[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Stop at first import or function definition — end of parameter block
    if (line.startsWith("import ") || line.startsWith("from ") || line.startsWith("def ")) {
      break
    }

    // Skip empty lines and comments
    if (!line || line.startsWith("#")) continue

    const match = PARAM_RE.exec(line)
    if (match) {
      const [, name, valueStr, comment] = match
      const value = parseFloat(valueStr)
      if (!isNaN(value)) {
        params.push({
          name,
          value,
          originalValue: value,
          label: comment?.trim(),
          line: i,
        })
      }
    }
  }

  return params
}

/**
 * Rebuilds CadQuery code with modified parameter values.
 *
 * @description Replaces parameter values in-place at their original line positions.
 * Preserves all other code unchanged.
 *
 * @param code - Original CadQuery code
 * @param params - Parameters with potentially modified values
 * @returns New code string with updated parameter values
 */
export function rebuildCodeWithParameters(
  code: string,
  params: ExtractedParameter[],
): string {
  const lines = code.split("\n")

  for (const param of params) {
    if (param.line >= 0 && param.line < lines.length) {
      const originalLine = lines[param.line]
      // Replace the numeric value in the parameter assignment
      const match = PARAM_RE.exec(originalLine.trim())
      if (match && match[1] === param.name) {
        const comment = match[3] ? `  # ${match[3]}` : ""
        // Format value: use original precision style
        const formatted = Number.isInteger(param.value)
          ? param.value.toString()
          : param.value.toFixed(countDecimals(match[2]))
        // Preserve leading whitespace
        const indent = originalLine.match(/^(\s*)/)?.[1] ?? ""
        lines[param.line] = `${indent}${param.name} = ${formatted}${comment}`
      }
    }
  }

  return lines.join("\n")
}

/** Count decimal places in a numeric string */
function countDecimals(numStr: string): number {
  const dotIndex = numStr.indexOf(".")
  if (dotIndex === -1) return 0
  return numStr.length - dotIndex - 1
}
