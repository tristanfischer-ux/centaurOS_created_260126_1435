import React from "react"
import { render, screen } from "@testing-library/react"

import { ForgeProjectList } from "../forge-project-list"
import { listCadLabProjects } from "@/actions/cad-lab-projects"
import { listRecentAssemblies } from "@/actions/assembly-builder"

jest.mock("@/actions/cad-lab-projects", () => ({
  listCadLabProjects: jest.fn(),
}))

jest.mock("@/actions/assembly-builder", () => ({
  listRecentAssemblies: jest.fn(),
}))

const mockedListCadLabProjects = listCadLabProjects as jest.MockedFunction<typeof listCadLabProjects>
const mockedListRecentAssemblies = listRecentAssemblies as jest.MockedFunction<
  typeof listRecentAssemblies
>

const sampleProject = {
  id: "proj-1",
  name: "Bracket Project",
  subject: "Bracket fixture",
  status: "active",
  stage: "researched",
  thumbnailSvg: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
}

describe("ForgeProjectList", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedListRecentAssemblies.mockResolvedValue({ assemblies: [] })
  })

  it("shows empty state when no projects exist", async () => {
    mockedListCadLabProjects.mockResolvedValue({ projects: [] })

    render(await ForgeProjectList())

    expect(screen.getByRole("heading", { name: "The Forge" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "No designs yet" })).toBeInTheDocument()
    const cadLabLink = screen.getByRole("link", { name: /Start from a description/i })
    expect(cadLabLink).toHaveAttribute("href", "/the-forge/cad-lab")
  })

  it("renders project cards when projects exist", async () => {
    mockedListCadLabProjects.mockResolvedValue({ projects: [sampleProject] })
    mockedListRecentAssemblies.mockResolvedValue({ assemblies: [] })

    render(await ForgeProjectList())

    expect(screen.getByRole("heading", { name: "The Forge" })).toBeInTheDocument()
    expect(screen.getByText("Bracket fixture")).toBeInTheDocument()
    expect(screen.getByText("Recent Projects")).toBeInTheDocument()
  })
})
