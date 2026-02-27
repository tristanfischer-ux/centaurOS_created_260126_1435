/**
 * @file dimension-estimator.ts — Safe Python arithmetic evaluator for pre-execution bbox estimation.
 *
 * @description Parses top-of-file Python parameter assignments and evaluates simple arithmetic
 * to predict bounding box dimensions before expensive Modal execution. This catches gross
 * scale mismatches (3× or more) early.
 *
 * Only handles safe operations: +, -, *, /, parentheses, math.pi, math.sqrt.
 * Returns null for anything complex (function calls, conditionals, list ops).
 *
 * @security No eval() — hand-rolled recursive descent parser for safe evaluation.
 */

import type { DimensionEstimate, PreExecValidationResult } from "@/lib/cad-lab-types"

// ─── Safe Expression Evaluator ───────────────────────────────────────

/**
 * Tokenizes a Python arithmetic expression into numbers, identifiers, and operators.
 *
 * @param expr - Python expression string
 * @returns Array of tokens
 */
function tokenize(
  expr: string,
): Array<{ type: "number" | "ident" | "op"; value: string }> {
  const tokens: Array<{ type: "number" | "ident" | "op"; value: string }> = []
  let i = 0
  const s = expr.trim()

  while (i < s.length) {
    // Skip whitespace
    if (/\s/.test(s[i])) {
      i++
      continue
    }

    // Number (including decimals)
    if (/\d/.test(s[i]) || (s[i] === "." && i + 1 < s.length && /\d/.test(s[i + 1]))) {
      let num = ""
      while (i < s.length && (/\d/.test(s[i]) || s[i] === ".")) {
        num += s[i++]
      }
      tokens.push({ type: "number", value: num })
      continue
    }

    // Identifier (variable name or math.pi etc.)
    if (/[a-zA-Z_]/.test(s[i])) {
      let ident = ""
      while (i < s.length && /[a-zA-Z0-9_.]/.test(s[i])) {
        ident += s[i++]
      }
      tokens.push({ type: "ident", value: ident })
      continue
    }

    // Operators and parentheses
    if ("+-*/()".includes(s[i])) {
      tokens.push({ type: "op", value: s[i] })
      i++
      continue
    }

    // Unknown character — bail
    return []
  }

  return tokens
}

/**
 * Evaluates a tokenized arithmetic expression using recursive descent.
 * Returns null if expression cannot be safely evaluated.
 *
 * Grammar:
 *   expr   → term (('+' | '-') term)*
 *   term   → unary (('*' | '/') unary)*
 *   unary  → '-' unary | primary
 *   primary → NUMBER | IDENT | '(' expr ')' | 'math.sqrt(' expr ')'
 */
function evaluate(
  tokens: Array<{ type: "number" | "ident" | "op"; value: string }>,
  symbols: Record<string, number>,
): number | null {
  let pos = 0

  function peek(): { type: string; value: string } | undefined {
    return tokens[pos]
  }

  function consume(): { type: string; value: string } {
    return tokens[pos++]
  }

  function parseExpr(): number | null {
    let left = parseTerm()
    if (left === null) return null

    while (peek()?.type === "op" && (peek()!.value === "+" || peek()!.value === "-")) {
      const op = consume().value
      const right = parseTerm()
      if (right === null) return null
      left = op === "+" ? left + right : left - right
    }

    return left
  }

  function parseTerm(): number | null {
    let left = parseUnary()
    if (left === null) return null

    while (peek()?.type === "op" && (peek()!.value === "*" || peek()!.value === "/")) {
      const op = consume().value
      const right = parseUnary()
      if (right === null) return null
      if (op === "/") {
        if (right === 0) return null
        left = left / right
      } else {
        left = left * right
      }
    }

    return left
  }

  function parseUnary(): number | null {
    if (peek()?.type === "op" && peek()!.value === "-") {
      consume()
      const val = parseUnary()
      return val !== null ? -val : null
    }
    return parsePrimary()
  }

  function parsePrimary(): number | null {
    const tok = peek()
    if (!tok) return null

    // Number literal
    if (tok.type === "number") {
      consume()
      return parseFloat(tok.value)
    }

    // Parenthesized expression
    if (tok.type === "op" && tok.value === "(") {
      consume() // (
      const val = parseExpr()
      if (val === null) return null
      if (peek()?.value !== ")") return null
      consume() // )
      return val
    }

    // Identifier
    if (tok.type === "ident") {
      consume()
      const name = tok.value

      // Built-in constants
      if (name === "math.pi") return Math.PI

      // Built-in functions
      if (name === "math.sqrt") {
        if (peek()?.value !== "(") return null
        consume() // (
        const arg = parseExpr()
        if (arg === null || arg < 0) return null
        if (peek()?.value !== ")") return null
        consume() // )
        return Math.sqrt(arg)
      }

      // INTENT: math.ceil/math.floor are common in CadQuery parameter sections
      if (name === "math.ceil") {
        if (peek()?.value !== "(") return null
        consume()
        const arg = parseExpr()
        if (arg === null) return null
        if (peek()?.value !== ")") return null
        consume()
        return Math.ceil(arg)
      }
      if (name === "math.floor") {
        if (peek()?.value !== "(") return null
        consume()
        const arg = parseExpr()
        if (arg === null) return null
        if (peek()?.value !== ")") return null
        consume()
        return Math.floor(arg)
      }

      // Variable lookup
      if (name in symbols) return symbols[name]

      // Unknown identifier
      return null
    }

    return null
  }

  const result = parseExpr()
  // Ensure all tokens were consumed
  if (pos !== tokens.length) return null
  return result
}

