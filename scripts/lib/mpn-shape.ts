/**
 * mpn-shape — shared manufacturer-part-number shape classifiers.
 *
 * The chain (serial-design-chain-v2.tsx Stage 10.6 Part Verification) `await import`s
 * { STRUCTURED_PN_REGEX, COMMODITY_SKIP_REGEX } from './lib/mpn-shape', but the module was
 * never created (an unfinished extraction — no git history) so Stage 10.6 has been silently
 * throwing "Cannot find module" and skipping (gate 20 backstop only). These are the canonical
 * regexes, identical to the copies in fictional-pn-audit.ts + part-reality-check.ts (gate 20 /
 * Stage 10.5), centralised here so all three share one definition.
 *
 * COMMODITY_SKIP_REGEX — matches commodity descriptors that are NOT real catalogue part numbers
 * (M6 bolt, "generic", "TBD", "20mm angle", "400 A") so they are skipped from existence checks.
 * STRUCTURED_PN_REGEX — matches an alphanumeric+separator structured product number (e.g.
 * "KFD2-STC4-EX1") — the shape a hallucinated-but-plausible MPN takes, escalating it to HIGH.
 */
export const COMMODITY_SKIP_REGEX =
  /^(?:M\d{1,2}(?:\.\d)?\s*(?:x\s*\d+)?|generic|standard|n\/?a|tbd|various|custom|bespoke|oem|\d{1,4}mm?\s*(?:angle|plate|rod|tube|pipe|cable|wire|bracket|channel|gland|trunking)?|\d+(?:\.\d+)?\s*(?:A|V|W|kW|kVA|kWh|MWh|Hz|mm|m|kg)\s*[-_/]?\s*\w*)$/i

export const STRUCTURED_PN_REGEX = /^[A-Z0-9]{3,}[-_/][A-Z0-9]{1,}(?:[-_/][A-Z0-9]{1,})*$/
