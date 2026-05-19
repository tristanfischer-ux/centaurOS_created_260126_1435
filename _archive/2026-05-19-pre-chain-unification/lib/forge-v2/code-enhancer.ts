import fs from "fs"
import path from "path"
import { fetchWithTimeout } from "@/lib/fetch-with-timeout"

export interface CodeEnhancementRequest {
  stage: string
  diagnosis: string
  currentScore: number
  targetScore: number
  projectPath: string
  attemptCount?: number
}

export interface CodeEnhancementResult {
  success: boolean
  changesApplied: number
  summary: string
  error?: string
}

interface FileChange {
  file: string
  oldText: string
  newText: string
}

function getStageSourceMapping(stage: string): string[] {
  // Map pipeline stages to their relevant source files
  const mappings: Record<string, string[]> = {
    waiting_chase: [
      "src/lib/cad-lab/domain-prompts.ts",
      "src/actions/specialists/run-chase-research.ts",
    ],
    waiting_max: [
      "src/lib/cad-lab/domain-prompts.ts",
      "src/actions/cad-lab.ts",
      "src/actions/specialists/run-max-decomposition.ts",
    ],
    waiting_sizing: [
      "src/lib/cad-lab/domain-prompts.ts",
      "src/actions/cad-lab-solver.ts",
    ],
    waiting_bom: [
      "src/actions/bom.ts",
    ],
    waiting_finn: [
      "src/actions/cad-lab-cost.ts",
    ],
    matching_suppliers: [
      "src/actions/supplier-match-generation.ts",
    ],
    running_fang_reviews: [
      "src/actions/cad-lab-reviews.ts",
      "src/actions/specialists/run-fang-review-via-modal.ts",
    ],
    proofreading: [
      "src/actions/cad-lab-reviews.ts",
    ],
  }

  return mappings[stage] || ["src/lib/cad-lab/domain-prompts.ts"]
}

export async function runCodeEnhancer(
  request: CodeEnhancementRequest,
): Promise<CodeEnhancementResult> {
  try {
    const { stage, diagnosis, currentScore, targetScore, projectPath, attemptCount = 1 } = request

    if (attemptCount > 3) {
      return {
        success: false,
        changesApplied: 0,
        summary: "Maximum enhancement attempts (3) reached. Giving up.",
      }
    }

    // 1. Map stage to relevant source files
    const relevantFiles = getStageSourceMapping(stage)

    // 2. Read current source code
    const sourceContents: Record<string, string> = {}
    for (const relativePath of relevantFiles) {
      const fullPath = path.join(projectPath, relativePath)
      if (fs.existsSync(fullPath)) {
        sourceContents[relativePath] = fs.readFileSync(fullPath, "utf8")
      }
    }

    if (Object.keys(sourceContents).length === 0) {
      return {
        success: false,
        changesApplied: 0,
        summary: "No relevant source files found.",
      }
    }

    // 3. Call OpenRouter application programming interface via fetchWithTimeout
    const promptMessage = `You are an expert code enhancer.
A pipeline stage ("${stage}") failed to reach the target score of ${targetScore}. It scored ${currentScore}.
The diagnostic council provided this diagnosis:
"${diagnosis}"

Here is the current source code for the relevant prompt and extraction logic:
${Object.entries(sourceContents)
  .map(([file, content]) => `--- FILE: ${file} ---\n${content}`)
  .join("\n\n")}

Your task:
Suggest SPECIFIC, MINIMAL changes to the prompt text (add missing requirements, clarify field names) or the extraction logic to fix the issue identified in the diagnosis.
Return an array of objects with the exact old text to replace and the new text. Each object must have these keys:
- "file": The file path (for example, "src/lib/cad-lab/domain-prompts.ts")
- "oldText": The exact text to replace (provide enough context to be unique)
- "newText": The new text to insert

DO NOT wrap the response in markdown blocks or add any other text. Output ONLY valid structured data array.`

    const openRouterKey = process.env.OPENROUTER_API_KEY
    if (!openRouterKey) {
      throw new Error("Missing OPENROUTER_API_KEY environment variable")
    }

    const response = await fetchWithTimeout(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-pro-preview",
          messages: [
            { role: "system", content: "You are an expert code enhancer." },
            { role: "user", content: promptMessage },
          ],
        }),
      },
      60000, // 60 seconds timeout
    )

    if (!response.ok) {
      throw new Error(`External service error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const textResponse = data.choices?.[0]?.message?.content || "[]"

    // 4. Parse the suggested changes
    let suggestedChanges: FileChange[] = []
    try {
      const cleanText = textResponse
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim()
      suggestedChanges = JSON.parse(cleanText) as FileChange[]
    } catch (error) {
      return {
        success: false,
        changesApplied: 0,
        summary: "Failed to parse model response as structured data",
        error: String(error),
      }
    }

    // 5. Apply them using file system write operations
    let changesApplied = 0
    const summaryLines: string[] = []

    for (const change of suggestedChanges) {
      if (!change.file || !change.oldText || !change.newText) continue

      const fullPath = path.join(projectPath, change.file)
      if (!fs.existsSync(fullPath)) continue

      let content = fs.readFileSync(fullPath, "utf8")
      if (content.includes(change.oldText)) {
        content = content.replace(change.oldText, change.newText)
        fs.writeFileSync(fullPath, content, "utf8")
        changesApplied++
        summaryLines.push(`Replaced text in ${change.file}`)
      } else {
        summaryLines.push(`Could not find exact text in ${change.file}`)
      }
    }

    return {
      success: changesApplied > 0,
      changesApplied,
      summary: summaryLines.join("\n") || "No changes were applied.",
    }
  } catch (error) {
    return {
      success: false,
      changesApplied: 0,
      summary: "Error during code enhancement",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
