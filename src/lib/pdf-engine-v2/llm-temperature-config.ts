export const STAGE_TEMPERATURES: Record<string, number> = {
  research: 0.7,        // creative — varied sources
  decompose: 0.3,       // deterministic — consistent module structure
  bom: 0.2,             // highly deterministic — repeatable parts list
  cost: 0.3,            // mostly deterministic — formulaic
  suppliers: 0.5,       // balanced — needs some variety
  sizing: 0.1,          // physics-based — near-deterministic
  regulatory: 0.4,      // structured but needs judgment
  proofreader: 0.5,     // balanced — needs to find varied issues
  'fang-review': 0.6,   // creative — engineering critique
  'chase-research': 0.1, // near-deterministic — structured JSON extraction
}
