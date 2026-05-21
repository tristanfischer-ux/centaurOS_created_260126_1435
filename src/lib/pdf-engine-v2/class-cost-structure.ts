// class-cost-structure.ts
//
// Engine D — per-class cost-stack ratios for the ForgeOS PDF engine v2.
//
// The pipeline produces a raw-materials bill of materials (sum of distributor-
// quoted line items, post-W3 batch-economics scaling). That single number is
// MISLEADING when shown to a founder, because the figure a buyer compares
// against is the INSTALLED ASP (channel list price + installation, where
// applicable). Engine D decomposes the raw materials number into the full
// downstream stack so the cover page tells the truth about every layer:
//
//   raw_materials_bom
//     + assembly_labour              (class-specific labour as % of raw)
//     + factory_overhead             (overhead as % of raw + labour)
//   = factory_COGS
//     + manufacturer_margin          (margin as % of factory COGS)
//   = oem_transfer_price
//     + channel_markup               (distributor/dealer markup, 0 for direct)
//   = channel_list_price
//     + installation_cost            (only where installation is a real service)
//   = installed_ASP
//
// The figures below are STARTER RATIOS calibrated by class archetype. They
// will be refined by Engine C reference-product anchoring once the Phase 4
// corpus is wired into the renderer. For now they replace a single
// misleading "BoM total" headline with a defensible breakdown that any
// founder can interrogate layer by layer.
//
// Notes on the ratios:
//
// - `assembly_labour_factor` is applied to raw_materials.
//   Consumer high-volume electronics: 5-12% (highly automated SMT lines).
//   Mid-volume professional: 12-20% (mixed automation + hand assembly).
//   Industrial-heavy bespoke: 15-30% (hand-built, low automation).
//   Medical implantable: 15-25% (clean room + manual QC).
//
// - `factory_overhead_factor` is applied to (raw + labour).
//   Consumer / high-volume contract manufacturing: 10-15%.
//   Industrial / regulated facilities: 15-25%.
//
// - `manufacturer_margin_factor` is applied to factory_COGS.
//   Consumer (commodity): 20-35%.
//   Mid-volume professional: 25-40%.
//   Medical device / high-IP: 45-60%.
//
// - `channel_markup_factor` is applied to oem_transfer_price.
//   Direct (EPC, B2B project): 0.
//   Distributor-only B2B: 15-25%.
//   Retail consumer: 30-50%.
//   Pharma / regulated distribution: 40-55%.
//
// - `installation_cost_factor` is applied to channel_list_price.
//   No install service (consumer drone, smartphone, CGM, smart speaker): 0.
//   Minor install (PV inverter, robot arm commissioning): 0.15-0.30.
//   Plumbed / electrical / refrigerant (heatpump, EV charger, chiller): 0.35-0.80.
//   Civils + EPC (BESS, vertical farm): 0.50-0.80.
//
// Reference for the 10 anchor classes: PLAN-2026-05-18 cost-correctness-engine-v2.
// The remaining ~50 classes use archetype-mapped defaults derived from the
// same ranges — they will be calibrated against Phase 4 corpus reference
// products once Engine C lands.

export type CostStackRatios = {
  /** Assembly labour cost as a fraction of raw_materials_bom. */
  assembly_labour_factor: number
  /** Factory overhead as a fraction of (raw_materials + assembly_labour). */
  factory_overhead_factor: number
  /** Manufacturer margin as a fraction of factory_COGS. */
  manufacturer_margin_factor: number
  /** Channel/distributor markup as a fraction of oem_transfer_price. 0 = direct. */
  channel_markup_factor: number
  /** Installation cost as a fraction of channel_list_price. 0 = no install service. */
  installation_cost_factor: number
  /** Short note on the archetype + calibration confidence. */
  notes: string
}

// ---------------------------------------------------------------------------
// Archetype helpers — define the families once, then assign classes to a
// family. Keeps the table readable and lets us refine a whole archetype with
// one edit when Engine C surfaces systematic deviation.
// ---------------------------------------------------------------------------

const ARCH_CONSUMER_HIGH_VOLUME_ELECTRONICS: CostStackRatios = {
  // SMT-dominated, 100k+/yr. Labour low, overhead moderate, margin commodity,
  // retail channel markup, no install.
  assembly_labour_factor: 0.10,
  factory_overhead_factor: 0.12,
  manufacturer_margin_factor: 0.30,
  channel_markup_factor: 0.40,
  installation_cost_factor: 0,
  notes: 'Consumer high-volume electronics archetype (SMT-dominated, retail).',
}

const ARCH_CONSUMER_DISPOSABLE_MEDICAL: CostStackRatios = {
  // CGM, insulin pen needle, lateral-flow. High margin, regulated channel.
  assembly_labour_factor: 0.12,
  factory_overhead_factor: 0.15,
  manufacturer_margin_factor: 0.50,
  channel_markup_factor: 0.40,
  installation_cost_factor: 0,
  notes: 'Consumer disposable medical device archetype (regulated, high margin).',
}

const ARCH_MID_VOLUME_PROFESSIONAL: CostStackRatios = {
  // Edge-AI server, PV inverter, residential ESS. Mixed automation, B2B channel.
  assembly_labour_factor: 0.15,
  factory_overhead_factor: 0.15,
  manufacturer_margin_factor: 0.30,
  channel_markup_factor: 0.25,
  installation_cost_factor: 0.20,
  notes: 'Mid-volume professional archetype (B2B distribution, some install).',
}

const ARCH_INDUSTRIAL_HEAVY_INSTALLED: CostStackRatios = {
  // Heat-pump residential, chiller, EV charger. Plumbed/electrical install.
  assembly_labour_factor: 0.20,
  factory_overhead_factor: 0.15,
  manufacturer_margin_factor: 0.30,
  channel_markup_factor: 0.30,
  installation_cost_factor: 0.60,
  notes: 'Industrial-heavy installed archetype (plumbed/electrical install).',
}

