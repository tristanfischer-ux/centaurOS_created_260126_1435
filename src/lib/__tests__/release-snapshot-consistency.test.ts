import fs from "node:fs"
import path from "node:path"

describe("release snapshot consistency", () => {
  const goLiveStatusPath = path.join(
    process.cwd(),
    "docs",
    "forge",
    "design-to-rfq-go-live-status.md",
  )
  const qaReportPath = path.join(
    process.cwd(),
    "docs",
    "forge",
    "design-to-rfq-qa-report.md",
  )

  it("keeps go-live and QA snapshot timestamp + commit aligned", () => {
    const goLiveStatus = fs.readFileSync(goLiveStatusPath, "utf8")
    const qaReport = fs.readFileSync(qaReportPath, "utf8")

    const goLiveTimestamp = goLiveStatus.match(/Last verified at \(UTC\): `([^`]+)`/)?.[1]
    const goLiveCommit = goLiveStatus.match(/Branch head at verification: `([0-9a-f]+)`/)?.[1]

    const qaSnapshot = qaReport.match(
      /latest local execution snapshot: `([^`]+)` on commit `([0-9a-f]+)`/,
    )

    expect(goLiveTimestamp).toBeDefined()
    expect(goLiveCommit).toBeDefined()
    expect(qaSnapshot).toBeDefined()

    const qaTimestamp = qaSnapshot?.[1]
    const qaCommit = qaSnapshot?.[2]

    expect(goLiveTimestamp).toBe(qaTimestamp)
    expect(goLiveCommit).toBe(qaCommit)
    expect((goLiveCommit ?? "").length).toBeGreaterThanOrEqual(7)
  })
})
