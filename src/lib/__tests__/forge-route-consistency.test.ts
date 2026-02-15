import { getSectionById } from "@/lib/features/section-registry"
import { getSpecialistForRoute } from "@/lib/route-specialist-map"

describe("Forge route consistency", () => {
  it("routes workshop Forge feature to canonical entrypoint", () => {
    const workshop = getSectionById("workshop")
    const forgeFeature = workshop?.features.find((feature) => feature.name === "The Forge")

    expect(forgeFeature?.route).toBe("/the-forge")
  })

  it("maps Forge entrypoint and cad-lab routes to expected specialists", () => {
    expect(getSpecialistForRoute("/the-forge")).toEqual({
      specialistId: "product-lead",
      isDefault: false,
    })

    expect(getSpecialistForRoute("/the-forge/new")).toEqual({
      specialistId: "product-lead",
      isDefault: false,
    })

    expect(getSpecialistForRoute("/the-forge/cad-lab")).toEqual({
      specialistId: "vp-manufacturing",
      isDefault: false,
    })

    expect(getSpecialistForRoute("/the-forge/cad-lab/build")).toEqual({
      specialistId: "vp-manufacturing",
      isDefault: false,
    })
  })
})