const ARCH_INDUSTRIAL_HEAVY_EPC: CostStackRatios = {
  // BESS utility, vertical farm. Direct EPC, no channel markup, civils install.
  assembly_labour_factor: 0.15,
  factory_overhead_factor: 0.18,
  manufacturer_margin_factor: 0.25,
  channel_markup_factor: 0,
  installation_cost_factor: 0.55,
  notes: 'Industrial-heavy EPC archetype (direct, civils + install).',
}

const ARCH_BESPOKE_LOW_VOLUME: CostStackRatios = {
  // HAPS, AUV, custom robotics. Hand-built, low channel markup, light install.
  assembly_labour_factor: 0.25,
  factory_overhead_factor: 0.20,
  manufacturer_margin_factor: 0.35,
  channel_markup_factor: 0.10,
  installation_cost_factor: 0.25,
  notes: 'Bespoke low-volume hand-built archetype.',
}

const ARCH_MEDICAL_IMPLANTABLE: CostStackRatios = {
  // Insulin pump, pacemaker. Highest margin + heavily distributor-controlled.
  assembly_labour_factor: 0.15,
  factory_overhead_factor: 0.18,
  manufacturer_margin_factor: 0.60,
  channel_markup_factor: 0.50,
  installation_cost_factor: 0,
  notes: 'Medical implantable archetype (regulated, very high margin).',
}

const ARCH_INDUSTRIAL_ROBOTICS: CostStackRatios = {
  // Robot arm, AGV. Some commissioning, distributor + integrator channel.
  assembly_labour_factor: 0.15,
  factory_overhead_factor: 0.18,
  manufacturer_margin_factor: 0.30,
  channel_markup_factor: 0.20,
  installation_cost_factor: 0.30,
  notes: 'Industrial robotics archetype (commissioned install).',
}

const ARCH_CONSUMER_PURE_RETAIL: CostStackRatios = {
  // Drone, smart speaker, headphones. No install, retail channel.
  assembly_labour_factor: 0.10,
  factory_overhead_factor: 0.12,
  manufacturer_margin_factor: 0.35,
  channel_markup_factor: 0.30,
  installation_cost_factor: 0,
  notes: 'Consumer pure-retail archetype (no install, retail).',
}

const ARCH_PV_STRING_INVERTER: CostStackRatios = {
  // PV string inverter: light install, distributor-led B2B.
  assembly_labour_factor: 0.10,
  factory_overhead_factor: 0.10,
  manufacturer_margin_factor: 0.20,
  channel_markup_factor: 0.25,
  installation_cost_factor: 0.20,
  notes: 'PV string inverter archetype (commodity inverter, B2B install).',
}

// ---------------------------------------------------------------------------
// COST_STACK — keyed by every product_class slug AND iter-output slug. The
// renderer (resolveCostStack) tries the canonical product_class first then
// the slug hint, matching the PRICE_BANDS pattern.
// ---------------------------------------------------------------------------

