<!--
COST ANCHOR (brief-cost-ceiling drawer rule — market-anchored, not gut-feel)
Output family: this is a platform/aircraft, not a per-unit-output plant — anchor on absolute device cost
benchmarked against the HAPS class, with payload mass as the scale denominator (£/kg-payload).
Basis: stratospheric HAPS prototypes/early-production aircraft are bespoke composite airframes with
fuel-cell + solar hybrid power; programme-level unit costs run in the low single-digit £M for a
single airframe excluding ground segment. A 50 kg telecoms payload at ~£40,000-90,000/kg-payload of
delivered platform is consistent with the registered HAPS reference (briefs-rerun/haps.md, 35 m / 50 kg).
Chosen ceiling: £3,200,000 ex-works for a single aircraft = £64,000/kg-payload. Confidence: low-moderate
(HAPS unit-cost data is sparse and programme-dependent; band kept wide).

E1 ACCEPTANCE-TEST PROVENANCE (intentional): this brief is the payload-led envelope-inference test.
It LEADS with payload mass, endurance and ceiling and states NO wingspan / no wing geometry ANYWHERE.
The registered-class envelope regex keys on wingspan, so the current engine is EXPECTED to exit 7 on
this brief (W1 envelope wall) until E1's typed-envelope-vector inference lands. DO NOT add a wingspan
to "make it pass" — the missing geometry is the whole point of the test. Per E1 invariant: a
payload-led HAPS brief must reach the orchestrator via inference, not via a hand-fed scale metric.
-->
# Stratospheric Connectivity Platform — Payload-Led Brief

We are designing an unmanned, solar-and-hydrogen powered stratospheric platform built around a 50 kg telecommunications payload. The mission comes first: keep a 50 kg connectivity payload aloft over a fixed region, continuously, for days at a time, from the lower stratosphere. The aircraft exists to carry and power that payload and hold it on station; everything else is in service of payload endurance and coverage.

## Mission and payload
- Payload: a 50 kg telecommunications / connectivity payload (antennas, radios, processing), powered and thermally managed by the platform throughout the mission.
- Payload power: continuous 1.2 kW delivered to the payload, day and night, including through the stratospheric night.
- Endurance: at least 9 days of continuous flight on station without landing.
- Service ceiling: sustained operation at 18-20 km altitude (lower stratosphere), above weather and controlled airspace.
- Coverage: 70 km ground service radius from the station-keeping orbit.
- Station-keeping: hold a fixed coverage area autonomously against stratospheric winds.

## Platform
- Unmanned, fixed-wing, high-altitude long-endurance aircraft.
- Hybrid power: wing-integrated photovoltaic arrays for daytime power and climb; a hydrogen fuel-cell system for night-time flight and sustained station-keeping. Energy balance must close over a full 24-hour day-night cycle at the design latitude.
- Lightweight composite airframe optimised for minimum mass at high altitude.
- Proprietary autonomous flight-control and station-keeping system.

## Operating envelope
- Ambient temperature down to about -60 °C; ambient pressure around 5 kPa at ceiling.
- Solar-driven climb to ceiling at dawn; fuel-cell-sustained loiter overnight.
- Single-aircraft system; ground control, launch and recovery infrastructure are out of scope.

## Scope
- Design the complete aircraft to carry, power and thermally manage the 50 kg payload for the stated endurance and ceiling: airframe and wing structure; the hybrid hydrogen-fuel-cell-plus-solar power and electric propulsion system; energy storage sized to close the day-night energy balance; the avionics and proprietary autonomous control system; and the payload bay with its 1.2 kW continuous power and thermal interface.
- Constraints to be met: 50 kg payload, 1.2 kW continuous payload power, ≥ 9 day endurance, 18-20 km ceiling, 70 km coverage radius, full day-night energy closure.
- Unit cost ceiling: £3,200,000 ex-works for a single aircraft (airframe, power and propulsion, energy storage, avionics, payload bay) — excludes the ground segment.
- Jurisdiction: UK.
