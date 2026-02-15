import fs from "node:fs"
import path from "node:path"

describe("manual product pass results consistency", () => {
  const passResultsPath = path.join(
    process.cwd(),
    "docs",
    "forge",
    "design-to-rfq-manual-product-pass-results.md",
  )
  const benchmarkFixturePath = path.join(
    process.cwd(),
    "src",
    "lib",
    "cad-lab-golden-benchmarks.ts",
  )

  it("covers every benchmark scenario with PASS status", () => {
    const passResults = fs.readFileSync(passResultsPath, "utf8")
    const benchmarkFixture = fs.readFileSync(benchmarkFixturePath, "utf8")

    const benchmarkProjectNames = Array.from(
      benchmarkFixture.matchAll(/projectName:\s*"([^"]+)"/g),
      (match) => match[1],
    )

    expect(benchmarkProjectNames.length).toBeGreaterThanOrEqual(5)

    for (const projectName of benchmarkProjectNames) {
      expect(passResults).toContain(`| ${projectName} | PASS |`)
    }
  })

  it("captures smoke-chain and migration blocker context", () => {
    const passResults = fs.readFileSync(passResultsPath, "utf8")

    expect(passResults).toContain("npm run verify:forge-rfq-release")
    expect(passResults).toContain("npm run test:forge-rfq:e2e-smoke")
    expect(passResults).toContain("migration verification runbook")
  })
})
