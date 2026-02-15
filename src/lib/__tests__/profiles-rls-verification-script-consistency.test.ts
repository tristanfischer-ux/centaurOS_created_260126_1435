import fs from "node:fs"
import path from "node:path"

describe("profiles RLS verification SQL script consistency", () => {
  const sqlPath = path.join(
    process.cwd(),
    "docs",
    "forge",
    "profiles-rls-verification.sql",
  )

  it("retains canonical policy and expression verification checks", () => {
    const sql = fs.readFileSync(sqlPath, "utf8")

    expect(sql).toContain("from pg_policies")
    expect(sql).toContain("tablename = 'profiles'")
    expect(sql).toContain("profiles_select_authenticated")
    expect(sql).toContain("profiles_update_own")
    expect(sql).toContain("get_my_foundry_id(")
    expect(sql).toContain("is_active_user(")
    expect(sql).toContain("auth.uid() = id")
  })
})
