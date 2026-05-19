/**
 * @file class-standards.ts — Per-product-class regulatory standards registry.
 *
 * Universal Principle (Tristan directive 2026-05-15): regulatory compliance
 * is class-universal, not BoM-derived. Standards are dictated by the product
 * class + jurisdiction + use case BEFORE the design exists. A sparse BoM
 * should not produce sparse compliance coverage — the standards drive what
 * must end up on the BoM, not the other way round.
 *
 * Sibling of class-floors.ts. The standalone §Compliance page reads from this
 * registry, NOT from word.modifier_characters.regulatory. Every class run
 * gets full compliance treatment regardless of how dense its BoM emission was.
 *
 * Entries are MANDATORY market-access standards by default — the minimum
 * subset every brief in this class must demonstrate compliance with for sale
 * into UK / EU / US markets. Class-extension lists (specialist standards for
 * niche use cases like marine vs aerial drones) can be layered later; this
 * file is the floor, not the ceiling.
 */

export type StandardCategory =
  | 'cell_safety'            // chemistry-level safety (cells, refrigerants, cleaning agents)
  | 'system_safety'          // assembled-product safety (UL/NFPA installation, machinery directive)
  | 'electrical'             // LVD, IEC 61140, grid-connection
  | 'emc'                    // electromagnetic compatibility
  | 'radio'                  // RED, FCC Part 15, ITU-R
  | 'environmental'          // RoHS, REACH, WEEE, EU 517/2014 F-gas
  | 'transport'              // UN 38.3, ADR, IATA DGR
  | 'lifecycle'              // ErP / ecodesign, end-of-life
  | 'quality_management'     // ISO 9001, ISO 13485, GMP, HACCP
  | 'functional_safety'      // IEC 61508, ISO 26262, DO-178C
  | 'software'               // IEC 62304, DO-178C, ASIL/SIL
  | 'usability'              // IEC 62366
  | 'risk_management'        // ISO 14971
  | 'data_protection'        // GDPR, HIPAA
  | 'sector_specific'        // catch-all for class-unique (food, marine, aviation, medical)

export type Jurisdiction = 'UK' | 'EU' | 'US' | 'global' | 'ISO' | 'IEC' | 'industry'

export interface RegulatoryStandard {
  /** Canonical short code as cited in industry (e.g. "IEC 62619", "UL 9540A"). */
  code: string
  /** Full title of the standard. */
  title: string
  /** Where the standard is enforced. */
  jurisdiction: Jurisdiction
  /** Functional category — drives section grouping in the rendered page. */
  category: StandardCategory
  /** True = required for legal market access in the jurisdiction; false = de-facto industry expectation. */
  mandatory: boolean
  /** Rough certification / test-house cost to first compliance, GBP, 2026 estimate. */
  typical_compliance_cost_gbp: number
  /** Rough lead time from test-house engagement to certificate, weeks. */
  typical_lead_time_weeks: number
  /** One-sentence explanation of WHY this applies to this class — used in §Compliance prose. */
  applies_because: string
}

export interface ClassStandards {
  product_class: string
  display_name: string
  /** Ordered list — render in declared order (typically: safety first, then electrical, EMC, environmental). */
  standards: RegulatoryStandard[]
  /** One-sentence compliance landscape summary for the rendered page introduction. */
  compliance_summary: string
}

// ─── Per-class standards data ──────────────────────────────────────────────

const ENERGY_STORAGE: ClassStandards = {
  product_class: 'energy_storage',
  display_name: 'Battery Energy Storage System (BESS)',
  compliance_summary: 'Stationary BESS compliance is driven by cell-level safety (IEC 62619), system-level thermal-runaway containment (UL 9540A + NFPA 855), and grid-connection requirements (G99 in UK / EN 50549 in EU). Transport of installed cells additionally requires UN 38.3.',
  standards: [
    { code: 'IEC 62619',     title: 'Secondary cells and batteries containing alkaline or other non-acid electrolytes — Safety requirements for stationary cells and batteries', jurisdiction: 'IEC',      category: 'cell_safety',     mandatory: true,  typical_compliance_cost_gbp: 18_000, typical_lead_time_weeks: 12, applies_because: 'Mandatory cell-level safety for any stationary Li-ion installation; tests internal short-circuit, overcharge, and thermal abuse on production cells.' },
    { code: 'UL 9540',       title: 'Standard for Energy Storage Systems and Equipment',                                                                                          jurisdiction: 'US',       category: 'system_safety',   mandatory: true,  typical_compliance_cost_gbp: 32_000, typical_lead_time_weeks: 18, applies_because: 'System-level certification — covers electrical, mechanical, and environmental safety of the entire BESS as installed. Required by US AHJs in most jurisdictions and cited as a marker of integrator quality globally (8/10 reference BESS products carry this).' },
    { code: 'UL 9540A',      title: 'Test Method for Evaluating Thermal Runaway Fire Propagation in Battery Energy Storage Systems',                                            jurisdiction: 'US',       category: 'system_safety',   mandatory: true,  typical_compliance_cost_gbp: 45_000, typical_lead_time_weeks: 20, applies_because: 'Standardised cell-to-module-to-installation thermal-runaway propagation test; AHJ-required in most US jurisdictions and increasingly cited in EU permits (10/10 reference BESS products carry this).' },
    { code: 'IEEE 1547',     title: 'Standard for Interconnection and Interoperability of Distributed Energy Resources with Associated Electric Power Systems Interfaces',     jurisdiction: 'US',       category: 'electrical',      mandatory: true,  typical_compliance_cost_gbp: 14_000, typical_lead_time_weeks: 12, applies_because: 'Grid-interconnection standard for distributed energy resources in North America. Mandated by utilities for any grid-tied BESS exporting to the grid (5/10 reference BESS products carry this).' },
    { code: 'NFPA 855',      title: 'Standard for the Installation of Stationary Energy Storage Systems',                                                                       jurisdiction: 'US',       category: 'system_safety',   mandatory: true,  typical_compliance_cost_gbp: 8_000,  typical_lead_time_weeks: 6,  applies_because: 'Defines installation clearances, fire suppression, and ventilation for stationary energy storage; referenced by most fire authorities globally.' },
    { code: 'UN 38.3',       title: 'Recommendations on the Transport of Dangerous Goods — Section 38.3 (Lithium Batteries)',                                                   jurisdiction: 'global',   category: 'transport',       mandatory: true,  typical_compliance_cost_gbp: 6_000,  typical_lead_time_weeks: 4,  applies_because: 'Required for international shipment of Li-ion cells/packs; covers altitude, vibration, shock, thermal cycling, external short-circuit.' },
    { code: 'UL 1973',       title: 'Standard for Batteries for Use in Stationary, Vehicle Auxiliary Power and Light Electric Rail (LER) Applications',                         jurisdiction: 'US',       category: 'cell_safety',     mandatory: false, typical_compliance_cost_gbp: 22_000, typical_lead_time_weeks: 14, applies_because: 'System-level battery safety certification frequently required by US utilities and insurance underwriters; complements IEC 62619 on cells.' },
    { code: 'IEC 62933',     title: 'Electrical Energy Storage (EES) Systems',                                                                                                   jurisdiction: 'IEC',      category: 'system_safety',   mandatory: false, typical_compliance_cost_gbp: 14_000, typical_lead_time_weeks: 10, applies_because: 'Emerging IEC system-level standard for EES; specifies terminology, planning, performance, safety. Required by some EU utility tenders.' },
    { code: 'G99 Issue 6',   title: 'Requirements for the connection of generation equipment in parallel with public distribution networks (UK)',                               jurisdiction: 'UK',       category: 'electrical',      mandatory: true,  typical_compliance_cost_gbp: 12_000, typical_lead_time_weeks: 16, applies_because: 'UK grid-connection compliance for inverters > 16 A per phase; sets protection settings, anti-islanding, and DNO approval process.' },
    { code: 'EN 50549',      title: 'Requirements for generating plants to be connected in parallel with distribution networks',                                                jurisdiction: 'EU',       category: 'electrical',      mandatory: true,  typical_compliance_cost_gbp: 11_000, typical_lead_time_weeks: 16, applies_because: 'EU equivalent of G99 for grid-paralleled generators; harmonised across member states for low- and medium-voltage connection.' },
    { code: 'BS EN 61439',   title: 'Low-voltage switchgear and controlgear assemblies',                                                                                        jurisdiction: 'EU',       category: 'electrical',      mandatory: true,  typical_compliance_cost_gbp: 9_000,  typical_lead_time_weeks: 8,  applies_because: 'Type-test requirement for internal LV switchgear, busbars, and AC distribution within the BESS enclosure.' },
    { code: 'RoHS 2011/65',  title: 'Restriction of Hazardous Substances Directive',                                                                                            jurisdiction: 'EU',       category: 'environmental',   mandatory: true,  typical_compliance_cost_gbp: 3_000,  typical_lead_time_weeks: 4,  applies_because: 'Restricts lead, mercury, cadmium, and other substances in electrical equipment placed on the EU market.' },
  ],
}

