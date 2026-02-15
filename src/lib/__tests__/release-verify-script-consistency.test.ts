import fs from "node:fs"
import path from "node:path"

describe("release verify script consistency", () => {
  const packageJsonPath = path.join(process.cwd(), "package.json")

  it("runs contract checks before full release verification chain", () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>
    }

    const verifyScript = packageJson.scripts?.["verify:forge-rfq-release"] ?? ""

    expect(verifyScript).toContain("npm run test:forge-rfq:contracts")
    expect(verifyScript).toContain("npm run test:forge-rfq")
    expect(verifyScript).toContain("npm run test:forge-rfq:e2e-smoke")
  })
})
