import fs from "node:fs"
import path from "node:path"

describe("migration closure report consistency", () => {
  const closureReportPath = path.join(
    process.cwd(),
    "docs",
    "forge",
    "design-to-rfq-migration-closure-report.md",
  )

  it("retains required migration closure evidence sections", () => {
    const closureReport = fs.readFileSync(closureReportPath, "utf8")

    expect(closureReport).toContain("20260215120000_stabilize_profiles_rls_no_recursion.sql")
    expect(closureReport).toContain("profiles_select_authenticated")
    expect(closureReport).toContain("profiles_update_own")
    expect(closureReport).toContain("get_my_foundry_id(")
    expect(closureReport).toContain("is_active_user(")
    expect(closureReport).toContain("npm run verify:forge-rfq-release")
    expect(closureReport).toContain("Go-live status migration gate flipped")
    expect(closureReport).toContain("design-to-rfq-release-handoff.md")
    expect(closureReport).toContain("design-to-rfq-go-live-status.md")
    expect(closureReport).toContain("design-to-rfq-release-packet.md")
    expect(closureReport).toContain("profiles-rls-verification.sql")
  })
})