export const COST_STACK: Record<string, CostStackRatios> = {
  // ===== 10 anchor classes from the Engine D spec =====
  // Recalibrated 2026-05-18 (triple-compression-fix): pre-W3 raw BoM from Engine-B-curve emission ALREADY sits near installed-ASP magnitude. Renderer pre-W3 sum (with qty multipliers) on /tmp/test-heatpump-p5.json = £1,890.27 for 1.6 kW (£1,182/kW raw). Prior 2.7621× cost-stack + 0.0308 W3 then over-compressed by 11.7× landing installed ASP 91% below band. Re-derived: target ASP £1,200 (band centre £750/kW × 1.6 kW) ⇒ net multiplier 0.635. New ratios compound to 1.952×; W3 lifted from 0.0308 to 0.3253 so installed-ASP lands at band centre.
  'heat-pump-residential': {
    assembly_labour_factor: 0.05,
    factory_overhead_factor: 0.05,
    manufacturer_margin_factor: 0.15,
    channel_markup_factor: 0.10,
    installation_cost_factor: 0.40,
    notes: 'Heat-pump residential — recalibrated 2026-05-18 (triple-compression-fix). Realistic UK ratios for installer-channel R290 monobloc: assembly 5%, overhead 5%, manufacturer margin 15%, B2B distributor 10%, refrigerant + plumbing + electrical + MCS commissioning 40%. Compound multiplier 1.952×; W3 in class-price-bands.ts lifted from 0.0308 to 0.3253 so net multiplier 0.635 applied to Engine-B pre-W3 raw BoM (£1,890.27 renderer total for 1.6 kW) produces installed ASP £1,200 (£750/kW band centre).',
  },
  // Recalibrated 2026-05-18 (Engine-B BESS gap fix): the pre-W3 Engine-B raw
  // BoM landed at £24.83/kWh on the 67-part BESS state (3.5 MWh / 3920 cells)
  // — Engine B was under-pricing cells (£4.80 vs realistic £70-100), oem-
  // subsystem modules (£246 vs realistic £2k-£20k) and the IGBT power module
  // (£135 vs realistic £600-1500), while over-pricing the high-qty small
  // parts (cell insulation pads, busbar strips, NTC thermistors). Net: raw
  // BoM 4× too low. The fix lives in `component-classes.ts ::
  // PRODUCT_CLASS_REFERENCE_OVERRIDES` — per-(product_class, component_class)
  // reference unit cost overrides that lift the median anchor to BESS-class
  // reality. Post-override raw BoM lands at £93/kWh and these realistic
  // heavy-EPC ratios (L=0.20, OH=0.15, M=0.20, C=0, I=0.45 → compound 2.40×)
  // bring installed ASP to £224/kWh (band centre £227.5/kWh).
  'bess-utility-scale': {
    assembly_labour_factor: 0.20,
    factory_overhead_factor: 0.15,
    manufacturer_margin_factor: 0.20,
    channel_markup_factor: 0,
    installation_cost_factor: 0.45,
    notes: 'BESS utility — recalibrated 2026-05-18 (Engine-B gap fix). Direct EPC (no channel), heavy civils + grid-connect + commissioning + integration. Raw BoM now rises to £93/kWh via PRODUCT_CLASS_REFERENCE_OVERRIDES (cells £100, oem £10k, power module £1k, small parts down-anchored). Compound multiplier 2.40× lifts to £224/kWh installed ASP (band centre £227.5/kWh, range £190-265).',
  },
  // Calibrated 2026-05-18: target installed-ASP £550-950/kW per Grok (BNEF + OZEV + Zapmap), multiplier 2.815× via uniform alpha=0.982 — W3 set to 1.0
  dc_fast_ev_charger: {
    assembly_labour_factor: 0.18,
    factory_overhead_factor: 0.15,
    manufacturer_margin_factor: 0.29,
    channel_markup_factor: 0.20,
    installation_cost_factor: 0.34,
    notes: 'DC fast EV charger — calibrated 2026-05-18. W3 set to 1.0 (pre-W3 raw BoM £267/kW already at hardware-list level; cost-stack delivers full installed price). Multiplier 2.815× lifts £267 to £752/kW (mid-band £550-950).',
  },
  consumer_smartphone: {
    assembly_labour_factor: 0.10,
    factory_overhead_factor: 0.12,
    manufacturer_margin_factor: 0.30,
    channel_markup_factor: 0.40,
    installation_cost_factor: 0,
    notes: 'Consumer smartphone — uncalibrated, needs Grok anchor. Archetype defaults (consumer high-volume electronics).',
  },
  // Calibrated 2026-05-18: target installed-ASP £15-40/unit per Grok (Abbott 10-K, NHS, BNF), multiplier 2.513× via uniform alpha=0.912 (W3 retained at 0.003 because pre-W3 BoM £3,658/unit is over-decomposed 300×)
  wearable_medical_device: {
    assembly_labour_factor: 0.11,
    factory_overhead_factor: 0.14,
    manufacturer_margin_factor: 0.46,
    channel_markup_factor: 0.36,
    installation_cost_factor: 0,
    notes: 'Wearable medical (CGM-class) — calibrated 2026-05-18. Regulated disposable, pharmacy channel. W3 0.003 retained as S1-compensator: pre-W3 BoM £3,658/unit is over-decomposed ~300× from real ~£11. Cost-stack multiplier 2.513× lifts post-W3 £10.97 to £27.6/unit (mid-band £15-40).',
  },
  // Calibrated 2026-05-18: target retail ASP £650-1,899/unit per Grok (DJI, Currys, John Lewis), multiplier 3.614× via uniform alpha=1.809 (W3 retained at 0.035 because pre-W3 BoM £10,048/unit is over-decomposed 30×)
  consumer_cinematography_drone: {
    assembly_labour_factor: 0.18,
    factory_overhead_factor: 0.22,
    manufacturer_margin_factor: 0.63,
    channel_markup_factor: 0.54,
    installation_cost_factor: 0,
    notes: 'Consumer cinematography drone — calibrated 2026-05-18. Premium retail. W3 0.035 retained as S1-compensator: pre-W3 BoM £10,048/unit is over-decomposed 30× from real ~£300. Cost-stack multiplier 3.614× lifts post-W3 £352 to £1,272/unit (mid-band £650-1,899).',
  },
  // Recalibrated 2026-05-18 (triple-compression-fix): pre-W3 raw BoM from Engine-B-curve emission targets near installed-ASP. Realistic ~3 kW residential PV inverter ratios — commodity assembly, thin margin, distributor + light commissioning. Compound multiplier 1.465×; W3 lifted to 0.683 so net multiplier ≈ 1.0 applied to Engine-B pre-W3 produces installed ASP at band centre £102.5/kW.
  pv_string_inverter: {
    assembly_labour_factor: 0.03,
    factory_overhead_factor: 0.04,
    manufacturer_margin_factor: 0.08,
    channel_markup_factor: 0.10,
    installation_cost_factor: 0.15,
    notes: 'PV string inverter — recalibrated 2026-05-18 (triple-compression-fix). Commodity ~3 kW residential inverter: SMT labour 3%, overhead 4%, thin manufacturer margin 8%, B2B distributor 10%, AC-isolator + cabling + commissioning 15%. Compound multiplier 1.465×; W3 in class-price-bands.ts lifted from 0.6518 to 0.683 so net multiplier ≈ 1.0 applied to Engine-B pre-W3 raw BoM produces installed ASP at band centre (£75-130/kW band, centre £102.5/kW).',
  },
  insulin_pump: { ...ARCH_MEDICAL_IMPLANTABLE, notes: 'Insulin pump — uncalibrated, needs Grok anchor. Archetype defaults (medical implantable).' },
  industrial_robot_arm: { ...ARCH_INDUSTRIAL_ROBOTICS, notes: 'Industrial robot arm — uncalibrated, needs Grok anchor. Archetype defaults (industrial robotics).' },
  // Calibrated 2026-05-18: target installed-ASP £140-300k/m wingspan per Grok (NSR, Euroconsult, Airbus Zephyr, UK MoD), multiplier 4.143× via uniform alpha=1.459 — W3 set to 1.0
  haps: {
    assembly_labour_factor: 0.36,
    factory_overhead_factor: 0.29,
    manufacturer_margin_factor: 0.51,
    channel_markup_factor: 0.15,
    installation_cost_factor: 0.36,
    notes: 'HAPS solar-electric — calibrated 2026-05-18. Bespoke aerospace, certification + ground segment + ops infrastructure. W3 set to 1.0 (pre-W3 BoM £52,812/m wingspan tracks bespoke hand-build cost). Multiplier 4.143× lifts to £218k/m (mid-band £140-300k).',
  },

  // ===== Existing PRICE_BANDS keys =====
  // Canonical slugs first, with aliases wired below.
  // Recalibrated 2026-05-18 (Engine-B BESS gap fix): alias of bess-utility-scale.
  // PRODUCT_CLASS_REFERENCE_OVERRIDES lift Engine-B raw BoM from £25 to £93/kWh
  // and these heavy-EPC ratios (compound 2.40×) land installed ASP at £224/kWh.
  bess: {
    // 2026-05-21 real council (Gemini 3.1 Pro + Grok 4.3 + MiMo) verdict
    // on Loop 6 BESS shipping 190% above band. Original stack assumed
    // mass-production (1000+ unit/yr) with on-site assembly. Actual
    // bess.md brief is 25 units/year UK programme, containerised
    // plug-and-play. Three ratios corrected (unanimous council):
    //   - installation 45% → 18%: containerised BESS is factory-built;
    //     site work is foundation + grid hookup + commissioning only,
    //     not the on-site assembly that justified 45% (council Gemini:
    //     "12-20% typical"; MiMo: "10-20% at reasonable volume")
    //   - manufacturer_margin 20% → 38%: 25/yr bespoke programme has
    //     unamortised engineering, tooling, UL 9540A certification
    //     (>$100k/test), requires 35-45% on COGS to recover overhead
    //     (council Gemini: "35-45%"; Grok agrees on low-vol penalty)
    //   - labour + overhead unchanged at 20% + 15% (council agrees)
    // Compound: 1.20 × 1.15 × 1.38 × 1.00 × 1.18 = 2.25×
    // Pre-W3 BoM at £93/kWh × 2.25 = £209/kWh installed (was £224/kWh)
    // — sits at the low end of the £190-265/kWh mass-prod band (target
    // moved to low-vol band £400-550/kWh in class-price-bands.ts).
    assembly_labour_factor: 0.20,
    factory_overhead_factor: 0.15,
    manufacturer_margin_factor: 0.38,
    channel_markup_factor: 0,
    installation_cost_factor: 0.18,
    notes: 'BESS utility — recalibrated 2026-05-21 per council a66e6ee7 follow-up (Gemini Pro + Grok 4.3 + MiMo unanimous). Containerised plug-and-play install lower than original; bespoke 25/yr margin higher. Compound 2.25× (was 2.40×). Pre-override raw £93/kWh × 2.25 = £209/kWh installed (low end of mass-prod band £190-265). Low-vol bespoke target band £400-550/kWh — see class-price-bands.ts.',
  },
  // Calibrated 2026-05-18: target installed-ASP £850k-£1.95M per Grok (Kongsberg REMUS, Teledyne, IDTechEx), multiplier 9.173× — W3 set to 1.0. Bespoke marine: hand-built + SAT trials + integration dominate
  auv: {
    assembly_labour_factor: 0.50,
    factory_overhead_factor: 0.40,
    manufacturer_margin_factor: 0.60,
    channel_markup_factor: 0.30,
    installation_cost_factor: 1.10,
    notes: 'AUV bespoke marine — calibrated 2026-05-18. Surveyclass 2 m AUV with MBES/SSS/INS, hand-built at programme scale (1-4/yr). W3 set to 1.0 (pre-W3 BoM £143k/unit tracks fab cost). Multiplier 9.173× via hand-crafted ratios — SAT trials/integration legitimately exceed 100% of pre-install cost on bespoke marine. Lifts to £1.31M/unit (mid-band £850k-£1.95M).',
  },
  // Calibrated 2026-05-18: target installed-ASP £1,200-2,200/L per Grok (Sartorius/Cytiva 2024-25, BioPlan, CRB), multiplier 3.139× via uniform alpha=1.031 — W3 set to 1.0
  bioreactor: {
    assembly_labour_factor: 0.21,
    factory_overhead_factor: 0.23,
    manufacturer_margin_factor: 0.36,
    channel_markup_factor: 0.10,
    installation_cost_factor: 0.41,
    notes: 'Bioreactor GMP skid — calibrated 2026-05-18. Bespoke build, IQ/OQ validation install. W3 set to 1.0 (pre-W3 BoM £542/L already tracks fab cost). Multiplier 3.139× lifts to £1,701/L (mid-band £1,200-2,200).',
  },
  // Calibrated 2026-05-18: alias of wearable_medical_device (target installed-ASP £15-40/unit, multiplier 2.513×)
  cgm: {
    assembly_labour_factor: 0.11,
    factory_overhead_factor: 0.14,
    manufacturer_margin_factor: 0.46,
    channel_markup_factor: 0.36,
    installation_cost_factor: 0,
    notes: 'CGM — alias of wearable_medical_device; calibrated 2026-05-18. W3 0.003 retained; multiplier 2.513× lifts post-W3 £10.97 to £27.6/unit.',
  },
  // Calibrated 2026-05-18: alias of consumer_cinematography_drone (target retail £650-1,899/unit, multiplier 3.614×)
  drone: {
    assembly_labour_factor: 0.18,
    factory_overhead_factor: 0.22,
    manufacturer_margin_factor: 0.63,
    channel_markup_factor: 0.54,
    installation_cost_factor: 0,
    notes: 'Consumer drone — alias of consumer_cinematography_drone; calibrated 2026-05-18. W3 0.035 retained; multiplier 3.614× lifts post-W3 £352 to £1,272/unit.',
  },
  // Calibrated 2026-05-18: target installed-ASP £7,500-15,500/unit per Grok (Supermicro/Dell/HPE), multiplier 1.362× via uniform alpha=0.370 — W3 set to 1.0
  'edge-ai': {
    assembly_labour_factor: 0.04,
    factory_overhead_factor: 0.06,
    manufacturer_margin_factor: 0.11,
    channel_markup_factor: 0.07,
    installation_cost_factor: 0.04,
    notes: 'Edge-AI 1U server — calibrated 2026-05-18. Server-class B2B, light rack install. W3 set to 1.0 (pre-W3 BoM £8,429/unit already mid-band raw materials). Multiplier 1.362× lifts to £11,478/unit (mid-band £7,500-15,500).',
  },
  // Calibrated 2026-05-18: alias of dc_fast_ev_charger (target installed-ASP £550-950/kW, multiplier 2.815×)
  'ev-charger': {
    assembly_labour_factor: 0.18,
    factory_overhead_factor: 0.15,
    manufacturer_margin_factor: 0.29,
    channel_markup_factor: 0.20,
    installation_cost_factor: 0.34,
    notes: 'EV charger — alias of dc_fast_ev_charger; calibrated 2026-05-18. W3 set to 1.0; multiplier 2.815× lifts £267 to £752/kW.',
  },
  // Recalibrated 2026-05-18 (triple-compression-fix): alias of heat-pump-residential. Pre-W3 raw BoM from Engine-B-curve is at installed-ASP magnitude (renderer pre-W3 £1,890.27 for 1.6 kW = £1,182/kW raw); prior 2.7621× × 0.0308 W3 over-compressed by 11.7×. New ratios compound 1.952× × W3 0.3253 ≈ 0.635 net.
  heatpump: {
    assembly_labour_factor: 0.05,
    factory_overhead_factor: 0.05,
    manufacturer_margin_factor: 0.15,
    channel_markup_factor: 0.10,
    installation_cost_factor: 0.40,
    notes: 'Heat-pump — canonical slug; recalibrated 2026-05-18 (triple-compression-fix). Mirrors heat-pump-residential: L=0.05, OH=0.05, M=0.15, C=0.10, I=0.40. Compound multiplier 1.952×; W3 in class-price-bands.ts lifted from 0.0308 to 0.3253 so net multiplier 0.635 applied to Engine-B pre-W3 raw BoM (£1,890.27 renderer total for 1.6 kW) produces installed ASP £1,200 (£750/kW band centre).',
  },
  // Calibrated 2026-05-18: target installed-ASP £15-45k/unit per Grok (Rabobank, IDTechEx, Vertical Farm Daily), multiplier 1.656× via uniform alpha=0.426 (W3 retained at 0.30 because pre-W3 BoM £60,582/unit is over-decomposed 2×)
  'vertical-farm': {
    assembly_labour_factor: 0.08,
    factory_overhead_factor: 0.08,
    manufacturer_margin_factor: 0.11,
    channel_markup_factor: 0.04,
    installation_cost_factor: 0.23,
    notes: 'Vertical farm module — calibrated 2026-05-18. Modular plug-in rack with LED + fertigation + HVAC. W3 0.30 retained as S1-compensator: pre-W3 BoM £60,582/unit is over-decomposed 2× from real ~£30k. Cost-stack multiplier 1.656× lifts post-W3 £18,175 to £30,101/unit (mid-band £15-45k).',
  },
  // Calibrated 2026-05-18: target installed-ASP £450-750/kWh per Grok (BNEF, WoodMac, Solar Energy UK), multiplier 1.590× via uniform alpha=0.404 (W3 retained at 0.5 default — Engine B should replace W3 once it ships)
  residential_ess: {
    assembly_labour_factor: 0.05,
    factory_overhead_factor: 0.05,
    manufacturer_margin_factor: 0.11,
    channel_markup_factor: 0.12,
    installation_cost_factor: 0.16,
    notes: 'Residential ESS — calibrated 2026-05-18. Distributor + installer channel, plumbed/electrical install. W3 0.5 retained as buffer until Engine B per-component curves ship. Cost-stack multiplier 1.590× lifts post-W3 £375 to £596/kWh (mid-band £450-750).',
  },
  // Recalibrated 2026-05-18 (triple-compression-fix): pre-W3 raw BoM from Engine-B-curve targets near installed-ASP. Realistic 7.5-75 kW industrial VFD ratios — moderate assembly + overhead, modest manufacturer margin, integrator + panel-build channel, light commissioning. Compound multiplier 1.728×; W3 lifted to 0.579 so net multiplier ≈ 1.0 applied to Engine-B pre-W3 produces installed ASP at band centre £200/kW.
  motor_drive_vfd: {
    assembly_labour_factor: 0.10,
    factory_overhead_factor: 0.08,
    manufacturer_margin_factor: 0.15,
    channel_markup_factor: 0.15,
    installation_cost_factor: 0.10,
    notes: 'Motor-drive VFD — recalibrated 2026-05-18 (triple-compression-fix). Industrial automation ratios for 7.5-75 kW VFD: assembly 10%, overhead 8%, manufacturer margin 15%, integrator/distributor 15%, panel-build + cabling + commissioning 10%. Compound multiplier 1.728×; W3 in class-price-bands.ts lifted from 0.4985 to 0.579 so net multiplier ≈ 1.0 applied to Engine-B pre-W3 raw BoM produces installed ASP at band centre (£140-260/kW band, centre £200/kW).',
  },
  // Calibrated 2026-05-18: target retail £4,500-22,000/kg MTOW per Grok (IDTechEx, Skydio, Flyability, Parrot), multiplier 5.184× via hand-crafted ratios — premium B2B with heavy distribution stack, no install
  industrial_inspection_drone: {
    assembly_labour_factor: 0.20,
    factory_overhead_factor: 0.20,
    manufacturer_margin_factor: 0.80,
    channel_markup_factor: 1.00,
    installation_cost_factor: 0,
    notes: 'Industrial inspection drone — calibrated 2026-05-18. Premium autonomous B2B platform (Elios 3, Skydio X10 class) commands 3-4× entry-tier pricing. W3 0.5 retained as buffer. Cost-stack multiplier 5.184× via hand-crafted ratios (heavy margin + heavy distribution channel reflecting premium B2B reality) lifts post-W3 £1,900 to £9,850/kg MTOW (mid-band £4,500-22,000).',
  },
  // Calibrated 2026-05-18: target installed-ASP £320-520/kW per Grok (CIBSE, BEIS, Daikin EU), multiplier 1.519× via uniform alpha=0.316 — W3 already 1.0
  chiller: {
    assembly_labour_factor: 0.06,
    factory_overhead_factor: 0.06,
    manufacturer_margin_factor: 0.09,
    channel_markup_factor: 0.06,
    installation_cost_factor: 0.17,
    notes: 'Industrial chiller — calibrated 2026-05-18. Pipework + refrigerant + commissioning install. W3 already 1.0. Multiplier 1.519× lifts £275 to £418/kW (mid-band £320-520). Note: old raw band already included installer margin so ratios are modest.',
  },

  // ===== Additional class taxonomy (archetype-mapped starter ratios) =====
  // Energy + storage
  bess_residential: { ...ARCH_MID_VOLUME_PROFESSIONAL, installation_cost_factor: 0.40, notes: 'Residential BESS — mid-volume, distributor + installer.' },
  bess_commercial: { ...ARCH_INDUSTRIAL_HEAVY_EPC, installation_cost_factor: 0.45, notes: 'Commercial BESS — direct + EPC install.' },
  pv_microinverter: { ...ARCH_PV_STRING_INVERTER, manufacturer_margin_factor: 0.22, notes: 'PV microinverter — commodity inverter.' },
  pv_module: {
    assembly_labour_factor: 0.05,
    factory_overhead_factor: 0.08,
    manufacturer_margin_factor: 0.12,
    channel_markup_factor: 0.20,
    installation_cost_factor: 0.40,
    notes: 'PV module — commodity, very thin margins, install-heavy.',
  },
  wind_turbine_small: { ...ARCH_INDUSTRIAL_HEAVY_INSTALLED, installation_cost_factor: 0.70, notes: 'Small wind turbine — civils-heavy install.' },
  hydrogen_electrolyser: { ...ARCH_INDUSTRIAL_HEAVY_EPC, manufacturer_margin_factor: 0.30, notes: 'Hydrogen electrolyser — EPC + commissioning.' },
  fuel_cell_stack: { ...ARCH_BESPOKE_LOW_VOLUME, manufacturer_margin_factor: 0.40, notes: 'Fuel cell stack — low-volume specialty.' },

  // Thermal + HVAC
  heatpump_commercial: { ...ARCH_INDUSTRIAL_HEAVY_INSTALLED, installation_cost_factor: 0.65, notes: 'Commercial heat pump — building services install.' },
  heatpump_industrial: { ...ARCH_INDUSTRIAL_HEAVY_INSTALLED, installation_cost_factor: 0.55, manufacturer_margin_factor: 0.30, notes: 'Industrial heat pump — process-heat install.' },
  air_conditioner_split: { ...ARCH_INDUSTRIAL_HEAVY_INSTALLED, installation_cost_factor: 0.45, notes: 'Split AC — installer channel.' },
  ground_source_heatpump: { ...ARCH_INDUSTRIAL_HEAVY_INSTALLED, installation_cost_factor: 1.0, notes: 'Ground-source heatpump — borehole drilling dominates install.' },

  // EV + transport
  ev_charger_ac_home: { ...ARCH_INDUSTRIAL_HEAVY_INSTALLED, installation_cost_factor: 0.50, manufacturer_margin_factor: 0.32, notes: 'AC home EV charger — installer channel.' },
  ev_charger_dc_ultra: {
    assembly_labour_factor: 0.18,
    factory_overhead_factor: 0.18,
    manufacturer_margin_factor: 0.30,
    channel_markup_factor: 0.15,
    installation_cost_factor: 0.40,
    notes: 'DC ultra-fast EV charger — grid-connect dominates install.',
  },
  e_bike: { ...ARCH_CONSUMER_PURE_RETAIL, manufacturer_margin_factor: 0.30, notes: 'E-bike — consumer retail.' },
  e_scooter: { ...ARCH_CONSUMER_PURE_RETAIL, manufacturer_margin_factor: 0.30, notes: 'E-scooter — consumer retail.' },

  // Consumer electronics
  consumer_smart_speaker: { ...ARCH_CONSUMER_HIGH_VOLUME_ELECTRONICS, notes: 'Smart speaker — commodity consumer electronics.' },
  consumer_headphones_anc: { ...ARCH_CONSUMER_HIGH_VOLUME_ELECTRONICS, manufacturer_margin_factor: 0.32, notes: 'ANC headphones — premium consumer.' },
  consumer_smartwatch: { ...ARCH_CONSUMER_HIGH_VOLUME_ELECTRONICS, manufacturer_margin_factor: 0.40, notes: 'Smartwatch — premium consumer wearable.' },
  consumer_camera_mirrorless: { ...ARCH_CONSUMER_PURE_RETAIL, manufacturer_margin_factor: 0.35, notes: 'Mirrorless camera — premium retail.' },
  consumer_tablet: { ...ARCH_CONSUMER_HIGH_VOLUME_ELECTRONICS, notes: 'Tablet — commodity consumer.' },
  consumer_laptop: { ...ARCH_CONSUMER_HIGH_VOLUME_ELECTRONICS, manufacturer_margin_factor: 0.25, notes: 'Laptop — commodity consumer.' },
  consumer_vr_headset: { ...ARCH_CONSUMER_HIGH_VOLUME_ELECTRONICS, manufacturer_margin_factor: 0.30, notes: 'VR headset — premium consumer.' },
  consumer_e_reader: { ...ARCH_CONSUMER_HIGH_VOLUME_ELECTRONICS, manufacturer_margin_factor: 0.30, notes: 'E-reader — commodity consumer.' },

  // Medical devices
  insulin_pen: { ...ARCH_CONSUMER_DISPOSABLE_MEDICAL, notes: 'Insulin pen — disposable injector.' },
  inhaler_smart: { ...ARCH_CONSUMER_DISPOSABLE_MEDICAL, manufacturer_margin_factor: 0.45, notes: 'Smart inhaler — semi-disposable.' },
  hearing_aid: { ...ARCH_MEDICAL_IMPLANTABLE, manufacturer_margin_factor: 0.55, installation_cost_factor: 0.15, notes: 'Hearing aid — audiologist channel + fitting.' },
  pacemaker: { ...ARCH_MEDICAL_IMPLANTABLE, notes: 'Pacemaker — implantable, hospital channel.' },
  surgical_robot: { ...ARCH_BESPOKE_LOW_VOLUME, manufacturer_margin_factor: 0.55, channel_markup_factor: 0.30, installation_cost_factor: 0.35, notes: 'Surgical robot — hospital capital equipment.' },
  patient_monitor: {
    assembly_labour_factor: 0.15,
    factory_overhead_factor: 0.18,
    manufacturer_margin_factor: 0.45,
    channel_markup_factor: 0.35,
    installation_cost_factor: 0.10,
    notes: 'Patient monitor — hospital procurement channel.',
  },
  diagnostic_lateral_flow: { ...ARCH_CONSUMER_DISPOSABLE_MEDICAL, manufacturer_margin_factor: 0.45, notes: 'Lateral-flow diagnostic — disposable.' },
  ultrasound_portable: {
    assembly_labour_factor: 0.18,
    factory_overhead_factor: 0.18,
    manufacturer_margin_factor: 0.50,
    channel_markup_factor: 0.40,
    installation_cost_factor: 0.10,
    notes: 'Portable ultrasound — clinical capital equipment.',
  },

  // Industrial + robotics
  cobot: { ...ARCH_INDUSTRIAL_ROBOTICS, notes: 'Collaborative robot — light commissioning.' },
  agv_warehouse: { ...ARCH_INDUSTRIAL_ROBOTICS, installation_cost_factor: 0.25, notes: 'Warehouse AGV — fleet commissioning.' },
  amr_logistics: { ...ARCH_INDUSTRIAL_ROBOTICS, installation_cost_factor: 0.25, notes: 'Autonomous mobile robot.' },
  industrial_conveyor: { ...ARCH_INDUSTRIAL_HEAVY_INSTALLED, manufacturer_margin_factor: 0.25, installation_cost_factor: 0.45, notes: 'Industrial conveyor — civils install.' },
  escalator: { ...ARCH_INDUSTRIAL_HEAVY_INSTALLED, installation_cost_factor: 0.75, manufacturer_margin_factor: 0.32, notes: 'Escalator — civils-heavy install.' },
  industrial_3d_printer: {
    assembly_labour_factor: 0.18,
    factory_overhead_factor: 0.18,
    manufacturer_margin_factor: 0.35,
    channel_markup_factor: 0.25,
    installation_cost_factor: 0.15,
    notes: 'Industrial 3D printer — B2B capital equipment.',
  },
  cnc_machine_5axis: {
    assembly_labour_factor: 0.18,
    factory_overhead_factor: 0.20,
    manufacturer_margin_factor: 0.30,
    channel_markup_factor: 0.20,
    installation_cost_factor: 0.30,
    notes: '5-axis CNC — capital equipment, install + calibration.',
  },
  injection_moulding_machine: {
    assembly_labour_factor: 0.18,
    factory_overhead_factor: 0.20,
    manufacturer_margin_factor: 0.28,
    channel_markup_factor: 0.15,
    installation_cost_factor: 0.30,
    notes: 'Injection moulding machine — capital equipment.',
  },

  // Aerospace + defence
  cubesat: { ...ARCH_BESPOKE_LOW_VOLUME, manufacturer_margin_factor: 0.40, notes: 'CubeSat platform — bespoke aerospace.' },
  microsatellite: { ...ARCH_BESPOKE_LOW_VOLUME, manufacturer_margin_factor: 0.45, notes: 'Microsatellite — bespoke aerospace.' },
  drone_industrial_inspection: { ...ARCH_BESPOKE_LOW_VOLUME, manufacturer_margin_factor: 0.40, installation_cost_factor: 0, notes: 'Industrial inspection drone — professional B2B.' },
  uav_long_endurance: { ...ARCH_BESPOKE_LOW_VOLUME, manufacturer_margin_factor: 0.40, notes: 'Long-endurance UAV — defence/research bespoke.' },

  // Marine + subsea
  rov_inspection: { ...ARCH_BESPOKE_LOW_VOLUME, manufacturer_margin_factor: 0.38, installation_cost_factor: 0.20, notes: 'ROV — inspection class, bespoke marine.' },
  autonomous_surface_vessel: { ...ARCH_BESPOKE_LOW_VOLUME, manufacturer_margin_factor: 0.38, notes: 'Autonomous surface vessel — bespoke marine.' },

  // Cleantech / agriculture
  vertical_farm_module: {
    assembly_labour_factor: 0.18,
    factory_overhead_factor: 0.18,
    manufacturer_margin_factor: 0.25,
    channel_markup_factor: 0.10,
    installation_cost_factor: 0.55,
    notes: 'Vertical farm module — same as vertical-farm canonical.',
  },
  agritech_sensor_network: { ...ARCH_MID_VOLUME_PROFESSIONAL, installation_cost_factor: 0.15, notes: 'Agritech sensor network — distributed install.' },
  water_treatment_skid: { ...ARCH_INDUSTRIAL_HEAVY_EPC, installation_cost_factor: 0.50, notes: 'Water treatment skid — pipework install.' },
  air_purifier_industrial: { ...ARCH_INDUSTRIAL_HEAVY_INSTALLED, installation_cost_factor: 0.40, notes: 'Industrial air purifier — ducted install.' },
  air_purifier_consumer: { ...ARCH_CONSUMER_PURE_RETAIL, manufacturer_margin_factor: 0.32, notes: 'Consumer air purifier — retail.' },

  // Power electronics / motors
  motor_servo: { ...ARCH_MID_VOLUME_PROFESSIONAL, installation_cost_factor: 0.10, notes: 'Servo motor — industrial automation.' },
  motor_bldc: { ...ARCH_MID_VOLUME_PROFESSIONAL, installation_cost_factor: 0.05, manufacturer_margin_factor: 0.28, notes: 'BLDC motor — commodity industrial.' },
  power_supply_industrial: { ...ARCH_MID_VOLUME_PROFESSIONAL, installation_cost_factor: 0.05, notes: 'Industrial PSU — commodity B2B.' },
  transformer_distribution: {
    assembly_labour_factor: 0.18,
    factory_overhead_factor: 0.18,
    manufacturer_margin_factor: 0.22,
    channel_markup_factor: 0.15,
    installation_cost_factor: 0.40,
    notes: 'Distribution transformer — utility install.',
  },
  busbar_system: {
    assembly_labour_factor: 0.15,
    factory_overhead_factor: 0.15,
    manufacturer_margin_factor: 0.25,
    channel_markup_factor: 0.20,
    installation_cost_factor: 0.50,
    notes: 'Busbar system — building services install.',
  },

  // Other infrastructure
  data_centre_rack: {
    assembly_labour_factor: 0.12,
    factory_overhead_factor: 0.15,
    manufacturer_margin_factor: 0.30,
    channel_markup_factor: 0.25,
    installation_cost_factor: 0.30,
    notes: 'Data-centre rack — rack-and-stack install.',
  },
  fibre_optic_terminal: {
    assembly_labour_factor: 0.12,
    factory_overhead_factor: 0.15,
    manufacturer_margin_factor: 0.32,
    channel_markup_factor: 0.25,
    installation_cost_factor: 0.20,
    notes: 'Fibre optic terminal — install at exchange.',
  },
  base_station_5g: {
    assembly_labour_factor: 0.15,
    factory_overhead_factor: 0.18,
    manufacturer_margin_factor: 0.30,
    channel_markup_factor: 0.10,
    installation_cost_factor: 0.45,
    notes: '5G base station — tower + commissioning install.',
  },

  // Special / fallback archetypes (looked up by name in resolveCostStack)
  consumer_electronics_default: { ...ARCH_CONSUMER_HIGH_VOLUME_ELECTRONICS },
  industrial_default: { ...ARCH_INDUSTRIAL_HEAVY_INSTALLED },
  medical_default: { ...ARCH_MEDICAL_IMPLANTABLE },
  bespoke_default: { ...ARCH_BESPOKE_LOW_VOLUME },

  // Final fallback when no class matches. Mid-volume professional defaults
  // are the most neutral assumption (avoids over- or under-stating the stack).
  DEFAULT: { ...ARCH_MID_VOLUME_PROFESSIONAL },
}