const HEATPUMP: ClassStandards = {
  product_class: 'thermal_system',
  display_name: 'Heat Pump',
  compliance_summary: 'Heat pump compliance is bounded by refrigerant regulation (EU 517/2014 F-gas — drives R290 adoption), pressure-equipment safety (PED 2014/68), and seasonal performance reporting (EN 14825). UK installation additionally requires MCS scheme certification for grant eligibility.',
  standards: [
    { code: 'EU 517/2014',         title: 'Regulation on fluorinated greenhouse gases (F-gas)',                                              jurisdiction: 'EU',      category: 'environmental',    mandatory: true,  typical_compliance_cost_gbp: 4_000,  typical_lead_time_weeks: 6,  applies_because: 'F-gas regulation caps HFC refrigerant quotas and drives propane (R290) adoption; charge limits dictate cell-level chemistry and sealing decisions.' },
    { code: 'PED 2014/68/EU',      title: 'Pressure Equipment Directive',                                                                    jurisdiction: 'EU',      category: 'system_safety',    mandatory: true,  typical_compliance_cost_gbp: 12_000, typical_lead_time_weeks: 10, applies_because: 'Refrigerant circuits exceed PED minimum-product-PS×V threshold; sets design code, NDT, and notified-body involvement.' },
    { code: 'MD 2006/42/EC',       title: 'Machinery Directive',                                                                             jurisdiction: 'EU',      category: 'system_safety',    mandatory: true,  typical_compliance_cost_gbp: 8_000,  typical_lead_time_weeks: 8,  applies_because: 'Mandatory CE-marking route for products with moving parts (compressor, fans); requires risk assessment and Declaration of Conformity.' },
    { code: 'BS EN 378',           title: 'Refrigerating systems and heat pumps — Safety and environmental requirements',                    jurisdiction: 'EU',      category: 'cell_safety',      mandatory: true,  typical_compliance_cost_gbp: 6_000,  typical_lead_time_weeks: 6,  applies_because: 'Refrigerant-system safety: charge limits per room volume, leak detection, ventilation. Particularly material for A3 refrigerants (R290).' },
    { code: 'BS EN 14825',         title: 'Air conditioners, liquid chilling packages and heat pumps — Testing and rating at part load conditions and calculation of seasonal performance', jurisdiction: 'EU', category: 'lifecycle',        mandatory: true,  typical_compliance_cost_gbp: 11_000, typical_lead_time_weeks: 12, applies_because: 'Seasonal Coefficient of Performance (SCOP) calculation method; required by EU ErP / UK MCS labelling.' },
    { code: 'BS EN 14511',         title: 'Air conditioners, liquid chilling packages and heat pumps for space heating and cooling — Terms, definitions, test conditions, test methods and requirements', jurisdiction: 'EU', category: 'lifecycle',        mandatory: true,  typical_compliance_cost_gbp: 9_000,  typical_lead_time_weeks: 10, applies_because: 'Rated-conditions performance test underlying nominal capacity and COP claims on data sheets.' },
    { code: 'ErP 2009/125/EC',     title: 'Energy-related Products Ecodesign Directive',                                                     jurisdiction: 'EU',      category: 'lifecycle',        mandatory: true,  typical_compliance_cost_gbp: 5_000,  typical_lead_time_weeks: 6,  applies_because: 'Sets minimum efficiency and labelling for energy-related products; lot 1/2 cover heat pumps.' },
    { code: 'EMC 2014/30/EU',      title: 'Electromagnetic Compatibility Directive',                                                         jurisdiction: 'EU',      category: 'emc',              mandatory: true,  typical_compliance_cost_gbp: 6_000,  typical_lead_time_weeks: 5,  applies_because: 'Inverter-driven compressors must demonstrate emissions and immunity compliance for CE marking.' },
    { code: 'MCS',                 title: 'Microgeneration Certification Scheme (UK)',                                                       jurisdiction: 'UK',      category: 'sector_specific',  mandatory: false, typical_compliance_cost_gbp: 6_500,  typical_lead_time_weeks: 8,  applies_because: 'UK installer + product certification required for Boiler Upgrade Scheme grant eligibility; de-facto mandatory for residential UK market.' },
    // 2026-05-19 firestorm iter-1: council (GPT-5.5 #13, #14, #15) flagged missing UK electrical-safety + product-specific MCS docs.
    { code: 'LVD 2014/35/EU',      title: 'Low Voltage Directive',                                                                          jurisdiction: 'EU',      category: 'electrical',       mandatory: true,  typical_compliance_cost_gbp: 5_000,  typical_lead_time_weeks: 4,  applies_because: '230 V inverter-driven appliance — Low Voltage Directive is mandatory CE-marking route. Pairs with IEC 60335-2-40 for heat-pump-specific safety.' },
    { code: 'BS EN 60335-1',       title: 'Household and similar electrical appliances — Safety — General requirements',                    jurisdiction: 'EU',      category: 'electrical',       mandatory: true,  typical_compliance_cost_gbp: 7_000,  typical_lead_time_weeks: 8,  applies_because: 'Mandatory product-safety baseline for any 230 V household appliance — covers creepage/clearance, abnormal-operation testing, protective earth continuity.' },
    { code: 'BS EN 60335-2-40',    title: 'Household and similar electrical appliances — Particular requirements for electrical heat pumps, air-conditioners and dehumidifiers', jurisdiction: 'EU', category: 'electrical',       mandatory: true,  typical_compliance_cost_gbp: 9_000,  typical_lead_time_weeks: 10, applies_because: 'Heat-pump-specific safety: refrigerant charge limits per occupied area for A3 (R290) systems, ignition-source assessment, sealed-system construction. Required for CE marking + MCS.' },
    { code: 'BS EN 12102-1',       title: 'Air conditioners, liquid chilling packages, heat pumps, process chillers and dehumidifiers with electrically driven compressors — Determination of the sound power level', jurisdiction: 'EU', category: 'lifecycle',        mandatory: true,  typical_compliance_cost_gbp: 4_500,  typical_lead_time_weeks: 4,  applies_because: 'Sound power declaration mandatory under ErP labelling + MCS 020 noise requirements for outdoor units.' },
    { code: 'MCS 020',             title: 'MCS Planning Standard — Permitted Development for installations of microgeneration equipment',    jurisdiction: 'UK',      category: 'sector_specific',  mandatory: false, typical_compliance_cost_gbp: 3_000,  typical_lead_time_weeks: 4,  applies_because: 'UK planning-permission permitted-development limit for noise: ≤42 dBA at 1 m from neighbour. Drives outdoor-unit acoustic design constraints (MCS 020 noise calculator).' },
    { code: 'MIS 3005',            title: 'MCS Installation Standard — Heat Pump Systems',                                                   jurisdiction: 'UK',      category: 'sector_specific',  mandatory: false, typical_compliance_cost_gbp: 0,     typical_lead_time_weeks: 0,  applies_because: 'UK installer competency + design-and-commissioning standard — referenced by product certification scope.' },
    { code: 'EESR 2016',           title: 'Electrical Equipment (Safety) Regulations 2016 (UK statutory)',                                   jurisdiction: 'UK',      category: 'electrical',       mandatory: true,  typical_compliance_cost_gbp: 0,     typical_lead_time_weeks: 0,  applies_because: 'UK statutory equivalent of LVD post-Brexit. UKCA marking route for UK-only market entry.' },
  ],
}

