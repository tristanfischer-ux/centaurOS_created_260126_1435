/**
 * @file src/lib/sizing/envelopes.ts — Canonical envelope definitions.
 *
 * @description Every envelope we support once, in one place, so every domain
 * library + UI references the same dimensions. Interior dimensions reflect
 * real-world deployed containers + rooms (NOT external shell).
 */

import type { Envelope } from "./types"

function computeDerived(e: Omit<Envelope, "interior_floor_m2" | "interior_volume_m3">): Envelope {
    return {
        ...e,
        interior_floor_m2: (e.interior_w_mm * e.interior_d_mm) / 1_000_000,
        interior_volume_m3: (e.interior_w_mm * e.interior_d_mm * e.interior_h_mm) / 1_000_000_000,
    }
}

/**
 * 40ft ISO container — workhorse for BESS + data centres + containerised
 * heat pumps. Interior dims subtract ~125mm insulation panels from the
 * 12.192 × 2.438 × 2.591 nominal external.
 */
export const CONTAINER_40FT_ISO = computeDerived({
    kind: "container_40ft_iso",
    label: "40ft ISO container (standard)",
    interior_w_mm: 12_032,
    interior_d_mm: 2_352,
    interior_h_mm: 2_393,
})

/**
 * 20ft ISO — half the 40ft, used for smaller BESS + off-grid power units.
 */
export const CONTAINER_20FT_ISO = computeDerived({
    kind: "container_20ft_iso",
    label: "20ft ISO container (standard)",
    interior_w_mm: 5_898,
    interior_d_mm: 2_352,
    interior_h_mm: 2_393,
})

/**
 * 53ft high-cube — preferred upgrade envelope for over-sized BESS (adds
 * ~20% floor area vs 40ft).
 */
export const CONTAINER_53FT_HC = computeDerived({
    kind: "container_53ft_hc",
    label: "53ft high-cube container",
    interior_w_mm: 16_072,
    interior_d_mm: 2_596,
    interior_h_mm: 2_743,
})

/**
 * Typical vertical-farm bay (single warehouse partition, ~100 m²).
 */
export const WAREHOUSE_BAY_100 = computeDerived({
    kind: "warehouse_bay",
    label: "Warehouse bay (100 m²)",
    interior_w_mm: 10_000,
    interior_d_mm: 10_000,
    interior_h_mm: 6_000,
})

/**
 * Compact cabinet for residential / small-commercial heat pumps.
 * External ~1.2 × 1.2 × 1.8m → interior ~1.1 × 1.1 × 1.7m.
 */
export const HEATPUMP_CABINET = computeDerived({
    kind: "cabinet",
    label: "Heat-pump outdoor cabinet",
    interior_w_mm: 1_100,
    interior_d_mm: 1_100,
    interior_h_mm: 1_700,
})

/**
 * Helper that builds a one-off custom envelope with derived floor/volume.
 */
export function makeCustomEnvelope(
    label: string,
    w_mm: number,
    d_mm: number,
    h_mm: number,
): Envelope {
    return computeDerived({
        kind: "custom",
        label,
        interior_w_mm: w_mm,
        interior_d_mm: d_mm,
        interior_h_mm: h_mm,
    })
}
