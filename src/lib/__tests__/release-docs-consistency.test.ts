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
    expect(qaReport).toContain("SUPABASE_SERVICE_ROLE_KEY")
    expect(qaReport).toContain("PGRST202")
    expect(qaReport).toContain("password authentication failed for user")
    expect(qaReport).toContain("JWT could not be decoded")
    expect(qaReport).toContain("not found on the default branch")
    expect(qaReport).toContain("merge state `UNSTABLE`")
    expect(qaReport).toContain("release-config-consistency.test.ts")
    expect(qaReport).toContain("manual-product-pass-results-consistency.test.ts")
    expect(qaReport).toContain("go-live-status-consistency.test.ts")
    expect(qaReport).toContain("release-snapshot-consistency.test.ts")
    expect(qaReport).toContain("release-workflow-consistency.test.ts")
    expect(qaReport).toContain("migration-closure-report-consistency.test.ts")
    expect(qaReport).toContain("profiles-rls-verification-script-consistency.test.ts")
    expect(qaReport).toContain("design-to-rfq-migration-closure-report.md")
    expect(qaReport).toContain("target-environment SQL verification outputs")
    expect(qaReport).toContain("release-handoff-consistency.test.ts")
    expect(qaReport).toContain("Five-scenario product pass outcome log")
    expect(qaReport).toContain("latest local execution snapshot")
    expect(releasePacket).toContain("`npm run test:forge-rfq:contracts` passes.")
  })

  it("keeps profiles recursion policy-expression audit in release docs", () => {
    const releasePacket = fs.readFileSync(releasePacketPath, "utf8")
    const migrationRunbook = fs.readFileSync(migrationRunbookPath, "utf8")
    const rolloutChecklist = fs.readFileSync(rolloutChecklistPath, "utf8")

    expect(releasePacket).toContain("policy-expression SQL audit")
    expect(releasePacket).toContain("design-to-rfq-regression-contracts.md")
    expect(releasePacket).toContain("design-to-rfq-product-polish-plan.md")
    expect(releasePacket).toContain("design-to-rfq-manual-product-pass.md")
    expect(releasePacket).toContain("design-to-rfq-manual-product-pass-results.md")
    expect(releasePacket).toContain("design-to-rfq-go-live-status.md")
    expect(releasePacket).toContain("profiles-rls-verification.sql")
    expect(releasePacket).toContain("design-to-rfq-migration-closure-report.md")
    expect(releasePacket).toContain("design-to-rfq-release-handoff.md")
    expect(releasePacket).toContain("forge-rfq-release-operations.yml")
    expect(migrationRunbook).toContain("Verify Policy Expressions")
    expect(migrationRunbook).toContain("get_my_foundry_id(")
    expect(migrationRunbook).toContain("is_active_user(")
    expect(migrationRunbook).toContain("SUPABASE_SERVICE_ROLE_KEY")
    expect(migrationRunbook).toContain("exec_sql")
    expect(migrationRunbook).toContain("database password for pooler")
    expect(migrationRunbook).toContain("management SQL API")
    expect(migrationRunbook).toContain("profiles-rls-verification.sql")
    expect(migrationRunbook).toContain("Execute the SQL manually")
    expect(rolloutChecklist).toContain("manual SQL execution")
    expect(rolloutChecklist).toContain("npm run verify:forge-rfq-release")
    expect(rolloutChecklist).toContain("manual product-pass results artifact status")
  })
})