const VERTICAL_FARM: ClassStandards = {
  product_class: 'vertical_farm',
  display_name: 'Vertical Farm',
  compliance_summary: 'Vertical farm compliance combines food-safety regimes (HACCP, BRCGS) with machinery / electrical CE-marking and (for water-recirculating systems) WRAS approval. Organic certification (Soil Association / IFOAM) is optional but commercially material for premium produce.',
  standards: [
    { code: 'HACCP',               title: 'Hazard Analysis and Critical Control Points — Codex Alimentarius',                                jurisdiction: 'global',  category: 'sector_specific',  mandatory: true,  typical_compliance_cost_gbp: 8_000,  typical_lead_time_weeks: 10, applies_because: 'Mandatory hazard-based food safety system for any food business operator; covers irrigation water quality, post-harvest handling, sanitation regimes.' },
    { code: 'BRCGS Food Safety',   title: 'BRCGS Global Standard for Food Safety v9',                                                        jurisdiction: 'global',  category: 'quality_management', mandatory: false, typical_compliance_cost_gbp: 15_000, typical_lead_time_weeks: 16, applies_because: 'GFSI-recognised audit standard expected by UK / EU multiple retailers (Tesco, Sainsbury, M&S, Waitrose).' },
    { code: 'ISO 22000',           title: 'Food safety management systems',                                                                  jurisdiction: 'ISO',     category: 'quality_management', mandatory: false, typical_compliance_cost_gbp: 10_000, typical_lead_time_weeks: 12, applies_because: 'ISO-aligned food safety management framework; useful for B2B foodservice / export contracts.' },
    { code: 'EU 1169/2011',        title: 'Provision of food information to consumers',                                                       jurisdiction: 'EU',      category: 'sector_specific',  mandatory: true,  typical_compliance_cost_gbp: 2_000,  typical_lead_time_weeks: 2,  applies_because: 'Pack labelling rules: country of origin, allergens, nutrition declaration. Applies to all packed produce sold in EU/UK.' },
    { code: 'MD 2006/42/EC',       title: 'Machinery Directive',                                                                             jurisdiction: 'EU',      category: 'system_safety',    mandatory: true,  typical_compliance_cost_gbp: 7_000,  typical_lead_time_weeks: 8,  applies_because: 'Conveyors, lifts, automated harvesters classified as machinery; risk assessment + DoC required for CE marking.' },
    { code: 'LVD 2014/35/EU',      title: 'Low Voltage Directive',                                                                           jurisdiction: 'EU',      category: 'electrical',       mandatory: true,  typical_compliance_cost_gbp: 5_000,  typical_lead_time_weeks: 6,  applies_because: 'Mains-powered LED grow lights, pumps, control cabinets fall in 50-1000 V AC LVD scope.' },
    { code: 'EMC 2014/30/EU',      title: 'Electromagnetic Compatibility Directive',                                                         jurisdiction: 'EU',      category: 'emc',              mandatory: true,  typical_compliance_cost_gbp: 6_000,  typical_lead_time_weeks: 5,  applies_because: 'Inverter-driven LED drivers and motor controllers must demonstrate emissions and immunity for CE marking.' },
    { code: 'WRAS',                title: 'Water Regulations Approval Scheme (UK)',                                                          jurisdiction: 'UK',      category: 'sector_specific',  mandatory: true,  typical_compliance_cost_gbp: 4_500,  typical_lead_time_weeks: 8,  applies_because: 'UK regulatory approval required for fittings and materials in direct contact with potable water; relevant for fertigation manifolds and reservoir interfaces.' },
    { code: 'RoHS 2011/65',        title: 'Restriction of Hazardous Substances Directive',                                                   jurisdiction: 'EU',      category: 'environmental',    mandatory: true,  typical_compliance_cost_gbp: 3_000,  typical_lead_time_weeks: 4,  applies_because: 'LED fixtures and electronic controllers placed on the EU market must comply with substance restrictions.' },
    { code: 'IP54',                title: 'Ingress protection rating per IEC 60529 — IP54 (dust-protected, splash-proof)',                  jurisdiction: 'IEC',     category: 'environmental',    mandatory: false, typical_compliance_cost_gbp: 2_500,  typical_lead_time_weeks: 3,  applies_because: 'High-humidity grow-room environments and overhead fertigation require IP54 minimum on luminaires, drivers, and electrical enclosures. 5/10 reference vertical farms (Infarm, Plenty, Vertical Future, AeroFarms, GrowUp) cite IP54 explicitly.' },
  ],
}

