/**
 * Compresses a Stage 0 reference dossier to fit within the 15,000-character
 * documentContext cap in runCadLabResearch. Keeps the most actionable
 * sections verbatim and summarises the rest.
 */

const BUDGET = 12_000

const PRIORITY_HEADINGS = [
  "constraint anchors",
  "dimensional",
  "mass data",
  "key components",
  "cost data",
  "regulatory",
  "disagreements",
]

const SUMMARY_HEADINGS = [
  "executive summary",
  "system architecture",
  "manufacturers",
  "suppliers",
  "real-world installations",
  "engineering pitfalls",
  "design constraints",
]

interface Section {
  heading: string
  body: string
  priority: boolean
}

function parseMarkdownSections(md: string): Section[] {
  const lines = md.split("\n")
  const sections: Section[] = []
  let currentHeading = ""
  let currentBody: string[] = []

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/)
    if (headingMatch) {
      if (currentHeading) {
        sections.push({
          heading: currentHeading,
          body: currentBody.join("\n").trim(),
          priority: isPriority(currentHeading),
        })
      }
      currentHeading = headingMatch[1].trim()
      currentBody = []
    } else {
      currentBody.push(line)
    }
  }

  if (currentHeading) {
    sections.push({
      heading: currentHeading,
      body: currentBody.join("\n").trim(),
      priority: isPriority(currentHeading),
    })
  }

  return sections
}

function isPriority(heading: string): boolean {
  const lower = heading.toLowerCase()
  return PRIORITY_HEADINGS.some((p) => lower.includes(p))
}

function isSummaryCandidate(heading: string): boolean {
  const lower = heading.toLowerCase()
  return SUMMARY_HEADINGS.some((s) => lower.includes(s))
}

function truncateToFirstParagraph(body: string): string {
  const paragraphs = body.split(/\n\n+/)
  const first = paragraphs[0] ?? ""
  if (first.length > 400) return first.slice(0, 397) + "..."
  return first
}

export function compressReferenceDossier(fullDossier: string): string {
  if (fullDossier.length <= BUDGET) return fullDossier

  const sections = parseMarkdownSections(fullDossier)
  const parts: string[] = []
  let used = 0

  for (const section of sections) {
    if (section.priority) {
      const block = `## ${section.heading}\n${section.body}`
      if (used + block.length <= BUDGET) {
        parts.push(block)
        used += block.length
      } else {
        const remaining = BUDGET - used
        if (remaining > 200) {
          parts.push(`## ${section.heading}\n${section.body.slice(0, remaining - section.heading.length - 10)}...`)
          used = BUDGET
        }
        break
      }
    }
  }

  for (const section of sections) {
    if (section.priority) continue
    if (used >= BUDGET) break

    if (isSummaryCandidate(section.heading)) {
      const summary = truncateToFirstParagraph(section.body)
      const block = `## ${section.heading}\n${summary}`
      if (used + block.length <= BUDGET) {
        parts.push(block)
        used += block.length
      }
    }
  }

  return parts.join("\n\n")
}
