/**
 * @file domain-prompts.test.ts — Unit tests for domain hints and prompt helpers.
 *
 * @description J5: Ensures getCodeGenDomainHints, getDomainLabel, getDomainDescription,
 * and getModuleDecompositionPrompt return meaningful content for all known domains.
 */

import {
  type CadLabDomain,
  getCodeGenDomainHints,
  getDomainLabel,
  getDomainDescription,
  getModuleDecompositionPrompt,
  getResearchSynthesisPrompt,
  getDiagnosticsSystemPrompt,
} from "../domain-prompts"

const KNOWN_DOMAINS: CadLabDomain[] = ["electronics", "mechanical", "electromechanical", "fluid"]

// ─── getCodeGenDomainHints ─────────────────────────────────────────

describe("getCodeGenDomainHints", () => {
  it.each(KNOWN_DOMAINS)("returns non-empty string for %s domain", (domain) => {
    const hints = getCodeGenDomainHints(domain)
    expect(hints).toBeTruthy()
    expect(hints.length).toBeGreaterThan(50)
  })

  it("returns empty string for unknown domain", () => {
    const hints = getCodeGenDomainHints("unknown_domain" as CadLabDomain)
    expect(hints).toBe("")
  })

  it("electronics hints mention PCB-relevant terms", () => {
    const hints = getCodeGenDomainHints("electronics")
    expect(hints).toMatch(/PCB|board|connector|footprint/i)
  })

  it("mechanical hints mention structural terms", () => {
    const hints = getCodeGenDomainHints("mechanical")
    expect(hints).toMatch(/wall thickness|fillet|bolt/i)
  })

  it("electromechanical hints mention motor/robotics terms", () => {
    const hints = getCodeGenDomainHints("electromechanical")
    expect(hints).toMatch(/motor|NEMA|bearing|shaft/i)
  })

  it("fluid hints mention pipe/seal terms", () => {
    const hints = getCodeGenDomainHints("fluid")
    expect(hints).toMatch(/pipe|seal|O-ring|flow/i)
  })
})

// ─── getDomainLabel ────────────────────────────────────────────────

describe("getDomainLabel", () => {
  it.each(KNOWN_DOMAINS)("returns non-empty label for %s domain", (domain) => {
    const label = getDomainLabel(domain)
    expect(label).toBeTruthy()
    expect(label.length).toBeGreaterThan(3)
  })
})

// ─── getDomainDescription ──────────────────────────────────────────

describe("getDomainDescription", () => {
  it.each(KNOWN_DOMAINS)("returns non-empty description for %s domain", (domain) => {
    const desc = getDomainDescription(domain)
    expect(desc).toBeTruthy()
    expect(desc.length).toBeGreaterThan(10)
  })
})

// ─── getModuleDecompositionPrompt ──────────────────────────────────

describe("getModuleDecompositionPrompt", () => {
  it.each(KNOWN_DOMAINS)("returns non-empty prompt for %s domain", (domain) => {
    const prompt = getModuleDecompositionPrompt(domain)
    expect(prompt).toBeTruthy()
    expect(prompt.length).toBeGreaterThan(100)
  })

  it("electronics prompt mentions PCB/electronics terms", () => {
    const prompt = getModuleDecompositionPrompt("electronics")
    expect(prompt).toMatch(/electronics|PCB/i)
  })

  it("electromechanical prompt mentions motor/drone/robot terms", () => {
    const prompt = getModuleDecompositionPrompt("electromechanical")
    expect(prompt).toMatch(/motor|drone|robot/i)
  })

  it("fluid prompt mentions pump/pipe terms", () => {
    const prompt = getModuleDecompositionPrompt("fluid")
    expect(prompt).toMatch(/pump|pipe|fluid/i)
  })

  it("all prompts include the JSON output format instruction", () => {
    for (const domain of KNOWN_DOMAINS) {
      const prompt = getModuleDecompositionPrompt(domain)
      expect(prompt).toContain("JSON array")
    }
  })
})

// ─── getResearchSynthesisPrompt ────────────────────────────────────

describe("getResearchSynthesisPrompt", () => {
  it.each(KNOWN_DOMAINS)("returns non-empty prompt for %s domain", (domain) => {
    const prompt = getResearchSynthesisPrompt(domain)
    expect(prompt).toBeTruthy()
    expect(prompt.length).toBeGreaterThan(100)
  })

  it("all prompts include the standard research output format", () => {
    for (const domain of KNOWN_DOMAINS) {
      const prompt = getResearchSynthesisPrompt(domain)
      expect(prompt).toContain("Overall Dimensions")
      expect(prompt).toContain("millimetres")
    }
  })
})

// ─── getDiagnosticsSystemPrompt ────────────────────────────────────

describe("getDiagnosticsSystemPrompt", () => {
  it.each(KNOWN_DOMAINS)("returns non-empty prompt for %s domain", (domain) => {
    const prompt = getDiagnosticsSystemPrompt(domain)
    expect(prompt).toBeTruthy()
    expect(prompt.length).toBeGreaterThan(100)
  })

  it("all prompts include the diagnostic fields", () => {
    for (const domain of KNOWN_DOMAINS) {
      const prompt = getDiagnosticsSystemPrompt(domain)
      expect(prompt).toContain("mfg_process")
      expect(prompt).toContain("material")
      expect(prompt).toContain("tolerance")
    }
  })
})
