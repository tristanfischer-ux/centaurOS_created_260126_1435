/**
 * @file class-reference-graphs/pv-module-residential.ts — K10 typed graph for
 * residential PV modules (crystalline-silicon, 300-500 W class).
 *
 * @description Models a glass-backsheet or glass-glass monocrystalline PERC /
 * TOPCon / heterojunction (HJT) PV module at the 300-500 W class, 60- or
 * 72-cell layout. Suppliers: LONGi Hi-MO 5/6/7, JinkoSolar Tiger Neo, Trina
 * Solar Vertex S, JA Solar JAM-72S30, REC Alpha Pure-R, SunPower Maxeon.
 * Architecturally minimal compared to other K10 graphs — cells in series +
 * bypass diodes (junction box) + frame + glass + encapsulant + backsheet.
 * Pairs with `pv_string_inverter` for the downstream power-electronics step.
 *
 * @sources No dedicated `pv_module_residential` corpus class exists in
 * ~/.forge-truth/forge-truth.db as of 2026-05-18 — the related
 * `pv_string_inverter` (27 datasheets) covers the downstream stage but not
 * the module itself. Industry knowledge from Tier-1 datasheets (LONGi,
 * Jinko, Trina, JA Solar, REC, SunPower) supplies the values; standards
 * (IEC 61215, IEC 61730, UL 1703) are well-established.
 *
 * @corpus-coverage-2026-05-18 NONE direct. Source-tags are predominantly
 * `industry:<vendor>` and `standard:<id>` per the constrained-corpus
 * fallback documented in the K10 dispatch rules.
 *
 * @scope-2026-05-18
 *   - Crystalline-silicon (c-Si) only. Thin-film (CdTe / CIGS / a-Si)
 *     modules have different layer stacks and bypass topology — separate
 *     graph candidate.
 *   - 60- or 72-cell standard frame (1.6-2.4 m² area). Half-cut and
 *     third-cut cell variants share the same K10 module set.
 *   - Bypass diodes (typically 3 per module, one per cell substring) live
 *     in the junction box on the back of the module.
 *   - Module-Level Power Electronics (Tigo TS4, SolarEdge optimisers,
 *     Enphase microinverters) are OUTSIDE this graph — they belong to a
 *     separate `pv_optimizer` / `microinverter` class.
 *   - Rapid-shutdown receivers (NEC 690.12) similarly live OUTSIDE this
 *     graph — they're a separate retrofit module.
 *
 * @architectural-purpose This is the simplest K10 graph in the registry —
 * deliberately so. It tests minimal-graph topology (5 nodes, 6-7 edges) and
 * serves as a sanity-check that the schema scales DOWN to passive products
 * not just complex active-electronics products. Pairs with the more complex
 * `pv_string_inverter` graph for downstream validation.
 */

import { registerClassReferenceGraph, type ProductClassGraph } from '../class-reference-graph.js'

