# Vertical Farm Test Brief

We are designing a containerised 100 m² leafy-greens vertical farm housed in a 40-foot HIGH-CUBE shipping container, with the fertigation / nutrient-mixing system mounted on a separate external skid that connects via flexible hoses. The container holds 8 mobile trolleys (rolled in/out for harvest cycling); the skid sits adjacent on a hardstand and handles all nutrient chemistry, water treatment, and dosing — keeping the food-contact zone inside the container independent of chemistry handling for cleanability and food-safety compliance.

Target customer: UK supermarket own-label suppliers, vertical farming operators expanding from pilot to small-commercial, food-service group commissaries, and university / research deployments requiring controlled-environment agriculture at meaningful scale (≥2 t/year leafy greens).

Key constraints (CONTAINER):
- Unit cost ceiling: £500,000 ex-works for container + skid set (≈ £5,000/m² canopy; premium UK band reference £4,000-£8,500/m² for premium-certified containerised VF, commodity tier £1,500-£3,500/m²)
- Growing surface area: 100 m² total plant canopy (8 trolleys × 12.5 m² per trolley, distributed across 5 vertical tiers per trolley with 2.5 m² per tier — tray size approximately 2.5 × 1.0 m)
- Container envelope: 12,192 × 2,438 × 2,896 mm (40-foot High-Cube ISO 668:2020 / ISO 1496-1:2013)
- Maximum gross mass (loaded): 18,000 kg container (road-transportable; HC permitted on UK trunk routes without abnormal-load escort)
- Trolley mobility: lockable industrial castors, manual roll-in/out via container rear doors, accommodates harvest cycling without bringing the full canopy off-line
- Target yield: 40-55 kg leafy greens per week steady state (≈ 2.1-2.9 t/year per unit)
- Crop types: lettuce, basil, rocket, pak choi, kale, microgreens (no fruiting crops v1)
- Energy use: ≤ 22 kWh per kg produce at steady state (container + skid total, electrical input — industry reference: AeroFarms 32 kWh/kg, Plenty 25-30 kWh/kg, premium UK efficient builds 20-25 kWh/kg)
- Water use: ≤ 18 L per kg produce (closed-loop recirculating with skid-side reverse-osmosis polish, includes substrate retention + condensate recovery — industry reference: open-field 200-500 L/kg, commercial CEA closed-loop 10-30 L/kg, Plenty reports ~5 L/kg for premium build)
- Lighting: tunable-spectrum horticultural LED 200-350 µmol·m⁻²·s⁻¹ PPFD per tier, 16-hour photoperiod, installed_lighting_kw ≈ 22 kW (100 m² canopy × 350 µmol/m²/s ÷ 2.4 µmol/J LED efficacy ÷ 0.70 fixture-to-canopy efficiency ÷ 0.93 driver efficiency = ~22 kW electrical input)
- Climate: 20-24 °C, 60-75% RH, 800-1,200 ppm CO₂ (dosed from external CO₂ cylinder via skid)
- Annual batch size: 25 units per year

Key constraints (EXTERNAL VERTIGATION SKID):
- Skid envelope: 3,500 × 1,800 × 2,200 mm (W × D × H) — fits within a parking-bay footprint adjacent to the container
- Skid mass: ≤ 2,500 kg (includes 2× 1,000 L nutrient tanks, RO/DI water treatment, pumps, dosers, controls)
- Connection: 4-line bundle (nutrient supply, nutrient return, mains water, electrical + CAN bus) via flexible food-grade hoses, IP67 quick-disconnect fittings
- Skid functions: RO water polish, EC/pH monitoring + auto-dosing, primary + reserve nutrient tanks with mixing, sanitiser dosing (peracetic acid CIP cycle), pump cycling for circulation, UV disinfection
- Maintenance access: skid is the only "wet" maintenance zone; container interior stays dry-cleanable

Safety and regulatory:
- BS EN 60204-1 (electrical safety of machinery)
- EN 60335-2-76 (safety of water-contact appliances, applicable to nutrient pumps)
- Food contact materials — BS EN 1186 / EU 10/2011 for any plastic in direct contact with irrigation water
- BRCGS Global Standard for Agriculture (for customers selling into supermarkets)
- WRAS approval for mains water connection components
- BS 6920 (effect of non-metallic materials on water quality)
- CE / UKCA marking for completed product
- Fire detection inside container (UK BS 5839 compliance), local CO₂ purge interlock for entry safety
- IP67 ingress rating on all skid-to-container electrical connections

Sub-modules expected (container): 8 mobile trolleys with growing trays and root-zone collection, LED lighting array + drivers per tier, internal climate control (HVAC + dehumidifier), CO₂ dosing + venting, in-container fertigation distribution (manifolds, valves, return collection), environmental sensor stack per tier (temp, RH, CO₂, EC, pH, PAR), in-container PLC + HMI panel, power distribution, fire detection + suppression.

Sub-modules expected (vertigation skid): RO/DI water treatment, primary nutrient mixing tank, reserve nutrient tank, dosing pumps (A/B/Ca/Mg/micros), pH up/down dosing, EC/pH continuous monitoring with auto-correction, UV-C disinfection, circulation pumps, sanitiser dosing (PAA), skid-side PLC, weatherproof enclosure, freeze protection.