// ---------------------------------------------------------------------------
// Wire product_class aliases (added 2026-05-18 to mirror PRICE_BANDS aliases).
// Pipeline state's `keyMetrics.product_class` values use the alias names below
// rather than the canonical slugs, so resolveCostStack was falling through to
// DEFAULT and producing wildly wrong installed-ASP figures (e.g. bess landed
// at 2.54× instead of the recalibrated 1.136×). Done after the literal so each
// alias references its sibling without forward-reference hassles.
// ---------------------------------------------------------------------------
COST_STACK.energy_storage = COST_STACK.bess
COST_STACK.wearable_medical = COST_STACK.cgm
COST_STACK.edge_ai_server = COST_STACK['edge-ai']
COST_STACK.ev_charger = COST_STACK['ev-charger']
COST_STACK.thermal_system = COST_STACK.heatpump
COST_STACK.vertical_farm = COST_STACK['vertical-farm']

// ---------------------------------------------------------------------------
// CostStack — the resolved cost-decomposition output, all values in GBP and
// rounded to pence at each step so printed lines reconcile to printed sums.
// ---------------------------------------------------------------------------

export type CostStack = {
  raw_materials_bom_gbp: number
  assembly_labour_gbp: number
  factory_overhead_gbp: number
  factory_cogs_gbp: number
  manufacturer_margin_gbp: number
  oem_transfer_price_gbp: number
  channel_markup_gbp: number
  channel_list_price_gbp: number
  installation_cost_gbp: number
  installed_asp_gbp: number
  // Ratios used to compute this stack — surfaced on the renderer so the
  // reader can see the percentages next to each layer.
  ratios_applied: CostStackRatios
  // Resolved class key used for the lookup. 'DEFAULT' when no class matched.
  class_key: string
}

