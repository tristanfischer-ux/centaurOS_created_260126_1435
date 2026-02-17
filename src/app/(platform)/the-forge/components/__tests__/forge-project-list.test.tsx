import React from "react"
import { render, screen } from "@testing-library/react"

import { ForgeProjectList } from "../forge-project-list"
import { listScansAction } from "@/actions/xray"

jest.mock("@/actions/xray", () => ({
  listScansAction: jest.fn(),
}))

jest.mock("../forge-project-card", () => ({
  ForgeProjectCard: ({ scan }: { scan: { id: string } }) => (
    <div data-testid={`project-${scan.id}`}>Project {scan.id}</div>
  ),
}))

const mockedListScansAction = listScansAction as jest.MockedFunction<typeof listScansAction>

const sampleScan = {
  id: "scan-1",
  idea: "Bracket fixture",
  name: "Bracket Project",
  status: "completed",
  stage: "contracting",
  thumbnailUrl: null,
  moduleCount: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
}

describe("ForgeProjectList", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("shows error message when project load fails", async () => {
    mockedListScansAction.mockResolvedValue({ error: "Failed to load projects" })

    render(await ForgeProjectList())

    expect(screen.getByRole("heading", { name: "The Forge" })).toBeInTheDocument()
    expect(screen.getByText("Failed to load projects")).toBeInTheDocument()
  })

  it("shows empty state when no projects exist", async () => {
    mockedListScansAction.mockResolvedValue({ scans: [] })

    render(await ForgeProjectList())

    expect(screen.getByRole("heading", { name: "The Forge" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "No designs yet" })).toBeInTheDocument()
    const startLinks = screen.getAllByRole("link", { name: /Start Your First Design/i })
    expect(startLinks.some((link) => link.getAttribute("href") === "/the-forge/cad-lab")).toBe(
      true,
    )
  })

  it("renders project cards with pipeline preview", async () => {
    mockedListScansAction.mockResolvedValue({ scans: [sampleScan] })

    render(await ForgeProjectList())

    expect(screen.getByRole("heading", { name: "The Forge" })).toBeInTheDocument()
    expect(screen.getByTestId("project-scan-1")).toBeInTheDocument()
    expect(screen.getByText("Recent Projects")).toBeInTheDocument()
  })
})
