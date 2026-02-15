import fs from "node:fs"
import path from "node:path"

describe("release workflow consistency", () => {
  const workflowPath = path.join(
    process.cwd(),
    ".github",
    "workflows",
    "forge-rfq-release-operations.yml",
  )
  const releasePacketPath = path.join(
    process.cwd(),
    "docs",
    "forge",
    "design-to-rfq-release-packet.md",
  )
  const handoffPath = path.join(
    process.cwd(),
    "docs",
    "forge",
    "design-to-rfq-release-handoff.md",
  )

  it("defines manual release operations workflow with verify + migration steps", () => {
    const workflow = fs.readFileSync(workflowPath, "utf8")

    expect(workflow).toContain("workflow_dispatch")
    expect(workflow).toContain("run_release_verify")
    expect(workflow).toContain("apply_migration")
    expect(workflow).toContain("npm run verify:forge-rfq-release")
    expect(workflow).toContain("npx supabase db push")
    expect(workflow).toContain("SUPABASE_ACCESS_TOKEN")
    expect(workflow).toContain("SUPABASE_PROJECT_REF")
    expect(workflow).toContain("SUPABASE_DB_PASSWORD")
  })

  it("documents workflow usage in release packet + handoff runbook", () => {
    const releasePacket = fs.readFileSync(releasePacketPath, "utf8")
    const handoff = fs.readFileSync(handoffPath, "utf8")

    expect(releasePacket).toContain("forge-rfq-release-operations.yml")
    expect(handoff).toContain("forge-rfq-release-operations.yml")
  })
})
