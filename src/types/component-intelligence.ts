/**
 * @file component-intelligence.ts
 *
 * @description Provenance wrapper and ComponentRef scaffold types for the ForgeOS
 * component intelligence pipeline (loop-26 prep).
 *
 * DECISION (2026-04-29, component-intel council synthesis):
 *   - GPT-5.5 + Qwen-as-GLM independently surfaced the same missing provenance
 *     shape — the only multi-seat consensus addition from the 6-frontier council.
 *   - Without provenance, ForgeOS treats hallucinated extractions as facts and
 *     cannot cite sources in the founder PDF.
 *   - ComponentRef scaffolds the FK to the future `component_intelligence` table
 *     (Phase B / separate terminal), baking the schema fixes identified by the
 *     council now rather than needing a disruptive migration when the table lands.
 *
 * THESE TYPES ARE ADDITIVE — no existing field shape is changed.
 *   - All fields added to BomPartRow, Regulatory, and supplier match types are
 *     OPTIONAL (provenance?: Provenance | null, componentRef?: ComponentRef | null).
 *   - No migration is needed today.
 *   - When componentRef is null, the PDF / Gate readers fall back to current
 *     Max-invented behaviour unchanged.
 *
 * @related
 *   - synthesis: ~/Downloads/forge-demos/component-intelligence-council-2026-04-29/synthesis.md
 *   - phase-B table: future migration src/supabase/migrations/*_component_intelligence.sql
 *   - BomPartRow: src/app/(platform)/the-forge-v2/projects/[id]/bom/bom-view.tsx
 *   - Regulatory (PDF): src/actions/export-project-pdf.tsx
 *   - CadLabSupplierMatch: src/actions/cad-lab-supplier-match.ts
 */

// ---------------------------------------------------------------------------
// Provenance — multi-seat consensus shape (GPT-5.5 + Qwen-as-GLM)
// ---------------------------------------------------------------------------

/**
 * Provenance record that wraps any field extracted by a Tier 2 large-language
 * model from a source document. Mandatory on every component_intelligence row
 * (Phase B); optional on BOM rows, regulatory entries, and supplier match
 * fields today (Phase A scaffolding).
 *
 * INTENT: Without this, ForgeOS cannot cite sources in the founder PDF and
 * treats hallucinated extractions with the same confidence as deterministic
 * table lookups. Provenance makes the extraction chain auditable.
 */
export type Provenance = {
  /** ISO 8601 datetime — when this field was extracted. Required. */
  extracted_at: string
  /** Source URL the field was extracted from. Required. */
  source_url: string
  /** Internal identifier for the source PDF row, if applicable. Nullable. */
  source_pdf_id: string | null
  /** Page number within the source PDF. Nullable. */
  pdf_page: number | null
  /** Verbatim text span from the source that supports this extraction. Nullable. */
  quote_span: string | null
  /**
   * Model confidence in this extraction, 0–1. Required.
   * Values below 0.7 should be surfaced to the founder as unverified.
   */
  extraction_confidence: number
  /**
   * Model identifier that performed the extraction, e.g.
   * "deepseek/deepseek-v4-flash". Required for auditability and cost tracking.
   */
  extraction_model: string
  /** ISO 8601 datetime when a human or deterministic step verified this field. Nullable. */
  verified_at: string | null
  /** Identity of the verifier — user ID, pipeline step name, etc. Nullable. */
  verified_by: string | null
}

// ---------------------------------------------------------------------------
// ComponentCategory — typed enum (schema fix #1 from Qwen-as-GLM)
// ---------------------------------------------------------------------------

/**
 * Typed enum for component category, replacing the former free-text field.
 * Schema fix #1 from the Qwen-as-GLM council seat: free-text categories
 * create non-deterministic bucketing and break indexed queries.
 *
 * DECISION: Extend this union rather than creating a parallel string type.
 * "other" is the escape valve for categories not yet enumerated.
 */
