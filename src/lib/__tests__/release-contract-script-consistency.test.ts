import fs from "node:fs"
import path from "node:path"

describe("release contract script consistency", () => {
  const packageJsonPath = path.join(process.cwd(), "package.json")

  it("defines a dedicated Forge RFQ contract script with all contract guards", () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>
    }
    const contractScript = packageJson.scripts?.["test:forge-rfq:contracts"]

    expect(contractScript).toBeDefined()
    expect(contractScript).toContain("profiles-rls-migration.test.ts")
    expect(contractScript).toContain("release-config-consistency.test.ts")
    expect(contractScript).toContain("release-docs-consistency.test.ts")
    expect(contractScript).toContain("release-packet-consistency.test.ts")
    expect(contractScript).toContain("telemetry-event-contract-consistency.test.ts")
  })
})
