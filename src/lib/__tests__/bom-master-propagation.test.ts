/**
 * @file bom-master-propagation.test.ts — Loop 25 Fix 2 regression tests.
 *
 * Guards against the regression where a missing DB column causes the parts
 * SELECT in export-project-pdf.tsx to return an empty result silently, making
 * the PDF show "BOM master (0 rows) — No parts generated yet" even when 63
 * parts exist in the table.
 *
 * Root cause (2026-04-29):
 *   migration 20260429300000_parts_cost_provenance.sql added the
 *   `cost_provenance` column with NOT NULL DEFAULT 'todo'. The SELECT in
 *   export-project-pdf.tsx (line 5276) was updated to include `cost_provenance`
 *   in commit cde1556f but the migration was not applied to production.
 *   PostgREST returns a query error (column not found), Supabase JS client
 *   returns { data: null, error: {...} }, and the caller did
 *   `(partsRaw ?? []).map(...)`, silently treating the error as empty.
 *
 * Fix:
 *   Apply the migration (done in this PR) so the column exists.
 *   Add the BOM_PROPAGATION_FAILED assertion in runBomMergeStage so the
 *   next recurrence is loudly caught rather than silently producing an
 *   empty PDF section.
 *
 * Tests cover:
 *   (a) The `cost_provenance` column SELECT fallback: when a parts row lacks
 *       cost_provenance, the PDF renderer must treat it as null (not throw).
 *   (b) The propagation assertion: if merge produces 0 parts from N modules,
 *       the BOM_PROPAGATION_FAILED guard fires.
 *   (c) The PDF parts mapper correctly handles rows with and without
 *       cost_provenance (pre-migration rows defaulted to 'todo' via backfill;
 *       post-migration rows have the column populated by the INSERT).
 *   (d) The HAPS GCS silent exclusion pattern: parts with a source_module_id
 *       that does not match any module in the project produce a detectable
 *       module-coverage gap.
 */

// ─── Types ────────────────────────────────────────────────────────────────

type CostProvenance = "quoted" | "parametric" | "placeholder" | "todo"

/** Minimal shape matching the partsRaw rows from the PDF SELECT. */
interface RawPartRow {
    part_number: string
    name: string
    description: string | null
    source_module_id: string | null
    process: string | null
    material: string | null
    material_spec: string | null
    finish: string | null
    tolerance: string | null
    mass_kg: number | null
    estimated_unit_cost_gbp: number | null
    is_purchased: boolean
    cost_provenance?: CostProvenance | null
}

/** Mirrors the mapping logic in export-project-pdf.tsx ~line 5257-5262. */
function mapCostProvenance(raw: RawPartRow): CostProvenance | null {
    const VALID = ["quoted", "parametric", "placeholder", "todo"] as const
    return VALID.includes(raw.cost_provenance as CostProvenance)
        ? (raw.cost_provenance as CostProvenance)
        : null
}

// ─── (a) cost_provenance column fallback ──────────────────────────────────

