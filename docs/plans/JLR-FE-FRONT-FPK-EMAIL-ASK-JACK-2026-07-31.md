# Email draft — ask Jack / JLR for the inputs that replace our assumptions

**To:** Jack (JLR Formula E technology)  
**From:** Tristan / Fractional Forge  
**Subject:** Front powertrain kit concept pack — results under frozen assumptions + short ask list

---

Hi Jack,

We have a concept pack for the Formula E **front powertrain kit** (motor + inverter + reduction + differential in the published bay class).

Where team or supplier data was missing, we **froze educated design assumptions**, ran packaging and physics screens on that basis, and can show **results under those assumptions** (bay fit, torque screen, gear strength, coolant temperatures, concentric CAD/Blender). We are **not** claiming a homologated or dyno-correlated race unit — `ship_ok` stays false until real correlation exists.

**What you can review now**

- Plain-language brief: `docs/plans/JLR-FE-FRONT-FPK-ASSUMPTION-BASED-RESULTS-FOR-JACK-2026-07-31.md`
- Twin scoreboard + renders: `out/formula-e-front-mgu-20260729-1432/` (heroes + `JLR-FE-FRONT-FPK-MOTOR-MULTIPHYSICS.md`)
- Machine-readable assumption register: `JLR-FE-FRONT-FPK-ASSUMPTION-BASED-DESIGN.json` in that twin

**Headline results under our frozen assumptions** (250 kW front regen, 343×259×267 mm bay, 750 V, 60 °C / 12 L/min coolant, 19,500 rpm, overall ratio 8):

- Concentric cassette fits the bay; planetary nests in a hollow rotor; post-diff ×4 stage clears strength FoS ≈ 1.2  
- Electromagnetic duty screen: loaded FE torque above the 250 kW shaft-torque requirement at the screened point  
- Cooling network: ~43 kPa pressure drop; winding ~67 °C; module ~71 °C at the assumed coolant point  
- Nine parametric CAD families + Blender views locked to the same millimetres  

**What we need from JLR / your suppliers to replace assumptions** (priority order)

1. **Chassis / vehicle interface ICD** — XYZ for HV DC connector, coolant in/out, LV/CAN, halfshaft flanges, mount ears (we currently have **types only**; we will not invent millimetres).  
2. **SiC power module identity** — manufacturer + MPN + datasheet (thermal limits, switching energy) + STEP if available (closes DEC-001).  
3. **DC-link capacitor bank** — preferred film capacitor MPNs / envelope.  
4. **Coolant loop confirmation** — fluid, inlet temperature, flow, and pressure budget if different from 60 °C / 12 L/min.  
5. **Ratio / vehicle model** — confirm or replace overall reduction seed of 8.0 and max used rotor speed.  
6. **Any existing dyno / HIL / flow / double-pulse data** on a comparable unit — even partial maps let us correlate instead of screening.  
7. **Supplier electronics pack** when ready — Gerbers / pinout ICD (DEC-009); until then our PCB work stays “draft only.”

If it is easier, a 30-minute call to walk the assumption table and tick “confirm / replace” on each row would be enough for us to re-stamp the pack.

Happy to send the Excel dossier and the latest cutaway renders ahead of a meeting.

Best,  
Tristan

---

## Short bullet version (if Slack / Teams)

- We froze assumptions → ran physics/packaging → **results under assumptions** ready for review  
- Not claiming race release until dyno/HIL/interfaces  
- **Please send:** interface XYZ, SiC module MPN+datasheet, coolant loop, ratio/speed confirm, any bench data  
- Brief + twin path in the longer email above  