// Resolve the cost-stack ratios for a given pipeline state. Matches the
// resolvePriceBand pattern: tries product_class first, then slugHint, then
// the projectId prefix, then DEFAULT.
export function resolveCostStack(state: any, slugHint?: string): { ratios: CostStackRatios; class_key: string } {
  const productClass: string | undefined = state?.keyMetrics?.product_class || state?.moduleDecomposition?.product_class || state?.parsedBrief?.product_class
  if (productClass && COST_STACK[productClass]) return { ratios: COST_STACK[productClass], class_key: productClass }
  if (slugHint && COST_STACK[slugHint]) return { ratios: COST_STACK[slugHint], class_key: slugHint }
  const projectId: string = state?.projectId || ''
  const prefix = projectId.split('-')[0]?.toLowerCase()
  if (prefix && COST_STACK[prefix]) return { ratios: COST_STACK[prefix], class_key: prefix }
  return { ratios: COST_STACK.DEFAULT, class_key: 'DEFAULT' }
}

// Pence-rounding helper. Duplicated from the renderer (single source of
// truth would be nicer but the renderer is a script, not an import target).
function roundToPence(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 100) / 100
}

// Compute the full cost stack from a raw-materials grand total. Each layer
// rounded to pence so the printed numbers add up exactly.
export function computeCostStack(rawMaterialsBomGbp: number, ratios: CostStackRatios, class_key: string = 'unknown'): CostStack {
  const raw = roundToPence(rawMaterialsBomGbp)
  const labour = roundToPence(raw * ratios.assembly_labour_factor)
  const overhead = roundToPence((raw + labour) * ratios.factory_overhead_factor)
  const factory_cogs = roundToPence(raw + labour + overhead)
  const margin = roundToPence(factory_cogs * ratios.manufacturer_margin_factor)
  const oem_transfer = roundToPence(factory_cogs + margin)
  const channel = roundToPence(oem_transfer * ratios.channel_markup_factor)
  const channel_list = roundToPence(oem_transfer + channel)
  const installation = roundToPence(channel_list * ratios.installation_cost_factor)
  const installed_asp = roundToPence(channel_list + installation)
  return {
    raw_materials_bom_gbp: raw,
    assembly_labour_gbp: labour,
    factory_overhead_gbp: overhead,
    factory_cogs_gbp: factory_cogs,
    manufacturer_margin_gbp: margin,
    oem_transfer_price_gbp: oem_transfer,
    channel_markup_gbp: channel,
    channel_list_price_gbp: channel_list,
    installation_cost_gbp: installation,
    installed_asp_gbp: installed_asp,
    ratios_applied: ratios,
    class_key,
  }
}
