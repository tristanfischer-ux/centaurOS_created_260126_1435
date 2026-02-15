import fs from "node:fs"
import path from "node:path"

const extractCadLabEvents = (input: string): Set<string> =>
  new Set(input.match(/cad_lab_[a-z_]+/g) ?? [])

const extractTrackedEvents = (input: string): Set<string> =>
  new Set(
    Array.from(input.matchAll(/trackFeatureUse\("([^"]+)"/g), (match) => match[1]),
  )

describe("cad-lab telemetry event contract consistency", () => {
  const docsPath = path.join(
    process.cwd(),
    "docs",
    "forge",
    "design-to-rfq-telemetry-events.md",
  )
  const checklistPath = path.join(
    process.cwd(),
    "docs",
    "forge",
    "design-to-rfq-rollout-checklist.md",
  )
  const contractingPath = path.join(
    process.cwd(),
    "src",
    "components",
    "cad",
    "cad-lab-contracting.tsx",
  )
  const drawingPackagePath = path.join(
    process.cwd(),
    "src",
    "components",
    "cad",
    "cad-lab-drawing-package.tsx",
  )

  it("keeps emitted events aligned with telemetry contract docs", () => {
    const docs = fs.readFileSync(docsPath, "utf8")
    const contracting = fs.readFileSync(contractingPath, "utf8")
    const drawingPackage = fs.readFileSync(drawingPackagePath, "utf8")

    const emittedEvents = new Set([
      ...extractTrackedEvents(contracting),
      ...extractTrackedEvents(drawingPackage),
    ])
    const documentedEvents = extractCadLabEvents(docs)

    expect(documentedEvents).toEqual(emittedEvents)
  })

  it("keeps rollout alpha event checklist aligned with code + docs", () => {
    const docs = fs.readFileSync(docsPath, "utf8")
    const checklist = fs.readFileSync(checklistPath, "utf8")
    const contracting = fs.readFileSync(contractingPath, "utf8")
    const drawingPackage = fs.readFileSync(drawingPackagePath, "utf8")

    const checklistEvents = extractCadLabEvents(checklist)
    const documentedEvents = extractCadLabEvents(docs)
    const emittedEvents = new Set([
      ...extractTrackedEvents(contracting),
      ...extractTrackedEvents(drawingPackage),
    ])

    for (const eventName of checklistEvents) {
      expect(documentedEvents).toContain(eventName)
      expect(emittedEvents).toContain(eventName)
    }
  })
})
