import fs from "node:fs"
import path from "node:path"

describe("scenario matrix consistency", () => {
  const scenarioMatrixPath = path.join(
    process.cwd(),
    "docs",
    "forge",
    "design-to-rfq-scenario-matrix.md",
  )
  const benchmarkFixturePath = path.join(
    process.cwd(),
    "src",
    "lib",
    "cad-lab-golden-benchmarks.ts",
  )

  it("documents every golden benchmark scenario in the QA matrix", () => {
    const scenarioMatrix = fs.readFileSync(scenarioMatrixPath, "utf8")
    const benchmarkFixture = fs.readFileSync(benchmarkFixturePath, "utf8")

    const benchmarkProjectNames = Array.from(
      benchmarkFixture.matchAll(/projectName:\s*"([^"]+)"/g),
      (match) => match[1],
    )

    expect(benchmarkProjectNames.length).toBeGreaterThanOrEqual(5)

    for (const projectName of benchmarkProjectNames) {
      expect(scenarioMatrix).toContain(projectName)
    }
  })

  it("keeps matrix row count aligned to benchmark scenario count", () => {
    const scenarioMatrix = fs.readFileSync(scenarioMatrixPath, "utf8")
    const benchmarkFixture = fs.readFileSync(benchmarkFixturePath, "utf8")

    const benchmarkCount = Array.from(
      benchmarkFixture.matchAll(/projectName:\s*"([^"]+)"/g),
      (match) => match[1],
    ).length

    const scenarioRows = scenarioMatrix
      .split("\n")
      .filter((line) => line.startsWith("|"))
      .filter((line) => !line.includes("---"))
      .filter((line) => !line.includes("| Scenario |"))

    expect(scenarioRows).toHaveLength(benchmarkCount)
  })
})