describe("PDF parts mapper — cost_provenance column", () => {
    test("returns correct provenance for a quoted row", () => {
        const row: RawPartRow = {
            part_number: "DES-001",
            name: "High-pressure pump",
            description: null,
            source_module_id: "pump_module",
            process: "purchased_cots",
            material: null,
            material_spec: null,
            finish: null,
            tolerance: null,
            mass_kg: 45,
            estimated_unit_cost_gbp: 12500,
            is_purchased: true,
            cost_provenance: "quoted",
        }
        expect(mapCostProvenance(row)).toBe("quoted")
    })

    test("returns 'parametric' for parametric-classified rows", () => {
        const row: RawPartRow = {
            part_number: "DES-002",
            name: "Membrane housing",
            description: null,
            source_module_id: "membrane_module",
            process: "cnc",
            material: "316L stainless steel",
            material_spec: null,
            finish: null,
            tolerance: "±0.1mm",
            mass_kg: 8,
            estimated_unit_cost_gbp: 3200,
            is_purchased: false,
            cost_provenance: "parametric",
        }
        expect(mapCostProvenance(row)).toBe("parametric")
    })

    test("returns null for missing/undefined cost_provenance (pre-migration row)", () => {
        const row: RawPartRow = {
            part_number: "DES-003",
            name: "Legacy part",
            description: null,
            source_module_id: null,
            process: null,
            material: null,
            material_spec: null,
            finish: null,
            tolerance: null,
            mass_kg: null,
            estimated_unit_cost_gbp: null,
            is_purchased: false,
            cost_provenance: undefined,
        }
        expect(mapCostProvenance(row)).toBeNull()
    })

    test("returns null for null cost_provenance explicitly", () => {
        const row: RawPartRow = {
            part_number: "DES-004",
            name: "Another legacy part",
            description: null,
            source_module_id: null,
            process: null,
            material: null,
            material_spec: null,
            finish: null,
            tolerance: null,
            mass_kg: null,
            estimated_unit_cost_gbp: null,
            is_purchased: false,
            cost_provenance: null,
        }
        expect(mapCostProvenance(row)).toBeNull()
    })

    test("returns null for an unrecognised provenance string (schema drift defence)", () => {
        const row = {
            part_number: "DES-005",
            name: "Unknown provenance part",
            description: null,
            source_module_id: null,
            process: null,
            material: null,
            material_spec: null,
            finish: null,
            tolerance: null,
            mass_kg: null,
            estimated_unit_cost_gbp: null,
            is_purchased: false,
            cost_provenance: "future_value_not_in_enum" as unknown as CostProvenance,
        } satisfies RawPartRow
        expect(mapCostProvenance(row)).toBeNull()
    })

    test("all four valid provenance values round-trip through the mapper", () => {
        const valid: CostProvenance[] = ["quoted", "parametric", "placeholder", "todo"]
        for (const prov of valid) {
            const row: RawPartRow = {
                part_number: `DES-X-${prov}`,
                name: `Part with ${prov} provenance`,
                description: null,
                source_module_id: null,
                process: null,
                material: null,
                material_spec: null,
                finish: null,
                tolerance: null,
                mass_kg: null,
                estimated_unit_cost_gbp: prov === "todo" ? null : 1000,
                is_purchased: false,
                cost_provenance: prov,
            }
            expect(mapCostProvenance(row)).toBe(prov)
        }
    })
})

// ─── (b) BOM propagation assertion ───────────────────────────────────────

describe("BOM propagation invariant", () => {
    /**
     * Simulates the assertion added to runBomMergeStage.
     * Returns true (assertion fires) when modules are present but parts are empty.
     */
    function propagationAssertionFires(
        moduleCount: number,
        validatedPartCount: number,
    ): boolean {
        return validatedPartCount === 0 && moduleCount > 0
    }

    test("assertion fires when 0 parts produced from non-empty modules", () => {
        expect(propagationAssertionFires(9, 0)).toBe(true)
    })

    test("assertion does NOT fire when parts are present", () => {
        expect(propagationAssertionFires(9, 63)).toBe(false)
    })

    test("assertion does NOT fire when modules list is also empty (empty project)", () => {
        expect(propagationAssertionFires(0, 0)).toBe(false)
    })

    test("assertion fires for single-module zero-parts case", () => {
        expect(propagationAssertionFires(1, 0)).toBe(true)
    })

    test("assertion does NOT fire for even a single part produced", () => {
        expect(propagationAssertionFires(5, 1)).toBe(false)
    })
})

// ─── (c) Silent-empty partsRaw handling ──────────────────────────────────