const PV_MODULE_RESIDENTIAL: ProductClassGraph = {
  product_class: 'pv_module_residential',
  display_name: 'Residential PV Module (300-500 W, crystalline silicon)',
  scope_notes:
    'Glass-backsheet or glass-glass monocrystalline c-Si PV module at the 300-500 W class. ' +
    '60- or 72-cell layout (incl. half-cut, third-cut). PERC / TOPCon / HJT cell technology. ' +
    'Bypass diodes integrated in the junction box (3 per module typical). MC4 / Stäubli ' +
    'connector output. MLPE (optimisers, microinverters) and rapid-shutdown receivers are ' +
    'OUT of scope. Thin-film modules are a separate graph.',

  nodes: [
    {
      class: 'energy_conversion_transduction',
      role: 'principal',
      required: true,
      display: 'PV cells (60 or 72 c-Si cells, series-connected into 3 substrings)',
    },
    {
      class: 'safety_protection',
      role: 'safety',
      required: true,
      display: 'Bypass diodes (3× Schottky in junction box) — prevent reverse-bias hot-spot on shaded substring',
    },
    {
      class: 'power_distribution',
      role: 'subsystem',
      required: true,
      display: 'Junction box + MC4 / Stäubli output connectors + 4 mm² PV cable pigtails',
    },
    {
      class: 'structure_containment',
      role: 'enclosure',
      required: true,
      display: 'Anodised aluminium frame + tempered front glass + EVA/POE encapsulant + backsheet / rear glass',
    },
    {
      class: 'environmental_interface',
      role: 'subsystem',
      required: true,
      display: 'Front glass anti-reflective coating + frame drainage holes + ground/PE bond hole',
    },
  ],

  edges: [
    // ── PV cell series chain → junction box ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'power_distribution',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: {
        voltage_nominal_v: 41,        // Vmp ~41 V typical for 72-cell module
        voltage_range_v: [30, 50],    // Vmp 30-50 V (60-cell to 72-cell range)
        ac_or_dc: 'DC',
        current_max_a: 15,            // Impp ~12-15 A typical
        power_max_w: 500,
      },
      mechanical: {
        connector: 'tin-coated copper tabbing ribbon',
        cable_type: 'ribbon-bus + 4 mm² PV cable pigtails',
      },
      required: true,
      direction: 'directional',
      notes: 'Series-connected cell strings (typically 3 substrings of 20-24 cells each) feed positive and negative tabbing ribbons that exit the back of the laminate into the junction box. Vmp 30-50 V; Voc 36-55 V (open circuit); Impp 11-15 A; Isc 12-16 A. MC4 / Stäubli output pigtails carry the DC to the string inverter input.',
      source_references: [
        'industry:LONGi Hi-MO 6 LR5-72HTH datasheet (Vmp 41.6 V, Impp 13.4 A, Voc 49.5 V)',
        'industry:JinkoSolar Tiger Neo 72HL4 datasheet',
        'industry:Trina Solar Vertex S datasheet',
        'standard:IEC 62852 (MC4 connector)',
      ],
    },

    // ── Bypass diodes (safety) → cell substrings ──
    {
      from_class: 'safety_protection',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'dc_busbar',
      electrical: {
        voltage_nominal_v: 0.5,       // Vf ~0.5 V (Schottky)
        ac_or_dc: 'DC',
        current_max_a: 20,            // Diode rated above Isc with margin
      },
      mechanical: { connector: 'crimped in J-box', cable_type: 'tinned copper terminal' },
      required: true,
      direction: 'directional',
      notes: '3× Schottky bypass diodes (typ. Vishay VBO20-12, 20 A 1200 V or Diotec SK20) wired across each cell substring. On shading/cell-failure the diode forward-biases and bypasses the substring — prevents reverse-bias dissipation that would create hot-spot fire risk per IEC 61730. Located inside the IP65/68 junction box.',
      source_references: [
        'industry:Vishay VBO20 Schottky bypass diode datasheet',
        'industry:Multi-Contact MC4 junction-box assemblies',
        'standard:IEC 61730-1 (PV safety)',
        'standard:IEC 61730-2 (PV safety test)',
      ],
    },

    // ── Junction box → frame (mechanical mount) ──
    {
      from_class: 'power_distribution',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: {
        mount: 'bracket',
        connector: 'silicone-adhesive bonded to backsheet + screw mounts',
        cable_type: 'IP65 / IP68 polycarbonate housing',
      },
      required: true,
      direction: 'mutual',
      notes: 'IP65 (or IP68 for glass-glass) junction box silicone-bonded to the rear backsheet. 4 mm² PV cable pigtails 1100-1500 mm long with MC4 / Stäubli connectors. Pigtail bend-radius 4× cable OD.',
      source_references: [
        'industry:Multi-Contact MC4 junction box',
        'industry:Stäubli MC4 PV connector',
        'standard:IEC 62790 (PV junction boxes)',
      ],
    },

    // ── Cells → frame (lamination stack) ──
    {
      from_class: 'energy_conversion_transduction',
      to_class: 'structure_containment',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: {
        // Schema enum has no 'bonded' value — use 'standoff' (closest fit for the
        // glass-EVA-cell-EVA-backsheet laminate stack pressed between layers).
        mount: 'standoff',
        connector: 'EVA / POE encapsulant lamination',
        cable_type: 'glass-EVA-cell-EVA-backsheet stack',
      },
      required: true,
      direction: 'mutual',
      notes: 'Cells laminated between 3.2 mm tempered front glass and backsheet (Tedlar PVF / PVDF) or rear glass (glass-glass / bifacial). EVA or POE (polyolefin) encapsulant cures at 150 °C / 10-15 min in laminator. Anodised aluminium frame (typ. 30-40 mm depth) glued + clamped to the laminate edge. Frame includes grounding holes for PE bond per IEC 61730.',
      source_references: [
        'industry:LONGi Hi-MO 6 construction spec (glass-backsheet 2.0 mm + 3.2 mm)',
        'industry:Trina Vertex S glass-glass spec',
        'standard:IEC 61215 (PV module qualification)',
        'standard:IEC 61730 (PV module safety)',
        'industry:DuPont Tedlar PVF backsheet',
      ],
    },

    // ── Frame → environmental_interface (mounting + drainage + PE bond) ──
    {
      from_class: 'structure_containment',
      to_class: 'environmental_interface',
      protocol: 'physical',
      mechanism: 'mechanical_mount',
      mechanical: {
        mount: 'bolted',
        connector: 'mid-clamp / end-clamp on aluminium rail',
        cable_type: 'frame drainage slots + PE bond hole + earthing wire 6 mm²',
      },
      required: true,
      direction: 'mutual',
      notes: 'Module frame bolts to roof-mount aluminium rail via mid-clamp or end-clamp (e.g. K2 Systems, IronRidge, Schletter). Frame drainage holes (typ. 6× 4 mm) prevent water pooling. PE bond hole accepts 6 mm² grounding wire per BS 7671 / NEC 690. Mechanical load: 5400 Pa snow / 2400 Pa wind (Tier-1 standard).',
      source_references: [
        'industry:IronRidge XR1000 rail system',
        'industry:LONGi 5400 Pa snow / 2400 Pa wind load spec',
        'standard:IEC 61215 mechanical load test',
        'standard:BS 7671 IET Wiring Regulations (PV section)',
        'standard:NEC 690 (PV grounding)',
      ],
    },

    // ── Front-glass AR coating → ambient (passive) ──
    {
      from_class: 'environmental_interface',
      to_class: 'energy_conversion_transduction',
      protocol: 'physical',
      mechanism: 'cooling_loop',
      fluid: { medium: 'air', temperature_max_c: 85, temperature_min_c: -40 },
      required: false,
      direction: 'mutual',
      notes: 'Passive radiative + convective cooling of the cells through the front glass + frame. NOCT (Nominal Operating Cell Temperature) typically 41-46 °C at STC ambient. Module operating temp -40 to +85 °C per IEC 61215. Required:false because the cooling is purely passive — emitters often subsume this into the structure_containment edge.',
      source_references: [
        'industry:LONGi NOCT 41 °C ± 3 °C',
        'standard:IEC 61215 thermal cycling test',
      ],
    },
  ],

  sources_cited: [
    'industry:LONGi Hi-MO 6 / Hi-MO 7 datasheets',
    'industry:JinkoSolar Tiger Neo 72HL4 datasheet',
    'industry:Trina Solar Vertex S datasheet',
    'industry:JA Solar JAM-72S30 datasheet',
    'industry:REC Alpha Pure-R datasheet',
    'industry:SunPower Maxeon 6 datasheet',
    'industry:Stäubli MC4 PV connector',
    'industry:Multi-Contact junction box assemblies',
    'industry:Vishay / Diotec Schottky bypass diode datasheets',
    'industry:DuPont Tedlar PVF backsheet',
    'industry:IronRidge / K2 Systems / Schletter rail systems',
    'standard:IEC 61215 (PV module qualification)',
    'standard:IEC 61730-1/-2 (PV module safety)',
    'standard:IEC 62852 (MC4 connector)',
    'standard:IEC 62790 (PV junction boxes)',
    'standard:UL 1703 (US flat-plate PV)',
    'standard:BS 7671 IET Wiring Regulations',
    'standard:NEC 690 (PV grounding)',
  ],
}

registerClassReferenceGraph(PV_MODULE_RESIDENTIAL)

export { PV_MODULE_RESIDENTIAL }