const EV_CHARGER: ClassStandards = {
  product_class: 'ev_charger',
  display_name: 'Electric Vehicle Charger',
  compliance_summary: 'EV charger compliance covers conductive charging system safety (IEC 61851), vehicle-coupler interoperability (IEC 62196), grid interaction (EN 50549), open communication protocols (OCPP), and (for public-pay installations) metering accuracy regulations (UK SMM / EU MID).',
  standards: [
    { code: 'IEC 61851-1',         title: 'Electric vehicle conductive charging system — Part 1: General requirements',                       jurisdiction: 'IEC',     category: 'system_safety',    mandatory: true,  typical_compliance_cost_gbp: 14_000, typical_lead_time_weeks: 12, applies_because: 'Foundation safety standard for AC and DC conductive charging; defines charging modes, protection coordination, control pilot.' },
    { code: 'IEC 61851-21-2',      title: 'EV requirements for conductive connection to an AC/DC supply — EMC requirements for off-board EV charging systems', jurisdiction: 'IEC', category: 'emc',              mandatory: true,  typical_compliance_cost_gbp: 9_000,  typical_lead_time_weeks: 8,  applies_because: 'EMC test regime specific to charger off-board emissions and immunity — supersedes generic EMC 2014/30 for chargers > 22 kW.' },
    { code: 'IEC 62196',           title: 'Plugs, socket-outlets, vehicle connectors and vehicle inlets — Conductive charging of electric vehicles', jurisdiction: 'IEC', category: 'system_safety',    mandatory: true,  typical_compliance_cost_gbp: 8_000,  typical_lead_time_weeks: 6,  applies_because: 'Mandates Type 2 / CCS Combo 2 connector geometry, pin assignment, current ratings; market-access prerequisite in EU/UK.' },
    { code: 'OCPP 2.0.1',          title: 'Open Charge Point Protocol',                                                                       jurisdiction: 'industry', category: 'sector_specific', mandatory: false, typical_compliance_cost_gbp: 6_000,  typical_lead_time_weeks: 4,  applies_because: 'De-facto industry standard for charger-to-network back-office communication; mandated by UK Public Charge Point Regulations 2023.' },
    { code: 'BS EN 17186',         title: 'Identification of vehicles and infrastructures — Graphical expression for consumer information on EV power supply', jurisdiction: 'EU', category: 'sector_specific', mandatory: true,  typical_compliance_cost_gbp: 1_500,  typical_lead_time_weeks: 2,  applies_because: 'Mandatory on-charger graphical labelling of supported vehicle types and power levels (the AC/DC/Combo pictograms).' },
    { code: 'EN 50549',            title: 'Requirements for generating plants to be connected in parallel with distribution networks',         jurisdiction: 'EU',      category: 'electrical',       mandatory: true,  typical_compliance_cost_gbp: 11_000, typical_lead_time_weeks: 16, applies_because: 'Applies to V2G / bidirectional chargers; sets protection settings, anti-islanding, DNO approval for export.' },
    { code: 'EMC 2014/30/EU',      title: 'Electromagnetic Compatibility Directive',                                                          jurisdiction: 'EU',      category: 'emc',              mandatory: true,  typical_compliance_cost_gbp: 6_000,  typical_lead_time_weeks: 5,  applies_because: 'Switch-mode power converters at AC charger input and DC charger output must demonstrate emissions and immunity for CE marking.' },
    { code: 'UK SMM Reg 2007',     title: 'Measuring Instruments (Active electrical energy meters) Regulations',                              jurisdiction: 'UK',      category: 'sector_specific',  mandatory: true,  typical_compliance_cost_gbp: 7_000,  typical_lead_time_weeks: 10, applies_because: 'Public-pay chargers in UK must use MID-Class B (≥1 % accuracy) embedded meters; affects shunt selection and ADC chain.' },
    { code: 'IP54 / IP65',         title: 'Ingress protection ratings per IEC 60529',                                                         jurisdiction: 'IEC',     category: 'environmental',    mandatory: true,  typical_compliance_cost_gbp: 2_500,  typical_lead_time_weeks: 3,  applies_because: 'Outdoor chargers must achieve IP54 minimum (IP65 recommended); drives enclosure sealing, connector cap, cable-gland selection.' },
  ],
}

const CGM: ClassStandards = {
  product_class: 'wearable_medical',
  display_name: 'Continuous Glucose Monitor (CGM)',
  compliance_summary: 'CGMs are Class IIb in-vitro diagnostic medical devices under EU IVDR 2017/746 (FDA Class III equivalent). Compliance is heavyweight: full QMS (ISO 13485), risk-management (ISO 14971), software lifecycle (IEC 62304), and clinical performance evidence (ISO 15197 for glucose accuracy).',
  standards: [
    { code: 'EU IVDR 2017/746',    title: 'In Vitro Diagnostic Medical Devices Regulation',                                                  jurisdiction: 'EU',      category: 'sector_specific',  mandatory: true,  typical_compliance_cost_gbp: 280_000, typical_lead_time_weeks: 60, applies_because: 'Class IIb medical-device-grade conformity assessment with notified-body involvement; covers performance evaluation, post-market surveillance.' },
    { code: 'FDA 510(k) / PMA',    title: 'US Premarket Notification (510(k)) or Premarket Approval (PMA) for in vitro diagnostic devices',  jurisdiction: 'US',      category: 'sector_specific',  mandatory: true,  typical_compliance_cost_gbp: 220_000, typical_lead_time_weeks: 78, applies_because: 'US market access for CGMs requires either substantial equivalence (510(k)) or full clinical PMA depending on intended use and predicate.' },
    { code: 'ISO 13485',           title: 'Medical devices — Quality management systems — Requirements for regulatory purposes',             jurisdiction: 'ISO',     category: 'quality_management', mandatory: true,  typical_compliance_cost_gbp: 45_000,  typical_lead_time_weeks: 24, applies_because: 'Mandatory QMS for any medical device manufacturer marketing in EU/UK/Canada; covers design-control file, supplier management, complaint handling.' },
    { code: 'ISO 14971',           title: 'Medical devices — Application of risk management to medical devices',                              jurisdiction: 'ISO',     category: 'risk_management',  mandatory: true,  typical_compliance_cost_gbp: 12_000,  typical_lead_time_weeks: 8,  applies_because: 'Required risk-management process across product lifecycle; output (risk-management file) is reviewed by notified body.' },
    { code: 'IEC 62304',           title: 'Medical device software — Software life cycle processes',                                          jurisdiction: 'IEC',     category: 'software',         mandatory: true,  typical_compliance_cost_gbp: 35_000,  typical_lead_time_weeks: 16, applies_because: 'CGMs include Class B/C medical software (sensor firmware + companion app); IEC 62304 lifecycle processes apply.' },
    { code: 'IEC 62366-1',         title: 'Medical devices — Application of usability engineering to medical devices',                       jurisdiction: 'IEC',     category: 'usability',        mandatory: true,  typical_compliance_cost_gbp: 18_000,  typical_lead_time_weeks: 12, applies_because: 'Patient-facing devices must demonstrate human-factors / use-error analysis; formative + summative usability validation required.' },
    { code: 'ISO 15197',           title: 'In vitro diagnostic test systems — Requirements for blood-glucose monitoring systems',             jurisdiction: 'ISO',     category: 'sector_specific',  mandatory: true,  typical_compliance_cost_gbp: 60_000,  typical_lead_time_weeks: 28, applies_because: 'Glucose-accuracy reference standard; FDA and EU notified bodies expect ≥95 % within ±15 mg/dL of reference.' },
    { code: 'IEC 60601-1',         title: 'Medical electrical equipment — General requirements for basic safety and essential performance',   jurisdiction: 'IEC',     category: 'electrical',       mandatory: true,  typical_compliance_cost_gbp: 22_000,  typical_lead_time_weeks: 14, applies_because: 'Patient-contact electrical safety: isolation, leakage currents, mechanical integrity. Applies to body-worn transmitter / reader.' },
    { code: 'BLE / IEEE 11073',    title: 'Personal Health Device Communication',                                                             jurisdiction: 'industry', category: 'sector_specific', mandatory: false, typical_compliance_cost_gbp: 8_000,   typical_lead_time_weeks: 6,  applies_because: 'Wearable-to-phone BLE profile for personal health devices; required for major-platform interoperability (Apple Health, Google Fit).' },
    { code: 'GDPR / HIPAA',        title: 'EU General Data Protection Regulation / US Health Insurance Portability and Accountability Act',   jurisdiction: 'EU',      category: 'data_protection',  mandatory: true,  typical_compliance_cost_gbp: 15_000,  typical_lead_time_weeks: 10, applies_because: 'Glucose data is sensitive health-data category 9 (GDPR) and PHI (HIPAA); affects cloud architecture, retention, consent flow.' },
  ],
}

