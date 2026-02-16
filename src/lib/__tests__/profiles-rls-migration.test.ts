import fs from "node:fs"
import path from "node:path"

describe("profiles RLS stabilization migration", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260215120000_stabilize_profiles_rls_no_recursion.sql.skip",
  )

  it("keeps canonical non-recursive profile policies", () => {
    const sql = fs.readFileSync(migrationPath, "utf8")

    expect(sql).toContain('CREATE POLICY "profiles_select_authenticated"')
    expect(sql).toContain('CREATE POLICY "profiles_update_own"')
    expect(sql).toContain("USING (auth.uid() = id)")
    expect(sql).toContain("WITH CHECK (auth.uid() = id)")
  })

  it("guards against recursive helper usage in profile policies", () => {
    const sql = fs.readFileSync(migrationPath, "utf8")
    const policyExpressionLines = sql
      .split("\n")
      .filter((line) => line.includes("USING (") || line.includes("WITH CHECK ("))
      .join("\n")

    expect(sql).toContain(
      'DROP POLICY IF EXISTS "Active users can view profiles in their foundry" ON public.profiles;',
    )
    expect(sql).toContain(
      'DROP POLICY IF EXISTS "Users can view profiles in their foundry" ON public.profiles;',
    )
    expect(policyExpressionLines).not.toContain("get_my_foundry_id(")
    expect(policyExpressionLines).not.toContain("is_active_user(")
  })
})
