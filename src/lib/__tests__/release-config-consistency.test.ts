import fs from "node:fs"
import path from "node:path"

describe("release configuration consistency", () => {
  const nextConfigPath = path.join(process.cwd(), "next.config.ts")

  it("disables image optimization to avoid silent PNG failures", () => {
    const nextConfig = fs.readFileSync(nextConfigPath, "utf8")

    expect(nextConfig).toContain("unoptimized: true")
  })

  it("uses non-deprecated Sentry webpack options", () => {
    const nextConfig = fs.readFileSync(nextConfigPath, "utf8")

    expect(nextConfig).toContain("webpack: {")
    expect(nextConfig).toContain("treeshake:")
    expect(nextConfig).toContain("removeDebugLogging: true")
    expect(nextConfig).toContain("automaticVercelMonitors: true")
    expect(nextConfig).not.toContain("disableLogger:")
  })
})