const DRONE: ClassStandards = {
  product_class: 'drone',
  display_name: 'Unmanned Aerial Vehicle (Drone)',
  compliance_summary: 'Civil drone compliance hinges on the EU Regulation 2019/945 (technical) + 2019/947 (operational) framework — equivalent UK CAA CAP 722 in the UK. Class identification (C0-C6) drives mass, speed, geo-awareness, and Remote ID requirements. Serial production requires CE marking and notified-body involvement for C5/C6.',
  standards: [
    { code: 'EU 2019/945',         title: 'Commission Delegated Regulation on unmanned aircraft systems and on third-country operators of unmanned aircraft systems', jurisdiction: 'EU',   category: 'sector_specific',  mandatory: true,  typical_compliance_cost_gbp: 25_000, typical_lead_time_weeks: 18, applies_because: 'Technical requirements for UAS classes C0-C6 including mass limits, geo-awareness, Remote ID, low-power consumption mode, audible signals.' },
    { code: 'EU 2019/947',         title: 'Commission Implementing Regulation on the rules and procedures for the operation of unmanned aircraft',                    jurisdiction: 'EU',   category: 'sector_specific',  mandatory: true,  typical_compliance_cost_gbp: 6_000,  typical_lead_time_weeks: 6,  applies_because: 'Operational framework (Open / Specific / Certified categories) that pilots and operators must follow; product class determines available categories.' },
    { code: 'CAP 722',             title: 'Unmanned Aircraft System Operations in UK Airspace — UK CAA',                                                              jurisdiction: 'UK',   category: 'sector_specific',  mandatory: true,  typical_compliance_cost_gbp: 5_000,  typical_lead_time_weeks: 6,  applies_because: 'UK CAA operational and airworthiness guidance for UAS; mirrors EU framework but with UK-specific operational permission process (PfCO / OA).' },
    { code: 'ASTM F3411',          title: 'Standard Specification for Remote ID and Tracking',                                                                        jurisdiction: 'global', category: 'radio',           mandatory: true,  typical_compliance_cost_gbp: 8_000,  typical_lead_time_weeks: 6,  applies_because: 'Remote ID broadcast (direct or network) required by EU 2019/945 from January 2024 and FAA Part 89 in US.' },
    { code: 'RED 2014/53/EU',      title: 'Radio Equipment Directive',                                                                                                 jurisdiction: 'EU',   category: 'radio',           mandatory: true,  typical_compliance_cost_gbp: 12_000, typical_lead_time_weeks: 10, applies_because: 'Telemetry, video downlink, and GNSS receivers fall under RED; covers spectrum, harmonised standards EN 300 328 (2.4 GHz) / EN 301 893 (5 GHz).' },
    { code: 'MD 2006/42/EC',       title: 'Machinery Directive',                                                                                                       jurisdiction: 'EU',   category: 'system_safety',   mandatory: true,  typical_compliance_cost_gbp: 7_000,  typical_lead_time_weeks: 8,  applies_because: 'Rotating propellers + powertrain bring drones under the Machinery Directive; risk assessment and DoC required for CE marking.' },
    { code: 'IP rating',           title: 'Ingress protection ratings per IEC 60529',                                                                                  jurisdiction: 'IEC',  category: 'environmental',   mandatory: false, typical_compliance_cost_gbp: 2_000,  typical_lead_time_weeks: 3,  applies_because: 'Outdoor / all-weather drones typically target IP43 (light rain) or IP55 (driving rain + dust); drives motor sealing, vent design, electronics conformal coating.' },
    { code: 'DO-160G',             title: 'Environmental Conditions and Test Procedures for Airborne Equipment',                                                       jurisdiction: 'US',   category: 'environmental',   mandatory: false, typical_compliance_cost_gbp: 35_000, typical_lead_time_weeks: 20, applies_because: 'Certified-category UAS (C6 BVLOS, larger payloads) and any system interfacing with manned aviation require DO-160 environmental qualification.' },
    { code: 'RoHS / REACH',        title: 'EU substance restrictions',                                                                                                 jurisdiction: 'EU',   category: 'environmental',   mandatory: true,  typical_compliance_cost_gbp: 3_000,  typical_lead_time_weeks: 4,  applies_because: 'Standard EU substance restrictions for electronics + materials.' },
  ],
}