export type ComponentCategory =
  | "lfp_battery_cell"
  | "nmc_battery_cell"
  | "battery_module"
  | "lithium_pack"
  | "ro_membrane"
  | "pressure_vessel"
  | "led_grow_light"
  | "hvac_unit"
  | "iot_sensor"
  | "power_converter_pcs"
  | "fuel_cell"
  | "solar_panel"
  | "structural_member"
  | "controller_pcb"
  | "actuator"
  | "other"

// ---------------------------------------------------------------------------
// PhysicalSpecs — dimensions as object, NOT array (schema fix #3)
// ---------------------------------------------------------------------------

/**
 * Physical specification for a component.
 *
 * DECISION (schema fix #3 from Qwen-as-GLM): dimensions MUST be an object
 * {length, width, height} in mm, NOT an array. An array is unit-ambiguous
 * (which axis is which? mm or cm?) and breaks any consumer that accesses
 * dimensions.width. The object form is self-documenting.
 *
 * DO NOT add `dimensions_mm: number[]` — that is the banned array shape.
 */
export type PhysicalSpecs = {
  /** Weight in kilograms. */
  weight_kg: number
  /**
   * Physical envelope in millimetres.
   * SCHEMA FIX: object, not array — see note above.
   */
  dimensions: {
    length: number
    width: number
    height: number
  }
}

// ---------------------------------------------------------------------------
// ElectricalSpecs — open extension type; battery-specific fields in Phase C
// ---------------------------------------------------------------------------

/**
 * Electrical specification for a component. Intentionally kept open via
 * record intersection so Phase C can extend per-category without a breaking
 * change to this scaffold.
 *
 * INTENTIONALLY OMITTED: `cycle_life_at_1c_80pct_dod` — that composite-name
 * overload (schema fix #2 from Qwen-as-GLM) should be split into the three
 * orthogonal fields below when ElectricalSpecs is fleshed out for battery
 * categories in Phase C. Do NOT add the composite name.
 *
 * Future battery-specific fields (Phase C):
 *   cycle_life_cycles: number       — integer cycle count
 *   depth_of_discharge_pct: number  — 0–100
 *   c_rate: number                  — float (e.g. 1.0 for 1C)
 */
export type ElectricalSpecs = {
  /** Nominal voltage in volts, if applicable. */
  voltage_v?: number
  /** Nominal capacity in amp-hours, if applicable. */
  capacity_ah?: number
  /** Maximum continuous power in watts, if applicable. */
  power_w?: number
  /** Additional category-specific fields captured as a typed record. */
  [key: string]: number | string | boolean | null | undefined
}

// ---------------------------------------------------------------------------
// CertSpecs — open extension type
// ---------------------------------------------------------------------------

/**
 * Certification and compliance specification for a component. Kept open for
 * Phase C extension — each category will add its own cert fields.
 */
export type CertSpecs = {
  /** CE marking status — "marked" | "not-required" | "pending" | "failed". */
  ce_marking?: string | null
  /** UKCA marking status. */
  ukca_marking?: string | null
  /** RoHS compliance status. */
  rohs?: string | null
  /** REACH / Substances of Very High Concern compliance. */
  reach_svhc?: string | null
  /** UL listing number, if applicable. */
  ul_listing?: string | null
  /** Additional certs as key–value. */
  [key: string]: string | null | undefined
}

// ---------------------------------------------------------------------------
// PricingSpecs — currency_code mandatory (schema fix #4)
// ---------------------------------------------------------------------------

/**
 * Pricing specification for a component.
 *
 * DECISION (schema fix #4 from Qwen-as-GLM): currency_code (ISO 4217) is
 * MANDATORY. Hard-coding "usd" in a field name (e.g. `indicative_price_usd`)
 * fights schema evolution — ForgeOS serves UK and EU founders; GBP and EUR
 * are equally valid. All price fields must carry an explicit currency code.
 */
