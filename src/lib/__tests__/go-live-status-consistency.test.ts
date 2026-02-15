import fs from "node:fs"
import path from "node:path"

describe("go-live status consistency", () => {
  const statusDocPath = path.join(
    process.cwd(),
    "docs",
    "forge",
    "design-to-rfq-go-live-status.md",
  )

  it("tracks all critical release gates and migration blocker", () => {
    const statusDoc = fs.readFileSync(statusDocPath, "utf8")

    expect(statusDoc).toContain("test:forge-rfq:contracts")
    expect(statusDoc).toContain("test:forge-rfq")
    expect(statusDoc).toContain("test:forge-rfq:e2e-smoke")
    expect(statusDoc).toContain("verify:forge-rfq-release")
    expect(statusDoc).toContain("Last verified at (UTC)")
    expect(statusDoc).toContain("Branch head at verification")
    expect(statusDoc).toContain("Verification environment")
    expect(statusDoc).toContain("design-to-rfq-manual-product-pass-results.md")
    expect(statusDoc).toContain("design-to-rfq-migration-closure-report.md")
    expect(statusDoc).toContain("design-to-rfq-release-handoff.md")
    expect(statusDoc).toContain("forge-rfq-release-operations.yml")
    expect(statusDoc).toContain("SUPABASE_ACCESS_TOKEN")
    expect(statusDoc).toContain("20260215120000_stabilize_profiles_rls_no_recursion.sql")
    expect(statusDoc).toContain("⛔ PENDING")
  })
})
