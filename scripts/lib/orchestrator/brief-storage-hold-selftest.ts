// proveCatch guard for briefStorageHoldExact in executor.ts (Tristan 2026-06-27, physics-critic
// Risk-tab "brief 120 m³ total water storage vs the design" HIGH).
//
// THE BUG: the executor's "brief is ground truth" guard only RESTORES a brief-pinned value when a
// tool moves it by >3×. The Codema drain tanks (brief: 40 m³ each, explicitly dimensioned) were
// refined to 64.8 m³ by a consumptive buffer-sizing tool — a 1.62× drift that slipped under the 3×
// threshold, so the design showed 169.6 m³ total vs the brief's 120 m³, and the critic flagged it.
// briefStorageHoldExact makes an explicitly-dimensioned storage vessel HOLD its brief value on ANY
// divergence. This guard fails the build if a storage volume stops being held, or a flow/non-storage
// quantity is wrongly held (a refinement that SHOULD be allowed).

import { briefStorageHoldExact } from './executor'

function run() {
  // MUST hold (brief-dimensioned storage vessels):
  for (const [k, fam] of [
    ['drain_water_tank_volume_each_m3', 'volume'],
    ['fresh_water_storage_capacity_m3', 'capacity'],
    ['nutrient_tank_volume_each_m3', 'volume'],
    ['buffer_tank_volume_m3', 'volume'],
    ['raw_water_reservoir_capacity_m3', 'capacity'],
  ] as const) {
    if (!briefStorageHoldExact(k, fam)) throw new Error(`brief-storage-hold: "${k}" (${fam}) is a brief-dimensioned storage vessel and MUST be held exactly`)
  }
  // MUST NOT hold (these are refinable / not storage volumes):
  for (const [k, fam] of [
    ['irrigation_pump_flow_m3_h', 'flow_rate'],   // a flow, not a storage volume
    ['recirc_flow_m3_h', 'flow_rate'],
    ['membrane_area_m2', 'area'],                 // an area, not volume/capacity
    ['heat_pump_duty_kw', 'duty'],
    ['drain_water_tank_volume_each_m3', 'flow_rate'], // right key, WRONG family → not held
  ] as const) {
    if (briefStorageHoldExact(k, fam)) throw new Error(`brief-storage-hold: "${k}" (${fam}) is NOT a brief-dimensioned storage volume and must remain tool-refinable`)
  }
  // eslint-disable-next-line no-console
  console.log('brief-storage-hold --selftest OK (storage volumes held exactly; flows/areas/non-volume families stay refinable)')
}

run()