export type PricingSpecs = {
  /** Unit price in the stated currency. */
  unit_price: number
  /**
   * ISO 4217 currency code. MANDATORY. Examples: "GBP", "USD", "EUR".
   * Never omit — see schema fix #4 in council synthesis.
   */
  currency_code: string
  /** Minimum order quantity. Null if no minimum. */
  moq: number | null
  /**
   * Volume price ladder for quantity-break pricing.
   * Each entry carries its own currency_code because cross-currency ladders exist.
   */
  volume_price_ladder?: Array<{
    qty: number
    unit_price: number
    /** ISO 4217 code — must be present on every ladder step. */
    currency_code: string
    /** ISO 8601 date after which this price is no longer valid. Nullable. */
    valid_until: string | null
  }>
}

// ---------------------------------------------------------------------------
// ComponentRef — FK scaffold to future component_intelligence table
// ---------------------------------------------------------------------------

/**
 * A reference to a specific component in the (future) component_intelligence
 * table, plus the validated spec fields that Max's sizing solver and the PDF
 * renderer can trust as grounded rather than invented.
 *
 * INTENT: When componentRef is null on a BomPartRow, the engine falls back to
 * the current Max-invented behaviour (no breaking change). When populated, the
 * PDF and Gate 3 sizing solver pull real specs from this record.
 *
 * PHASE: Phase B work (separate terminal) adds the actual `component_intelligence`
 * Postgres table. This type gives BomPartRow a stable FK reference shape so no
 * migration is needed when the table arrives.
 *
 * Schema groups (fix #5 from Qwen-as-GLM): electrical / physical / certifications
 * / pricing are nested objects, not a flat spec record. This avoids naming
 * collisions across categories and makes each group independently nullable.
 */
export type ComponentRef = {
  /**
   * Foreign key to the future component_intelligence.id column.
   * Type is string to match the text-primary-key convention used in this repo
   * (e.g. foundries.id is text, not uuid). UUID-shaped strings are fine.
   */
  component_id: string
  /**
   * Typed category enum — NOT free-text (schema fix #1 from Qwen-as-GLM).
   * Drives indexed queries once the component_intelligence table is live.
   */
  category: ComponentCategory
  /** Canonical manufacturer name, e.g. "EVE Energy" or "Grundfos". */
  manufacturer: string
  /**
   * Manufacturer part number (MPN). This is the key that links a BOM row to
   * a real-world component and enables the PDF to cite
   * "EVE LF100LA 3.2 V 100 Ah" instead of a hallucinated placeholder.
   */
  mpn: string
  /**
   * Datasheet revision string, e.g. "Rev C" or "2024-11".
   * Used for cache-busting when a datasheet is updated.
   */
  datasheet_rev: string
  /**
   * Electrical specifications. Optional today — populated by Phase C
   * narrow-category extraction (21700 LFP cells first).
   */
  electrical?: ElectricalSpecs
  /**
   * Physical specifications. Includes the dimensions object (NOT array).
   * Optional today — populated as Phase C extraction runs.
   */
  physical?: PhysicalSpecs
  /**
   * Certification and compliance records. Optional today.
   */
  certifications?: CertSpecs
  /**
   * Pricing data including mandatory currency_code. Optional today.
   * Populated from supplier quotes or Octopart / data-sheet list prices.
   */
  pricing?: PricingSpecs
  /**
   * List of field names in this ComponentRef that came from the actual
   * component_intelligence record, as opposed to values Max invented.
   *
   * INTENT: The PDF renderer and Gate 3 solver can check this list before
   * trusting a value. An empty array means nothing is grounded — fall back
   * to Max-invented values. A populated list tells the system which fields
   * it can cite with confidence.
   *
   * Example: ["mpn", "manufacturer", "physical.weight_kg", "pricing.unit_price"]
   */
  fields_grounded: string[]
  /**
   * Provenance for the component record itself. MANDATORY on ComponentRef
   * (multi-seat council consensus — see provenance shape above).
   */
  provenance: Provenance
}
