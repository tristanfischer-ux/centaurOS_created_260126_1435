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

  it("keeps Design-to-RFQ entrypoint visible when project load fails", async () => {
    mockedListScansAction.mockResolvedValue({ error: "Failed to load projects" })

    render(await ForgeProjectList())

    expect(screen.getByRole("heading", { name: "Design-to-RFQ Lab" })).toBeInTheDocument()
    expect(screen.getByText("Recommended path")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Open Design-to-RFQ Lab/i })).toHaveAttribute(
      "href",
      "/the-forge/cad-lab",
    )
    expect(screen.getByText("Failed to load projects")).toBeInTheDocument()
  })

  it("shows entrypoint and empty state when no projects exist", async () => {
    mockedListScansAction.mockResolvedValue({ scans: [] })

    render(await ForgeProjectList())

    expect(screen.getByRole("heading", { name: "Design-to-RFQ Lab" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "No forge projects yet" })).toBeInTheDocument()
    const createConceptLinks = screen.getAllByRole("link", { name: /Create Concept/i })
    expect(createConceptLinks.some((link) => link.getAttribute("href") === "/the-forge/new")).toBe(
      true,
    )
  })

  it("renders project cards while keeping the entrypoint visible", async () => {
    mockedListScansAction.mockResolvedValue({ scans: [sampleScan] })

    render(await ForgeProjectList())

    expect(screen.getByRole("heading", { name: "Design-to-RFQ Lab" })).toBeInTheDocument()
    expect(screen.getByTestId("project-scan-1")).toBeInTheDocument()
  })
})
