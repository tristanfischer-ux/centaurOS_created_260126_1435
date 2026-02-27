/**
 * @file interface-contracts.test.ts — Tests for P1 interface contract validation
 */

import { validateInterfaceContracts } from "../interface-validators"
import type { CadLabModule, InterfaceContract } from "@/lib/cad-lab-types"

/* ─── Helpers ──────────────────────────────────────────────────────── */

function makeModule(overrides: Partial<CadLabModule> & { id: string; name: string }): CadLabModule {
  return {
    inputs: [],
    outputs: [],
    purpose: "test",
    keyParts: [],
    leadWeeks: 2,
    description: "test module",
    whyItMatters: "test",
    failureModes: [],
    unknowns: [],
    status: "pending",
    ...overrides,
  }
}

function makeContract(overrides: Partial<InterfaceContract>): InterfaceContract {
  return {
    sourceModuleId: "mod-a",
    sourcePort: "Output A",
    targetModuleId: "mod-b",
    targetPort: "Input B",
    portType: "data",
    compatible: true,
    ...overrides,
  }
}

/* ─── Tests ────────────────────────────────────────────────────────── */

describe("validateInterfaceContracts", () => {
  it("returns empty results when all ports are matched", () => {
    const modules = [
      makeModule({ id: "mod-a", name: "Module A", outputs: ["Power Out"] }),
      makeModule({ id: "mod-b", name: "Module B", inputs: ["Power In"] }),
    ]
    const contracts = [
      makeContract({
        sourceModuleId: "mod-a",
        sourcePort: "Power Out",
        targetModuleId: "mod-b",
        targetPort: "Power In",
        portType: "power",
        compatible: true,
      }),
    ]

    const result = validateInterfaceContracts(modules, contracts)
    expect(result.unmatchedOutputs).toHaveLength(0)
    expect(result.unmatchedInputs).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it("detects unmatched outputs", () => {
    const modules = [
      makeModule({ id: "mod-a", name: "Module A", outputs: ["Power Out", "Data Signal"] }),
      makeModule({ id: "mod-b", name: "Module B", inputs: ["Power In"] }),
    ]
    const contracts = [
      makeContract({
        sourceModuleId: "mod-a",
        sourcePort: "Power Out",
        targetModuleId: "mod-b",
        targetPort: "Power In",
      }),
    ]

    const result = validateInterfaceContracts(modules, contracts)
    expect(result.unmatchedOutputs).toHaveLength(1)
    expect(result.unmatchedOutputs[0]).toEqual({ moduleId: "mod-a", portName: "Data Signal" })
  })

  it("detects unmatched inputs", () => {
    const modules = [
      makeModule({ id: "mod-a", name: "Module A", outputs: ["Power Out"] }),
      makeModule({ id: "mod-b", name: "Module B", inputs: ["Power In", "Sensor Data"] }),
    ]
    const contracts = [
      makeContract({
        sourceModuleId: "mod-a",
        sourcePort: "Power Out",
        targetModuleId: "mod-b",
        targetPort: "Power In",
      }),
    ]

    const result = validateInterfaceContracts(modules, contracts)
    expect(result.unmatchedInputs).toHaveLength(1)
    expect(result.unmatchedInputs[0]).toEqual({ moduleId: "mod-b", portName: "Sensor Data" })
  })

  it("warns about incompatible contracts", () => {
    const modules = [
      makeModule({ id: "mod-a", name: "Module A", outputs: ["12V Supply"] }),
      makeModule({ id: "mod-b", name: "Module B", inputs: ["5V Power"] }),
    ]
    const contracts = [
      makeContract({
        sourceModuleId: "mod-a",
        sourcePort: "12V Supply",
        targetModuleId: "mod-b",
        targetPort: "5V Power",
        compatible: false,
        incompatibilityReason: "Voltage mismatch: 12V source, 5V expected",
      }),
    ]

    const result = validateInterfaceContracts(modules, contracts)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings.some((w) => w.includes("incompatible"))).toBe(true)
  })

  it("uses keyword overlap for fuzzy port matching", () => {
    const modules = [
      makeModule({ id: "mod-a", name: "Module A", outputs: ["Motor Power Supply 12V"] }),
      makeModule({ id: "mod-b", name: "Module B", inputs: ["Power Input"] }),
    ]
    // Contract uses slightly different naming than module outputs
    const contracts = [
      makeContract({
        sourceModuleId: "mod-a",
        sourcePort: "Motor Power Supply",
        targetModuleId: "mod-b",
        targetPort: "Power Input",
      }),
    ]

    const result = validateInterfaceContracts(modules, contracts)
    // "Motor Power Supply 12V" should fuzzy-match "Motor Power Supply" via keyword overlap
    expect(result.unmatchedOutputs).toHaveLength(0)
  })

  it("handles empty modules array", () => {
    const result = validateInterfaceContracts([], [])
    expect(result.unmatchedOutputs).toHaveLength(0)
    expect(result.unmatchedInputs).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it("handles single module with no contracts", () => {
    const modules = [
      makeModule({ id: "mod-a", name: "Module A", outputs: ["Output"], inputs: ["Input"] }),
    ]
    const result = validateInterfaceContracts(modules, [])
    expect(result.unmatchedOutputs).toHaveLength(1)
    expect(result.unmatchedInputs).toHaveLength(1)
  })

  it("handles many-to-many connections", () => {
    const modules = [
      makeModule({ id: "mod-a", name: "A", outputs: ["Power", "Data"] }),
      makeModule({ id: "mod-b", name: "B", inputs: ["Power In"], outputs: ["Processed Data"] }),
      makeModule({ id: "mod-c", name: "C", inputs: ["Data In", "Processed Data In"] }),
    ]
    const contracts = [
      makeContract({ sourceModuleId: "mod-a", sourcePort: "Power", targetModuleId: "mod-b", targetPort: "Power In" }),
      makeContract({ sourceModuleId: "mod-a", sourcePort: "Data", targetModuleId: "mod-c", targetPort: "Data In" }),
      makeContract({ sourceModuleId: "mod-b", sourcePort: "Processed Data", targetModuleId: "mod-c", targetPort: "Processed Data In" }),
    ]

    const result = validateInterfaceContracts(modules, contracts)
    expect(result.unmatchedOutputs).toHaveLength(0)
    expect(result.unmatchedInputs).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it("generates warnings for both unmatched and incompatible", () => {
    const modules = [
      makeModule({ id: "mod-a", name: "A", outputs: ["Power", "Extra Signal"] }),
      makeModule({ id: "mod-b", name: "B", inputs: ["Power In", "Missing Input"] }),
    ]
    const contracts = [
      makeContract({
        sourceModuleId: "mod-a",
        sourcePort: "Power",
        targetModuleId: "mod-b",
        targetPort: "Power In",
        compatible: false,
      }),
    ]

    const result = validateInterfaceContracts(modules, contracts)
    expect(result.unmatchedOutputs).toHaveLength(1) // Extra Signal
    expect(result.unmatchedInputs).toHaveLength(1) // Missing Input
    // Should have warnings for: incompatible, unmatched outputs, unmatched inputs
    expect(result.warnings.length).toBe(3)
  })
})
