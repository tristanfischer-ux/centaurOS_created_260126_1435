import fs from "node:fs"
import path from "node:path"

describe("release handoff consistency", () => {
  const handoffDocPath = path.join(
    process.cwd(),
    "docs",
    "forge",
    "design-to-rfq-release-handoff.md",
  )

  it("keeps migration closure instructions and verification gates explicit", () => {
    const handoffDoc = fs.readFileSync(handoffDocPath, "utf8")

    expect(handoffDoc).toContain("SUPABASE_ACCESS_TOKEN")
    expect(handoffDoc).toContain("npx supabase db push")
    expect(handoffDoc).toContain("Path B — Manual SQL editor fallback")
    expect(handoffDoc).toContain("20260215120000_stabilize_profiles_rls_no_recursion.sql")
    expect(handoffDoc).toContain("profiles_select_authenticated")
    expect(handoffDoc).toContain("profiles_update_own")
    expect(handoffDoc).toContain("get_my_foundry_id(")
    expect(handoffDoc).toContain("is_active_user(")
    expect(handoffDoc).toContain("npm run verify:forge-rfq-release")
    expect(handoffDoc).toContain("set migration gate from `⛔ PENDING` to `✅ PASS`")
  })
})
