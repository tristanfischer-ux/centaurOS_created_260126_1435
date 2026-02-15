import fs from "node:fs"
import path from "node:path"

describe("release packet consistency", () => {
  const releasePacketPath = path.join(
    process.cwd(),
    "docs",
    "forge",
    "design-to-rfq-release-packet.md",
  )
  const packageJsonPath = path.join(process.cwd(), "package.json")

  it("references release gate scripts that exist in package.json", () => {
    const releasePacket = fs.readFileSync(releasePacketPath, "utf8")
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>
    }

    const requiredScripts = [
      "test:forge-rfq",
      "test:forge-rfq:contracts",
      "test:forge-rfq:e2e-smoke",
      "verify:forge-rfq-release",
    ]

    for (const scriptName of requiredScripts) {
      expect(releasePacket).toContain(scriptName)
      expect(packageJson.scripts?.[scriptName]).toBeDefined()
    }
  })

  it("references artifacts that exist on disk", () => {
    const releasePacket = fs.readFileSync(releasePacketPath, "utf8")
    const artifactMatches = Array.from(
      releasePacket.matchAll(/`(docs\/forge\/[^`]+\.md)`/g),
      (match) => match[1],
    )

    expect(artifactMatches.length).toBeGreaterThan(0)

    for (const relativePath of artifactMatches) {
      const absolutePath = path.join(process.cwd(), relativePath)
      expect(fs.existsSync(absolutePath)).toBe(true)
    }
  })
})