/**
 * Safely evaluates a Python arithmetic expression using a symbol table.
 *
 * @param expr - Python expression (e.g., "count * h + gap")
 * @param symbols - Symbol table mapping variable names to values
 * @returns Numeric result or null if evaluation failed
 */
export function safeEval(
  expr: string,
  symbols: Record<string, number>,
): number | null {
  // Reject anything that looks complex (function calls other than math.*, conditionals, etc.)
  if (/\b(if|else|for|while|def|class|lambda|import|print|open|eval|exec)\b/.test(expr)) {
    return null
  }
  // Reject list/dict/set operations
  if (/[\[\]{}]/.test(expr)) return null
  // Reject string operations
  if (/["']/.test(expr)) return null
  // Reject comparison/boolean operators
  if (/[<>=!&|^~]/.test(expr)) return null
  // Reject ** (power operator) — too complex for bbox estimation
  if (/\*\*/.test(expr)) return null

  const tokens = tokenize(expr)
  if (tokens.length === 0) return null

  return evaluate(tokens, symbols)
}

// ─── Dimension Estimation ────────────────────────────────────────────

/**
 * Parses top-of-file parameter assignments and builds a symbol table.
 * Estimates bounding box from dimension-related variables.
 *
 * @param pythonCode - Complete CadQuery Python code
 * @returns DimensionEstimate with symbol table and predicted bbox
 */
export function estimateDimensions(pythonCode: string): DimensionEstimate {
  const symbols: Record<string, number> = {}
  const unresolvedVars: string[] = []
  const lines = pythonCode.split("\n")

  // INTENT: Parse parameter assignments at the top of the file.
  // Stop at the first function definition or class (we only care about parameters).
  for (const line of lines) {
    const trimmed = line.trim()

    // Stop at first function/class definition
    if (/^def\s+\w/.test(trimmed) || /^class\s+\w/.test(trimmed)) break

    // Skip comments, blanks, imports
    if (trimmed.startsWith("#") || trimmed === "" || trimmed.startsWith("import") || trimmed.startsWith("from")) continue

    // Parse assignment: name = expression  (with optional inline comment)
    const assignMatch = trimmed.match(/^(\w+)\s*=\s*(.+?)(?:\s*#.*)?$/)
    if (!assignMatch) continue

    const [, varName, exprStr] = assignMatch

    const value = safeEval(exprStr, symbols)
    if (value !== null && isFinite(value)) {
      symbols[varName] = value
    } else {
      unresolvedVars.push(varName)
    }
  }

  // INTENT: Find dimension-related variables and estimate bbox per axis.
  // Naming conventions: *_width, *_height, *_depth, *_od, total_*, etc.
  const xCandidates: number[] = []
  const yCandidates: number[] = []
  const zCandidates: number[] = []

  for (const [name, value] of Object.entries(symbols)) {
    const lower = name.toLowerCase()

    // Width → X axis
    if (/width|wide|length_x|size_x|x_len|overall_x|total_x|outer_x|diameter|od$|_od$/.test(lower)) {
      xCandidates.push(value)
    }
    // Depth → Y axis
    if (/depth|deep|length_y|size_y|y_len|overall_y|total_y|outer_y/.test(lower)) {
      yCandidates.push(value)
    }
    // Height → Z axis
    if (/height|tall|length_z|size_z|z_len|overall_z|total_z|total_h|outer_z/.test(lower)) {
      zCandidates.push(value)
    }

    // Generic "length" — could be X or Y, take as X
    if (/^(?:total_)?length$|^overall_length$|_length$/.test(lower) && !/z|height/.test(lower)) {
      xCandidates.push(value)
    }
  }

  // Use max per axis as predicted bbox (conservative estimate)
  const predictedBbox =
    xCandidates.length > 0 || yCandidates.length > 0 || zCandidates.length > 0
      ? {
          x: xCandidates.length > 0 ? Math.max(...xCandidates) : 0,
          y: yCandidates.length > 0 ? Math.max(...yCandidates) : 0,
          z: zCandidates.length > 0 ? Math.max(...zCandidates) : 0,
        }
      : null

  return { symbols, predictedBbox, unresolvedVars }
}

/**
 * Validates estimated dimensions against the interface definition's expected size.
 * Critical if predicted bbox differs >3× from interface on any axis.
 *
 * @param estimate - DimensionEstimate from estimateDimensions()
 * @param interfaceDefinition - Interface definition from Step 2
 * @returns Validation results
 */
export function validateEstimatedDimensions(
  estimate: DimensionEstimate,
  interfaceDefinition: string,
): PreExecValidationResult[] {
  const results: PreExecValidationResult[] = []

  if (!estimate.predictedBbox) return results
  const { x, y, z } = estimate.predictedBbox
  if (x === 0 && y === 0 && z === 0) return results

  // INTENT: Extract expected dimensions from space budget total or overall dimensions
  const expectedDims = extractExpectedDimensions(interfaceDefinition)
  if (!expectedDims) return results

  const axes: Array<{ label: string; predicted: number; expected: number }> = []
  if (x > 0 && expectedDims.x > 0) axes.push({ label: "X (width)", predicted: x, expected: expectedDims.x })
  if (y > 0 && expectedDims.y > 0) axes.push({ label: "Y (depth)", predicted: y, expected: expectedDims.y })
  if (z > 0 && expectedDims.z > 0) axes.push({ label: "Z (height)", predicted: z, expected: expectedDims.z })

  const mismatches: string[] = []
  let hasCritical = false

  for (const { label, predicted, expected } of axes) {
    const ratio = predicted / expected
    if (ratio > 3 || ratio < 1 / 3) {
      mismatches.push(`${label}: predicted ${predicted.toFixed(0)}mm vs expected ${expected.toFixed(0)}mm (${ratio.toFixed(1)}×)`)
      hasCritical = true
    }
  }

  if (mismatches.length > 0) {
    results.push({
      ruleId: "dim-estimate-mismatch",
      severity: hasCritical ? "critical" : "warning",
      message: `Predicted dimensions differ >3× from interface: ${mismatches.join("; ")}`,
      repairHint: `The parameter values in the code produce dimensions that are wildly different from the interface definition. Check that primary dimensions match the research report and that derived calculations are correct.`,
    })
  }

  return results
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Extracts expected overall dimensions from the interface definition.
 * Looks for "Overall: X×Y×Zmm" or dimensions in the space budget.
 */
function extractExpectedDimensions(
  interfaceDefinition: string,
): { x: number; y: number; z: number } | null {
  // Try explicit "Overall: NxNxNmm" pattern first
  const overallMatch = interfaceDefinition.match(
    /Overall[:\s]*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*mm/i,
  )
  if (overallMatch) {
    return {
      x: parseFloat(overallMatch[1]),
      y: parseFloat(overallMatch[2]),
      z: parseFloat(overallMatch[3]),
    }
  }

  // Try extracting from space budget totals
  const budgetMatch = interfaceDefinition.match(
    /===\s*a\)\s*SPACE\s*BUDGET\s*===\s*([\s\S]*?)(?:===\s*b\)|$)/i,
  )
  if (!budgetMatch) return null

  const budgetText = budgetMatch[1]

  // Look for total lines with axis labels
  const totals: Record<string, number> = {}
  const totalPattern = /(?:Total|Sum)\s*(?:per\s+)?(\w+)[^:]*:\s*(\d+(?:\.\d+)?)\s*mm/gi
  let m: RegExpExecArray | null
  while ((m = totalPattern.exec(budgetText)) !== null) {
    const label = m[1].toLowerCase()
    const value = parseFloat(m[2])
    if (/width|x/.test(label)) totals.x = value
    else if (/depth|y/.test(label)) totals.y = value
    else if (/height|z|level/.test(label)) totals.z = value
    else if (!totals.z) totals.z = value // Default first total to Z (vertical stack)
  }

  if (Object.keys(totals).length === 0) return null

  return {
    x: totals.x ?? 0,
    y: totals.y ?? 0,
    z: totals.z ?? 0,
  }
}
