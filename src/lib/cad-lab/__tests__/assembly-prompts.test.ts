/**
 * @file assembly-prompts.test.ts — Unit tests for assembly prompt generation.
 */

import {
  formatInterfaceContractsForAssembly,
  getAssemblyCodeGenUserPrompt,
  type AssemblyModuleInfo,
} from "../assembly-prompts"
import type { InterfaceContract } from "@/lib/cad-lab-types"

const baseModules: AssemblyModuleInfo[] = [
  {
    name: "chassis",
    displayName: "Chassis Frame",
    isTemplateComponent: false,
    purpose: "Main structural frame",
    keyParts: ["frame", "mounting plate"],
    inputs: ["power input"],
    outputs: ["mechanical mount"],
  },
  {
    name: "motor_assembly",
    displayName: "Motor Assembly",
    isTemplateComponent: true,
    seedTemplateSlug: "nema17_motor",
    purpose: "Drive motor with mounting bracket",
    keyParts: ["NEMA 17", "bracket"],
    inputs: ["mechanical mount"],
    outputs: ["rotary shaft output"],
  },
]

describe("formatInterfaceContractsForAssembly", () => {
  it("formats compatible connections with types and specs", () => {
    const contracts: InterfaceContract[] = [
      {
        sourceModuleId: "chassis",
        sourcePort: "mechanical mount",
        targetModuleId: "motor_assembly",
        targetPort: "mechanical mount",
        portType: "mechanical",
        sourceSpec: "M3 bolt pattern, 4x holes",
        targetSpec: "NEMA 17 face mount, M3 bolt pattern",
        compatible: true,
      },
    ]
    const result = formatInterfaceContractsForAssembly(contracts, baseModules)
    expect(result).toContain("Chassis Frame")
    expect(result).toContain("Motor Assembly")
    expect(result).toContain("MECHANICAL")
    expect(result).toContain("M3 bolt pattern")
    expect(result).not.toContain("INCOMPATIBLE")
  })

  it("flags incompatible connections with reason", () => {
    const contracts: InterfaceContract[] = [
      {
        sourceModuleId: "chassis",
        sourcePort: "power output 24V",
        targetModuleId: "motor_assembly",
        targetPort: "power input 12V",
        portType: "power",
        sourceSpec: "24V DC",
        targetSpec: "12V DC",
        compatible: false,
        incompatibilityReason: "Voltage mismatch: 24V source vs 12V target",
      },
    ]
    const result = formatInterfaceContractsForAssembly(contracts, baseModules)
    expect(result).toContain("INCOMPATIBLE")
    expect(result).toContain("Voltage mismatch")
    expect(result).toContain("POWER")
  })

  it("returns fallback message for empty contracts", () => {
    const result = formatInterfaceContractsForAssembly([], baseModules)
    expect(result).toContain("No interface contracts extracted")
    expect(result).toContain("bounding box stacking")
  })

  it("gracefully handles unknown module IDs", () => {
    const contracts: InterfaceContract[] = [
      {
        sourceModuleId: "unknown_mod_a",
        sourcePort: "output",
        targetModuleId: "unknown_mod_b",
        targetPort: "input",
        portType: "data",
        compatible: null,
      },
    ]
    // Should not throw — uses raw IDs as fallback
    const result = formatInterfaceContractsForAssembly(contracts, baseModules)
    expect(result).toContain("unknown_mod_a")
    expect(result).toContain("unknown_mod_b")
    expect(result).toContain("DATA")
  })
})

describe("getAssemblyCodeGenUserPrompt", () => {
  it("uses CONTRACT-VALIDATED label when contracts are provided", () => {
    const contracts: InterfaceContract[] = [
      {
        sourceModuleId: "chassis",
        sourcePort: "mount",
        targetModuleId: "motor_assembly",
        targetPort: "mount",
        portType: "mechanical",
        compatible: true,
      },
    ]
    const result = getAssemblyCodeGenUserPrompt(baseModules, "test robot", contracts)
    expect(result).toContain("CONTRACT-VALIDATED CONNECTION MAP")
    expect(result).not.toContain("DERIVED CONNECTION MAP")
  })

  it("uses DERIVED label when no contracts are provided", () => {
    const result = getAssemblyCodeGenUserPrompt(baseModules, "test robot")
    expect(result).toContain("DERIVED CONNECTION MAP")
    expect(result).not.toContain("CONTRACT-VALIDATED")
  })

  it("uses DERIVED label when contracts array is empty", () => {
    const result = getAssemblyCodeGenUserPrompt(baseModules, "test robot", [])
    expect(result).toContain("DERIVED CONNECTION MAP")
    expect(result).not.toContain("CONTRACT-VALIDATED")
  })
})