const EDGE_AI: ClassStandards = {
  product_class: 'edge_ai_server',
  display_name: 'Edge AI Compute Module',
  compliance_summary: 'Edge AI compliance depends heavily on the deployment domain — generic CE marking (LVD + EMC + RED for wireless) is the floor. Safety-critical industrial deployments add IEC 61508 (functional safety); vision-enabled products with personal data add GDPR. The EU AI Act (high-risk classification) applies if the model output drives consequential decisions.',
  standards: [
    { code: 'LVD 2014/35/EU',      title: 'Low Voltage Directive',                                                                                                     jurisdiction: 'EU',   category: 'electrical',      mandatory: true,  typical_compliance_cost_gbp: 5_000,  typical_lead_time_weeks: 6,  applies_because: 'Modules with mains-input PSUs (or embedded mains modules) fall under LVD; isolation, creepage, clearance requirements.' },
    { code: 'EMC 2014/30/EU',      title: 'Electromagnetic Compatibility Directive',                                                                                  jurisdiction: 'EU',   category: 'emc',             mandatory: true,  typical_compliance_cost_gbp: 6_000,  typical_lead_time_weeks: 5,  applies_because: 'Switch-mode regulators and high-speed digital interfaces require emissions / immunity testing for CE marking.' },
    { code: 'RED 2014/53/EU',      title: 'Radio Equipment Directive',                                                                                                jurisdiction: 'EU',   category: 'radio',           mandatory: true,  typical_compliance_cost_gbp: 12_000, typical_lead_time_weeks: 10, applies_because: 'Built-in Wi-Fi / Bluetooth / LTE / 5G modules trigger RED — typically delegated via certified-module re-use but still requires test-report integration.' },
    { code: 'RoHS 2011/65',        title: 'Restriction of Hazardous Substances Directive',                                                                            jurisdiction: 'EU',   category: 'environmental',   mandatory: true,  typical_compliance_cost_gbp: 3_000,  typical_lead_time_weeks: 4,  applies_because: 'Standard substance restrictions for electronic equipment placed on the EU market.' },
    { code: 'REACH 1907/2006',     title: 'Registration, Evaluation, Authorisation and Restriction of Chemicals',                                                     jurisdiction: 'EU',   category: 'environmental',   mandatory: true,  typical_compliance_cost_gbp: 3_500,  typical_lead_time_weeks: 6,  applies_because: 'SVHC declaration required for any article > 0.1 % by mass; covers solder, PCB laminate, casing plastics.' },
    { code: 'WEEE 2012/19/EU',     title: 'Waste Electrical and Electronic Equipment Directive',                                                                      jurisdiction: 'EU',   category: 'lifecycle',       mandatory: true,  typical_compliance_cost_gbp: 2_500,  typical_lead_time_weeks: 4,  applies_because: 'End-of-life producer responsibility — registration with national WEEE scheme and crossed-out wheelie-bin marking.' },
    { code: 'IEC 61508',           title: 'Functional safety of electrical/electronic/programmable electronic safety-related systems',                                jurisdiction: 'IEC',  category: 'functional_safety', mandatory: false, typical_compliance_cost_gbp: 65_000, typical_lead_time_weeks: 32, applies_because: 'Required for SIL-rated industrial / process control deployments; affects hardware diagnostic coverage and software development methodology.' },
    { code: 'EU AI Act 2024/1689', title: 'Regulation on Artificial Intelligence',                                                                                    jurisdiction: 'EU',   category: 'sector_specific', mandatory: true,  typical_compliance_cost_gbp: 35_000, typical_lead_time_weeks: 20, applies_because: 'Applies if AI output drives consequential decisions (high-risk categories); requires risk-management system, data-quality records, transparency, human oversight, post-market monitoring.' },
    { code: 'GDPR',                title: 'General Data Protection Regulation',                                                                                       jurisdiction: 'EU',   category: 'data_protection', mandatory: true,  typical_compliance_cost_gbp: 12_000, typical_lead_time_weeks: 8,  applies_because: 'Vision / audio capture of identifiable individuals constitutes personal-data processing; affects on-device retention, encryption, and DPIA obligation.' },
    { code: 'DMTF Redfish',        title: 'Redfish — RESTful out-of-band management API specification (DMTF DSP0266)',                                                jurisdiction: 'industry', category: 'sector_specific', mandatory: false, typical_compliance_cost_gbp: 4_000, typical_lead_time_weeks: 4, applies_because: 'De-facto out-of-band management protocol for modern server-class compute (replaces IPMI). 5/9 reference edge-AI servers cite Redfish support; enterprise procurement contracts increasingly mandate it.' },
    { code: 'IPMI 2.0',            title: 'Intelligent Platform Management Interface specification v2.0',                                                              jurisdiction: 'industry', category: 'sector_specific', mandatory: false, typical_compliance_cost_gbp: 2_500, typical_lead_time_weeks: 3, applies_because: 'Long-standing out-of-band management interface for server hardware (BMC). 4/9 reference edge-AI servers cite IPMI; still required for legacy datacentre integration alongside Redfish.' },
  ],
}

const BIOREACTOR: ClassStandards = {
  product_class: 'bioreactor',
  display_name: 'Bioreactor',
  compliance_summary: 'Bioreactor compliance is GMP-led (EU GMP Annex 1 for sterile manufacture, ICH Q7 for APIs, 21 CFR Part 211 in the US) with overlay safety standards (PED, MD, LVD/EMC). Single-use systems add BPSA leachables/extractables expectations; therapeutic applications add EU MDR/IVDR or biopharma-specific guidance.',
  standards: [
    { code: 'EU GMP Vol 4',        title: 'EU Good Manufacturing Practice — Annex 1 (Sterile Medicinal Products)',                                                    jurisdiction: 'EU',   category: 'quality_management', mandatory: true,  typical_compliance_cost_gbp: 80_000, typical_lead_time_weeks: 36, applies_because: 'Aseptic-process bioreactors fall under Annex 1 contamination-control strategy; drives single-use vs CIP/SIP architecture and environmental classification.' },
    { code: 'ICH Q7',              title: 'Good Manufacturing Practice for Active Pharmaceutical Ingredients',                                                        jurisdiction: 'global', category: 'quality_management', mandatory: true, typical_compliance_cost_gbp: 60_000, typical_lead_time_weeks: 24, applies_because: 'API manufacture — process validation, change control, supplier qualification, batch records.' },
    { code: '21 CFR Part 211',     title: 'Current Good Manufacturing Practice for Finished Pharmaceuticals (US FDA)',                                                jurisdiction: 'US',   category: 'quality_management', mandatory: true,  typical_compliance_cost_gbp: 65_000, typical_lead_time_weeks: 30, applies_because: 'US equivalent of EU GMP for finished-dose manufacture; required for any product exported to US market.' },
    { code: '21 CFR Part 11',      title: 'Electronic Records; Electronic Signatures',                                                                                jurisdiction: 'US',   category: 'software',        mandatory: true,  typical_compliance_cost_gbp: 25_000, typical_lead_time_weeks: 16, applies_because: 'SCADA / batch-record electronic data systems must be audit-trailed and signature-controlled to FDA standard.' },
    { code: 'ISO 14644',           title: 'Cleanrooms and associated controlled environments',                                                                        jurisdiction: 'ISO',  category: 'sector_specific', mandatory: true,  typical_compliance_cost_gbp: 18_000, typical_lead_time_weeks: 12, applies_because: 'Defines particle-count classification (ISO 5/7/8) for the room around the bioreactor; drives HVAC, gowning, and qualification regime.' },
    { code: 'PED 2014/68/EU',      title: 'Pressure Equipment Directive',                                                                                              jurisdiction: 'EU',   category: 'system_safety',   mandatory: true,  typical_compliance_cost_gbp: 15_000, typical_lead_time_weeks: 12, applies_because: 'Stirred-tank vessels above PS×V threshold require PED conformity; affects vessel design code, weld inspection, relief device sizing.' },
    { code: 'MD 2006/42/EC',       title: 'Machinery Directive',                                                                                                       jurisdiction: 'EU',   category: 'system_safety',   mandatory: true,  typical_compliance_cost_gbp: 8_000,  typical_lead_time_weeks: 8,  applies_because: 'Agitator drives, peristaltic pumps, harvest systems classified as machinery — risk assessment and DoC for CE marking.' },
    { code: 'LVD + EMC + RoHS',    title: 'CE-marking electrical/EMC/substance baseline',                                                                              jurisdiction: 'EU',   category: 'electrical',      mandatory: true,  typical_compliance_cost_gbp: 12_000, typical_lead_time_weeks: 10, applies_because: 'Standard CE-marking trio for any electrical equipment placed on the EU market.' },
    { code: 'BPSA / BPOG SUS',     title: 'Bio-Process Systems Alliance / BioPhorum Operations Group — Single-Use Systems guidance',                                  jurisdiction: 'industry', category: 'sector_specific', mandatory: false, typical_compliance_cost_gbp: 22_000, typical_lead_time_weeks: 16, applies_because: 'Leachables / extractables, integrity testing, gamma-irradiation compatibility — de-facto industry expectations for single-use bioreactor systems.' },
    { code: 'ISO 13485',           title: 'Medical devices — Quality management systems — Requirements for regulatory purposes',                                       jurisdiction: 'ISO',     category: 'quality_management', mandatory: true, typical_compliance_cost_gbp: 45_000, typical_lead_time_weeks: 24, applies_because: 'Bioreactors used in medical-device or in-vitro diagnostic manufacture are scoped under ISO 13485; cited by 8/10 reference bioreactor systems (Sartorius, Cytiva, Thermo, Eppendorf, Merck) for therapeutic and IVD applications.' },
  ],
}

