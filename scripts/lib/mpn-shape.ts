/**
 * scripts/lib/mpn-shape.ts — MPN shape-classification regexes, single home.
 *
 * CREATED 2026-07-10: serial-design-chain-v2.tsx Stage 10.6 imports
 * `./lib/mpn-shape` ({ STRUCTURED_PN_REGEX, COMMODITY_SKIP_REGEX }) but the module
 * was never committed with the refactor that referenced it — every run threw
 * "Cannot find module .../scripts/lib/mpn-shape" and Stage 10.6 silently skipped
 * (gate 20 backstop only). The canonical definitions already live in the two
 * audits; this is a thin re-export so the three consumers share ONE definition
 * (the honest-scoring "one matcher" discipline applied to MPN shape).
 */
export { STRUCTURED_PN_REGEX } from './fictional-pn-audit'
export { COMMODITY_SKIP_REGEX, SHORT_ALPHANUMERIC_REGEX } from './per-line-price-plausibility-audit'