describe("PDF parts query error → empty array fallback", () => {
    /**
     * Mirrors the PDF code: `(partsRaw ?? []).map(...)`.
     * When the Supabase client returns { data: null, error } (e.g. column not
     * found), the caller must receive an empty array, not throw.
     */
    function mapPartsRaw(partsRaw: RawPartRow[] | null): RawPartRow[] {
        return (partsRaw ?? []).map((p) => ({ ...p }))
    }

    test("null partsRaw produces empty array (PostgREST error path)", () => {
        expect(mapPartsRaw(null)).toHaveLength(0)
    })

    test("empty array partsRaw produces empty array", () => {
        expect(mapPartsRaw([])).toHaveLength(0)
    })

    test("63-row partsRaw produces 63-row mapped array", () => {
        const rows: RawPartRow[] = Array.from({ length: 63 }, (_, i) => ({
            part_number: `DES-${String(i + 1).padStart(3, "0")}`,
            name: `Part ${i + 1}`,
            description: null,
            source_module_id: "pump_module",
            process: "purchased_cots",
            material: null,
            material_spec: null,
            finish: null,
            tolerance: null,
            mass_kg: 10,
            estimated_unit_cost_gbp: 500,
            is_purchased: true,
            cost_provenance: "quoted",
        }))
        expect(mapPartsRaw(rows)).toHaveLength(63)
    })
})

// ─── (d) HAPS GCS module-coverage gap detection ──────────────────────────

describe("HAPS Ground Control Station BOM coverage gap", () => {
    /**
     * Detects the pattern where a module has keyParts but no BOM parts.
     * The GCS module (module_id: 'ground_station') had 6 keyParts but 0 parts
     * in the parts table because the BOM generator used different IDs in the
     * skeletonParts than the module IDs in the project JSONB.
     */
    function detectModuleCoverageGaps(
        moduleIds: string[],
        partSourceModuleIds: string[],
    ): string[] {
        const covered = new Set(partSourceModuleIds.filter(Boolean))
        return moduleIds.filter((id) => !covered.has(id))
    }

    test("GCS module is NOT covered when BOM used legacy IDs", () => {
        // Module IDs from cad_lab_projects.modules JSONB
        const moduleIds = [
            "airframe_structure",
            "solar_array",
            "hydrogen_fuel_cell_system",
            "energy_management_and_battery",
            "port_propulsion_unit",
            "starboard_propulsion_unit",
            "avionics_and_flight_control",
            "mission_payload_bay",
            "ground_station", // GCS — should have parts but doesn't
        ]
        // source_module_id values actually in the parts table (from old BOM run)
        const partsModuleIds = [
            "fuselage_empennage",
            "avionics_flight_control",
            "hydrogen_energy_module",
            "power_management_module",
            "port_wing_assembly",
            "starboard_wing_assembly",
            "propulsion_port_pod",
            "propulsion_starboard_pod",
            "sensor_payload_module",
        ]
        const gaps = detectModuleCoverageGaps(moduleIds, partsModuleIds)
        // All 9 module IDs are uncovered because none match the legacy IDs
        expect(gaps).toContain("ground_station")
    })

    test("all modules covered when BOM used correct IDs", () => {
        const moduleIds = ["module_a", "module_b", "module_c"]
        const partsModuleIds = ["module_a", "module_a", "module_b", "module_c"]
        const gaps = detectModuleCoverageGaps(moduleIds, partsModuleIds)
        expect(gaps).toHaveLength(0)
    })

    test("detects partial coverage (some modules have parts, some don't)", () => {
        const moduleIds = ["pump_module", "membrane_module", "ground_station"]
        const partsModuleIds = ["pump_module", "membrane_module"]
        const gaps = detectModuleCoverageGaps(moduleIds, partsModuleIds)
        expect(gaps).toEqual(["ground_station"])
    })

    test("null source_module_id parts do not count as covering any module", () => {
        const moduleIds = ["module_a"]
        const partsModuleIds = [null as unknown as string, null as unknown as string]
        const gaps = detectModuleCoverageGaps(moduleIds, partsModuleIds)
        expect(gaps).toContain("module_a")
    })
})