const AUV: ClassStandards = {
  product_class: 'auv',
  display_name: 'Autonomous Underwater Vehicle (AUV)',
  compliance_summary: 'AUV compliance is shaped by maritime jurisdiction (flag state + coastal state + IMO MEPC environmental), classification society rules (DNV / Lloyds Register / ABS), and survivor pressure-vessel codes. Acoustic emissions, biofouling release, and lithium-battery transport additionally apply.',
  standards: [
    { code: 'DNV-RU-NAUT',         title: 'DNV Rules for Classification — Naval (Naval Submarines / AUV class notation)',                                            jurisdiction: 'industry', category: 'sector_specific', mandatory: false, typical_compliance_cost_gbp: 80_000, typical_lead_time_weeks: 40, applies_because: 'Classification-society type approval is de-facto required for offshore-energy, defence, and survey operator procurement; covers pressure hull, electrical, control.' },
    { code: 'ISO 13628 series',    title: 'Petroleum and natural gas industries — Design and operation of subsea production systems',                                jurisdiction: 'ISO',  category: 'sector_specific', mandatory: false, typical_compliance_cost_gbp: 35_000, typical_lead_time_weeks: 24, applies_because: 'Subsea-intervention AUVs operating in offshore-energy environments must interface to ISO 13628 hardware (ROV interfaces, hot-stab tooling).' },
    { code: 'PED 2014/68/EU',      title: 'Pressure Equipment Directive',                                                                                              jurisdiction: 'EU',   category: 'system_safety',   mandatory: true,  typical_compliance_cost_gbp: 20_000, typical_lead_time_weeks: 14, applies_because: 'External pressure on the hull from operating depth qualifies it as pressure equipment — design code, NDT, and notified-body involvement required.' },
    { code: 'IMO MEPC',            title: 'International Maritime Organization — Marine Environment Protection Committee guidance (anti-fouling, biofouling, lubricants)', jurisdiction: 'global', category: 'environmental', mandatory: true,  typical_compliance_cost_gbp: 8_000,  typical_lead_time_weeks: 8,  applies_because: 'Biofouling-release control + restrictions on tributyltin / biocidal coatings; lubricant biodegradability for in-water systems.' },
    { code: 'UN 38.3',             title: 'Recommendations on the Transport of Dangerous Goods — Section 38.3 (Lithium Batteries)',                                  jurisdiction: 'global', category: 'transport',       mandatory: true,  typical_compliance_cost_gbp: 6_000,  typical_lead_time_weeks: 4,  applies_because: 'Required for shipment of large lithium battery packs; ADR/IATA/IMDG transport documentation depends on charge state and energy.' },
    { code: 'IP68 / IP69K',        title: 'Ingress protection per IEC 60529 / DIN 40050',                                                                              jurisdiction: 'IEC',  category: 'environmental',   mandatory: true,  typical_compliance_cost_gbp: 4_000,  typical_lead_time_weeks: 4,  applies_because: 'Submersible equipment requires demonstrated immersion rating — IP68 with explicit depth+duration spec; pressure-balanced oil-filled enclosures common.' },
    { code: 'MIL-STD-461',         title: 'Requirements for the Control of Electromagnetic Interference Characteristics of Subsystems and Equipment',                jurisdiction: 'US',   category: 'emc',             mandatory: false, typical_compliance_cost_gbp: 22_000, typical_lead_time_weeks: 16, applies_because: 'Defence-customer AUVs and dual-use systems require MIL-STD-461 EMI compliance; commercial systems use EMC 2014/30 instead.' },
    { code: 'EMC 2014/30/EU',      title: 'Electromagnetic Compatibility Directive',                                                                                  jurisdiction: 'EU',   category: 'emc',             mandatory: true,  typical_compliance_cost_gbp: 6_000,  typical_lead_time_weeks: 5,  applies_because: 'Surface-side support equipment (launch/recovery, control consoles, charging) requires CE marking.' },
    { code: 'IEC 61508',           title: 'Functional safety of electrical/electronic/programmable electronic safety-related systems',                                jurisdiction: 'IEC',  category: 'functional_safety', mandatory: false, typical_compliance_cost_gbp: 60_000, typical_lead_time_weeks: 32, applies_because: 'Autonomous mission-critical control with safety implications (collision avoidance, depth limits) increasingly assessed against IEC 61508 by operators.' },
  ],
}

