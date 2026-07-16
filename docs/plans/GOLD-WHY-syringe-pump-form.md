# Gold WHY → universal multi-channel linear-dosing form

**Training artefact:** Poseidon / open syringe-pump class (`out/_gold-poseidon-showcase/`, frozen repo `out/_gold-poseidon-repo`).  
**Not a cheat sheet:** no gold MPNs in emitters. Rules key on `syringe_pump` form signals + `channel_count` — never `if product == poseidon`.

## Why the gold kit is structured this way

| Gold choice | Engineering WHY | Universal rule |
|---|---|---|
| N parallel pump bays side-by-side | Each channel must infuse/withdraw independently without shared carriage collision | `channel_count` → **N repeated linear actuator bays** on one benchtop base |
| NEMA-class stepper at the rear of each bay | Rotary → linear via screw; motor stays clear of wet syringe tip | Per channel: **stepper at drive end** |
| Lead screw + dual guide rails | Displacement = f(ID, pitch, steps); rails kill carriage rotation | Per channel: **lead screw + ≥2 rails + carriage** |
| Carriage clamps the plunger | Must push (infuse) and pull (withdraw) | Carriage carries a **plunger clamp**, not a one-way pusher |
| V-cradle + thumb clamp at the tip end | Barrel must not walk under withdrawal force | **Syringe cradle + clamp** (star/thumb knob is a friction-clamp affordance) |
| Exposed open mechanism | Maker / research instrument — mechanism *is* the product face | Form family is **OPEN array**, not a sealed empty cube |
| Separate control console (MCU + drivers + UI) | Multi-axis step/dir + host protocol + optional imaging stage | **Control spine** beside or aft of the array (display + driver stack) |
| Bright carriage / frame colour contrast | Operator must see motion at a glance across concurrent channels | Carriage material contrasts frame (desirability, not brand paint) |
| Benchtop footprint scales with N × syringe length | Physics of barrel + travel stroke | Envelope from `channel_count` × bay pitch + stroke length |

## Coded surfaces

1. `instrument_form_grammar.py` — `is_syringe_pump_form`, bay geometry, checklist
2. `build_universal_scene.py` — open multi-channel layout (no sealed crate)
3. `form_converge_loop.py` — Blender-only iterate → deterministic SIGHT checklist
4. `product-classifier.ts` / engineering-contract — class + `channel_count` (already)
5. Vision critic — syringe-pump form rubric (mechanism visible)

## Fast loop (do NOT run the full chain)

```text
frozen state.json (class=syringe_pump, channel_count=N)
  → Blender build_universal_scene (low samples)
  → count named meshes against form checklist
  → adjust bay_pitch / cam / stroke params OR fix SOURCE rule
  → re-render  (tens–hundreds of rounds, sub-minute each)
  → final shaded SIGHT vs gold showcase
```

Full chain relaunch only after the checklist + gold glance pass.

## Acceptance (gold twinship)

- Exterior shows N steppers + N lead-screw carriages + cradles/clamps
- Not a sealed blank cube / optical colorimeter tower
- Control console readable as separate compute/UI volume
- Scale is benchtop watts, not plant kW (BoM is a separate SOURCE track)
