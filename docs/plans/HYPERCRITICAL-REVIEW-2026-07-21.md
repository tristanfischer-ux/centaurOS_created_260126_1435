# Hyper-critical 4-agent adversarial review — organoid final4 (2026-07-21)

## ONE ROOT (all 4 agents converged)
Plant-scale DEFAULTS applied to a watt-scale benchtop instrument (isInstrumentDevice=True is
SET but ignored by these paths), AND the deterministic tab banners score CLOSURE/ARITHMETIC,
not ARCHETYPE LEGALITY — so every offending tab reads "10/10 PASS" over physically-impossible
cells. Two mechanisms: (a) apply the isWattScaleInstrument gate to the leaking paths; (b) make
the banner/score bind to archetype-legality + the floor, not just referential closure.

## FINDINGS BY FAMILY (owning script)
### Electrical plant-leak [CRITICAL] — settle-loop.ts nextStandardKva + electrical_distribution_model.py
- total_supply_demand_kva = 25 kVA (700× a 35 W device); 400 V 3-ph LV board; 16 A/6 A main breaker; 2500 A board ceiling; 400 mm² cable ladder. select_distribution_voltage(0.035kW)→400V (250kW threshold); nextStandardKva floor 25 kVA. FIX: instrument branch → single-phase ELV/USB, no incomer/transformer/breaker (polyfuse already in BoM).
### Worked-calc honesty [CRITICAL] — build-excel-export.py cell-check
- #DIV/0! volumetric agitation power (V_tank=0) shipped PASS; electronics junction 92.65°C = −7.65 K over Tj_max shipped PASS; EMC margin −30 dB shipped PASS. FIX: cell-check FAILs any Excel error-literal (#DIV/0!/#REF!) OR negative safety margin.
### Design basis = plant sizing sheet [CRITICAL] — build-excel-export.py Design-basis emitter
- steam 30 m/s, API RP 14E, DN15–DN300 ladder, HVAC ducts 6/9 m/s, 8000 h/yr "plant". FIX: gate each discipline block on isWattScaleInstrument; fluid basis = tubing bore mm.
### Assembly = civil construction [CRITICAL] — build-excel Assembly-sequence generator
- "40 m² slab/crew-day", "3 vessel lifts/crane-day", ">1 t lifts none", "crane class TBC" on a 1.8 kg kit; + colorimeter optical-bench story. FIX: bench_assembly norm-set when mass<~50 kg / instrument.
### Connection graph illegal endpoints [CRITICAL] — connection_ledger.py
- water/air service on Cable Strain Relief, Debug Header, Ferrite bead, Heatsink Fan; pump→stirrer→cable-clip; ferrite as 14-load power node. FIX: type endpoints by role class; a fluid edge only terminates on a wetted part, power/signal only on electrical.
### Metre-scale runs in a 281 mm box [HIGH] — router / connection-sizing
- signal cables 2.2–2.4 m, tubing 1.7–1.9 m, interconnect 15.1 m → connection cost £874. FIX: clamp intra-enclosure runs to a fraction of the device bbox diagonal.
### Part bigger than its enclosure [HIGH] — blender-universal geometry TYPE_DEFAULTS
- Culture Temperature Probe 260×309×240 mm inside a 221×165×82 mm shell. FIX: watt-scale probe defaults + a containment invariant (child bbox ≤ enclosure inner bbox).
### Cost/financial plant model [HIGH] — build-excel-export.py
- £90 field-erection on a USB kit; OEM+channel markup 1.9× BoM on a self-build kit; 20-yr/8000 h vs 5-yr life; 3% plant maintenance; £/ml levelised; NPV/IRR/deployment verdict on a non-sold device; installed ASP £615 vs £546 mismatch; assembly £52 vs £31.95. FIX: gate cost-waterfall+financial defaults on isInstrumentDevice/kit-delivery; suppress install/channel/OEM/DCF; horizon=design_life.
### Standards wrong-domain [HIGH] — hazard/standards builder
- CDM/DSEAR/PUWER/LOTO/bunding promoted; IEC 61010-1/61326-1/LVD/EMC/RoHS/WEEE demoted to "soft". FIX: instrument branch in the jurisdiction×hazard→reg matrix.
### Cross-tab tag/membership disagreement [HIGH] — canonical tag table
- X-116/X-117 (Part names) == I-110/I-111 (manifest) == the OD Photodiode (SZYY0603B) + OD ADC (ADS1114); 7 Part-names tags absent from Connection trace. FIX: one canonical tag table for Part names/Connection/manifest; export diffs + fails on divergence.
### Naming [MED] — Decision 2A
- "Sensing Instrumentation Subcomponent 1/2" ARE the OD Photodiode + OD Sensor ADC — name by resolved-MPN function. (⚠Checks P5 already FAILs this — good.)
### Banner vs floor [MED] — build-excel tab-quality cell
- tabs show 10/10 while Overview floor=0/10. FIX: tab banner = min(section_gate, floor); Connection-trace score must include "endpoints role-legal", not just "resolve".
### Cost-ceiling propagation
- costSanity fixed (9acf41543 → materials for a kit) but ship-gate + Quality&Audit still compare ex-works £475. FIX: propagate the materials-basis to ALL cost-ceiling surfaces (two-surfaces gotcha).

## IMPLEMENTATION TIERS
- TIER 1 (CATCH, fastest — extend _checks_plausibility, floor-bound): negative-margin→FAIL; part-containment (child≤enclosure)→FAIL; intra-enclosure run-length→FAIL. Each proveCatch.
- TIER 2 (PREVENT at source): electrical scale-gate; design-basis gate; cost-structure gate; connection endpoint-typing; geometry probe defaults; standards branch; cost-ceiling propagation.
- TIER 3: cell-check error-literal/negative-margin FAIL; banner=min(gate,floor); naming-by-function; canonical tag table.
