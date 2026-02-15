import fs from "node:fs"
import path from "node:path"

describe("release contract script consistency", () => {
  const packageJsonPath = path.join(process.cwd(), "package.json")
  const contractsDocPath = path.join(
    process.cwd(),
    "docs",
    "forge",
    "design-to-rfq-regression-contracts.md",
  )

  it("defines a dedicated Forge RFQ contract script with all contract guards", () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>
    }
    const contractScript = packageJson.scripts?.["test:forge-rfq:contracts"]

    expect(contractScript).toBeDefined()
    expect(contractScript).toContain("profiles-rls-migration.test.ts")
    expect(contractScript).toContain("go-live-status-consistency.test.ts")
    expect(contractScript).toContain("manual-product-pass-results-consistency.test.ts")
    expect(contractScript).toContain("release-config-consistency.test.ts")
    expect(contractScript).toContain("release-docs-consistency.test.ts")
    expect(contractScript).toContain("release-handoff-consistency.test.ts")
    expect(contractScript).toContain("release-packet-consistency.test.ts")
    expect(contractScript).toContain("release-snapshot-consistency.test.ts")
    expect(contractScript).toContain("release-verify-script-consistency.test.ts")
    expect(contractScript).toContain("scenario-matrix-consistency.test.ts")
    expect(contractScript).toContain("telemetry-event-contract-consistency.test.ts")
  })

  it("keeps regression-contracts doc inventory aligned with contract script", () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>
    }
    const contractsDoc = fs.readFileSync(contractsDocPath, "utf8")
    const contractScript = packageJson.scripts?.["test:forge-rfq:contracts"] ?? ""

    const scriptSuites = Array.from(contractScript.matchAll(/[a-z-]+\.test\.ts/g), (m) => m[0])

    for (const suiteName of scriptSuites) {
      expect(contractsDoc).toContain(suiteName)
    }
  })
})
