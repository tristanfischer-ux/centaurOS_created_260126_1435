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
  const rolloutChecklistPath = path.join(
    process.cwd(),
    "docs",
    "forge",
    "design-to-rfq-rollout-checklist.md",
  )

  it("tracks full release verification and migration auth prerequisites", () => {
    const qaReport = fs.readFileSync(qaReportPath, "utf8")
    const releasePacket = fs.readFileSync(releasePacketPath, "utf8")

    expect(qaReport).toContain("npm run verify:forge-rfq-release")
    expect(qaReport).toContain("npm run test:forge-rfq:contracts")
    expect(qaReport).toContain("SUPABASE_ACCESS_TOKEN")
    expect(qaReport).toContain("release-config-consistency.test.ts")
    expect(releasePacket).toContain("`npm run test:forge-rfq:contracts` passes.")
  })

  it("keeps profiles recursion policy-expression audit in release docs", () => {
    const releasePacket = fs.readFileSync(releasePacketPath, "utf8")
    const migrationRunbook = fs.readFileSync(migrationRunbookPath, "utf8")
    const rolloutChecklist = fs.readFileSync(rolloutChecklistPath, "utf8")

    expect(releasePacket).toContain("policy-expression SQL audit")
    expect(releasePacket).toContain("design-to-rfq-regression-contracts.md")
    expect(releasePacket).toContain("design-to-rfq-product-polish-plan.md")
    expect(migrationRunbook).toContain("Verify Policy Expressions")
    expect(migrationRunbook).toContain("get_my_foundry_id(")
    expect(migrationRunbook).toContain("is_active_user(")
    expect(migrationRunbook).toContain("Execute the SQL manually")
    expect(rolloutChecklist).toContain("manual SQL execution")
  })
})
