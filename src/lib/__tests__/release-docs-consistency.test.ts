import fs from "node:fs"
import path from "node:path"

describe("release documentation consistency", () => {
  const qaReportPath = path.join(
    process.cwd(),
    "docs",
    "forge",
    "design-to-rfq-qa-report.md",
  )
  const releasePacketPath = path.join(
    process.cwd(),
    "docs",
    "forge",
    "design-to-rfq-release-packet.md",
  )
  const migrationRunbookPath = path.join(
    process.cwd(),
    "docs",
    "forge",
    "design-to-rfq-migration-verification.md",
  )

  it("tracks full release verification and migration auth prerequisites", () => {
    const qaReport = fs.readFileSync(qaReportPath, "utf8")

    expect(qaReport).toContain("npm run verify:forge-rfq-release")
    expect(qaReport).toContain("SUPABASE_ACCESS_TOKEN")
    expect(qaReport).toContain("release-config-consistency.test.ts")
  })

  it("keeps profiles recursion policy-expression audit in release docs", () => {
    const releasePacket = fs.readFileSync(releasePacketPath, "utf8")
    const migrationRunbook = fs.readFileSync(migrationRunbookPath, "utf8")

    expect(releasePacket).toContain("policy-expression SQL audit")
    expect(migrationRunbook).toContain("Verify Policy Expressions")
    expect(migrationRunbook).toContain("get_my_foundry_id(")
    expect(migrationRunbook).toContain("is_active_user(")
  })
})