const HAPS: ClassStandards = {
  product_class: 'haps',
  display_name: 'High-Altitude Pseudo-Satellite (HAPS)',
  compliance_summary: 'HAPS compliance straddles aviation (FAA / EASA, ICAO Annex 8) and spectrum (ITU-R) regimes. Operating altitude (typically 18-25 km stratosphere) sits in a regulatory grey zone; bilateral national agreements + experimental airworthiness routes typical. Avionics-grade software (DO-178C) and environmental qualification (DO-160) are non-negotiable.',
  standards: [
    { code: 'ICAO Annex 8',        title: 'Airworthiness of Aircraft',                                                                                                jurisdiction: 'global', category: 'sector_specific', mandatory: true,  typical_compliance_cost_gbp: 120_000, typical_lead_time_weeks: 60, applies_because: 'International airworthiness baseline; HAPS classification (light-sport vs experimental vs special-purpose) determines required design verification.' },
    { code: 'EASA Special Conditions / FAA Experimental', title: 'EASA Special Conditions (e.g. SC-HAPS) / FAA Experimental Special Airworthiness Certificate',     jurisdiction: 'EU',   category: 'sector_specific', mandatory: true,  typical_compliance_cost_gbp: 180_000, typical_lead_time_weeks: 72, applies_because: 'No mature type-certification basis for HAPS yet; operators progress through special-condition / experimental routes bilaterally negotiated with each national CAA.' },
    { code: 'DO-178C',             title: 'Software Considerations in Airborne Systems and Equipment Certification',                                                  jurisdiction: 'US',   category: 'software',        mandatory: true,  typical_compliance_cost_gbp: 220_000, typical_lead_time_weeks: 64, applies_because: 'DAL-A through DAL-E software assurance levels per failure-condition severity; HAPS autopilot + redundancy management typically DAL-B.' },
    { code: 'DO-254',              title: 'Design Assurance Guidance for Airborne Electronic Hardware',                                                               jurisdiction: 'US',   category: 'functional_safety', mandatory: true, typical_compliance_cost_gbp: 90_000,  typical_lead_time_weeks: 40, applies_because: 'Complex airborne electronic hardware (FPGAs, ASICs) require design-assurance lifecycle parallel to DO-178C software.' },
    { code: 'DO-160G',             title: 'Environmental Conditions and Test Procedures for Airborne Equipment',                                                      jurisdiction: 'US',   category: 'environmental',   mandatory: true,  typical_compliance_cost_gbp: 65_000,  typical_lead_time_weeks: 28, applies_because: 'Comprehensive environmental qualification — temperature, altitude, vibration, fluid contamination, lightning, HIRF; stratospheric ops add specific thermal and pressure ranges.' },
    { code: 'ITU-R RR',            title: 'International Telecommunication Union — Radio Regulations',                                                                jurisdiction: 'global', category: 'radio',           mandatory: true,  typical_compliance_cost_gbp: 35_000,  typical_lead_time_weeks: 36, applies_because: 'Spectrum allocation for HAPS gateway and inter-HAPS links (e.g. 24.25-27.5 GHz, 31-31.3 GHz); ITU WRC-23 added new HAPS-specific bands.' },
    { code: 'CAA CAP 722A',        title: 'Unmanned Aircraft System Operations in UK Airspace — Specific Category (UK)',                                              jurisdiction: 'UK',   category: 'sector_specific', mandatory: true,  typical_compliance_cost_gbp: 18_000,  typical_lead_time_weeks: 16, applies_because: 'UK operational permission for HAPS — typically Specific category with SAIL VI assessment for BVLOS / above-FL600 operations.' },
    { code: 'MIL-STD-461',         title: 'Requirements for the Control of Electromagnetic Interference Characteristics',                                             jurisdiction: 'US',   category: 'emc',             mandatory: false, typical_compliance_cost_gbp: 25_000,  typical_lead_time_weeks: 16, applies_because: 'Defence-customer HAPS additionally require MIL-STD-461 compliance.' },
    { code: 'UN 38.3',             title: 'Recommendations on the Transport of Dangerous Goods — Section 38.3 (Lithium Batteries)',                                  jurisdiction: 'global', category: 'transport',       mandatory: true,  typical_compliance_cost_gbp: 6_000,   typical_lead_time_weeks: 4,  applies_because: 'Stratospheric HAPS carry sizeable lithium batteries for night operation — transport-certification required.' },
    { code: 'ISO 9001',            title: 'Quality management systems — Requirements',                                                                                jurisdiction: 'ISO', category: 'quality_management', mandatory: false, typical_compliance_cost_gbp: 12_000, typical_lead_time_weeks: 16, applies_because: 'Foundational QMS expected by aerospace + defence procurement chains. 5/10 reference HAPS programmes cite ISO 9001 as a prerequisite for tier-1 customer pipelines (most progress to AS9100 once airworthiness work matures).' },
  ],
}

// ─── Registry ───────────────────────────────────────────────────────────────

export const CLASS_STANDARDS: Record<string, ClassStandards> = {
  energy_storage: ENERGY_STORAGE,
  thermal_system:       HEATPUMP,
  vertical_farm:  VERTICAL_FARM,
  ev_charger:     EV_CHARGER,
  wearable_medical:            CGM,
  drone:          DRONE,
  edge_ai_server:        EDGE_AI,
  bioreactor:     BIOREACTOR,
  auv:            AUV,
  haps:           HAPS,
}

// Map common display-name variants and synonyms to canonical class keys. The
// chain's moduleDecomposition.product_class is sometimes the canonical key
// (from product-classifier) and sometimes a display string the LLM picked
// ("Battery Energy Storage System (BESS)"). This resolver bridges both.
function resolveClassKey(productClass: string): string | null {
  if (CLASS_STANDARDS[productClass]) return productClass
  const lower = productClass.toLowerCase()
  // Direct canonical match (with case folding)
  for (const k of Object.keys(CLASS_STANDARDS)) {
    if (k.toLowerCase() === lower) return k
  }
  // Aliases / display-name → canonical
  const aliases: Array<[RegExp, string]> = [
    [/\b(bess|battery\s+energy\s+storage|energy\s+storage)\b/, 'energy_storage'],
    [/\b(heatpump|heat\s+pump|thermal\s+system|hvac)\b/, 'thermal_system'],
    [/\b(vertical\s+farm|indoor\s+farm|hydroponic)\b/, 'vertical_farm'],
    [/\b(ev[\s-]?charger|charging\s+station|charge\s+point)\b/, 'ev_charger'],
    [/\b(cgm|continuous\s+glucose|wearable\s+medical|patch\s+monitor)\b/, 'wearable_medical'],
    [/\b(drone|uav|quadcopter)\b/, 'drone'],
    [/\b(edge\s+ai|edge[-\s]?compute|inference\s+box)\b/, 'edge_ai_server'],
    [/\b(bioreactor|fermenter|cell[-\s]?culture)\b/, 'bioreactor'],
    [/\b(auv|underwater\s+vehicle|subsea)\b/, 'auv'],
    [/\b(haps|stratospheric|high[-\s]?altitude\s+platform)\b/, 'haps'],
  ]
  for (const [rx, key] of aliases) {
    if (rx.test(lower)) return key
  }
  return null
}

/** Get the standards block for a product class. Resolves display names + aliases. Falls back to empty stub. */
export function getClassStandards(productClass: string): ClassStandards {
  const key = resolveClassKey(productClass)
  if (key) return CLASS_STANDARDS[key]
  return {
    product_class: productClass,
    display_name: productClass,
    standards: [],
    compliance_summary: `No regulatory standards registered for product class "${productClass}". Add an entry to class-standards.ts to render the §Compliance section for this class.`,
  }
}

/**
 * Merge brief-declared standards (from parsedBrief.constraints.safety_standards)
 * into the class-registered list. Brief-declared standards win on annotation
 * conflicts (the brief author chose them deliberately) but are augmented with
 * the class-registered MANDATORY standards the brief omitted.
 *
 * Returns a unified, de-duplicated list keyed by canonical code.
 */
export function mergeBriefAndClassStandards(
  productClass: string,
  briefStandards: Array<{ standard?: string; code?: string; source_grade?: string; source?: string }> | null | undefined,
): RegulatoryStandard[] {
  const classBlock = getClassStandards(productClass)
  const byCode = new Map<string, RegulatoryStandard>()

  // Seed with class-registered standards
  for (const s of classBlock.standards) byCode.set(s.code, s)

  // Layer in brief-declared standards; if the brief names a code we already have,
  // keep the class entry (richer metadata) but bump confidence by annotating.
  for (const bs of briefStandards ?? []) {
    const code = (bs.code ?? bs.standard ?? '').trim()
    if (!code) continue
    if (byCode.has(code)) {
      // Already in registry — keep richer class entry as-is
      continue
    }
    // Unknown to registry — add as a brief-only entry with placeholder metadata
    byCode.set(code, {
      code,
      title: bs.standard ?? code,
      jurisdiction: 'industry',
      category: 'sector_specific',
      mandatory: true,                       // brief author explicitly listed it
      typical_compliance_cost_gbp: 0,        // unknown — surface for human review
      typical_lead_time_weeks: 0,
      applies_because: 'Declared in this product brief; awaiting universal-applicability review before being added to the standing class registry.',
    })
  }

  return Array.from(byCode.values())
}
