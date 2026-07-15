// AUTO-DRAFTED regression-harness invariant stub — 2026-07-09T17:15:37.076Z
// Origin: gate 'drawing:no_stray_beam' FAILED on class 'water_treatment', routed to fix-stage: wire_ports tray demotion + draw_boundary_services (plant-crossing run → single-line/P&ID).
// Loss recurrence in the ledger: 9  ⚠ RECURRING — escalate to a coding-council, do not just stub.
// Run: /Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/codema-full-20260709-1759  @ c7b41809d
// Detail: single-line-diagram: longest drawn run u_wire_trunk_u_motor_control_center_power (LV power feeder 400/415V 3ph) spans 20.2 m (limit 16 m — a plant-crossing beam)
//
// TODO(human/council): implement the DETERMINISTIC assertion that would have CAUGHT this
// at fix-stage 'wire_ports tray demotion + draw_boundary_services (plant-crossing run → single-line/P&ID)', then MOVE it into scripts/regression-harness.tsx
// (so iter-N catches iter-(N+1)). This stub is a draft — it is NOT loaded by the harness.
export const DRAFT_INVARIANT = {
  id: 'WATER_TREATMENT.drawing_no_stray_beam_regression',
  description: "drawing:no_stray_beam must pass for water_treatment (auto-drafted from a real failure)",
  passed: true, // TODO: replace with the real deterministic check derived from the fix-stage
  detail: 'STUB — implement from fix-stage wire_ports tray demotion + draw_boundary_services (plant-crossing run → single-line/P&ID) and promote into regression-harness.tsx',
}
