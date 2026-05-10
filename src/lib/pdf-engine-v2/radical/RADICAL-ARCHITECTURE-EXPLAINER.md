# The Radical Architecture — How ForgeOS Generates Engineering Reports That Are Actually Useful

*Fractional Forge — ForgeOS PDF Engine v2 — May 2026*

---

## 1. Executive Summary

ForgeOS generates engineering reports for hardware products — bills of materials, cost estimates, manufacturing recommendations. The goal is straightforward: every section of every report should score at least 8 out of 10 against the standards a procurement engineer or investor would apply. For two years, achieving that required building bespoke logic for each product class. A report on a battery storage system needed different code to a report on a vertical farm, which needed different code again to one on a drone. Scaling meant rewriting.

The Radical architecture changes the approach entirely. Instead of product-specific code, it describes all manufactured hardware using a single universal vocabulary — 22 atomic building blocks called radicals. Every product, from a 3.5 MWh grid-scale battery to a disposable glucose monitor worn on the arm, decomposes into combinations of those 22 radicals. The architecture has been tested across 10 product classes spanning energy storage, controlled-environment agriculture, heat pumps, drones, electric vehicle chargers, pharmaceutical bioreactors, edge AI servers, continuous glucose monitors, autonomous underwater vehicles, and stratospheric solar aircraft.

The findings: 22 radicals cover all 10 classes at 100% decomposition coverage. The library is now stable. Adding an 11th product class requires at most 0 to 2 new radicals.

The proof is not theoretical. In a working demonstration, the architecture decomposed a 3.5 MWh battery storage system, queried real distributors, found 4 verified part numbers with live prices and lead times, ran 6 engineering consistency checks, flagged a real procurement issue, and produced three CSV files uploadable to Digi-Key, Farnell, and Mouser right now to create actual purchase carts.

For a procurement engineer: the report you receive has orderable part numbers, real prices, and explicit engineering warnings.

For an investor: the universal substrate is empirically proven across deeply different product domains. Every improvement compounds across all supported classes simultaneously. The architecture scales sub-linearly.

---

## 2. The Mental Model — Why "Radical"?

The name comes from written Chinese. Chinese characters are not arbitrary pictures — each one is built from smaller components called radicals. The radical for "water" appears in characters for river, ocean, swim, and pour. The radical for "fire" appears in characters for flame, smoke, cook, and torch. The radicals carry fundamental semantic content; the character combines radicals to form a specific concept; a word chains characters; a sentence chains words; a paragraph builds from sentences.

This is not a metaphor chosen for elegance. It is structurally exact.

In the Radical architecture, an engineering product is a paragraph. Its major subsystems are sentences. Each sub-system contains modules (words). Each module contains specific designed components (characters). Each character is assembled from physical primitives (radicals). At every level, composition rules — grammar — govern which combinations are valid.

The insight is that the radicals for engineering are as universal as the radicals for language. Consider two components that appear in completely different products: the heater element in the jacket of a pharmaceutical bioreactor, used to maintain precise fermentation temperature, and the heater pad on the leading edge of a stratospheric solar aircraft's wing, used to prevent ice formation at altitude. The operating context, the regulatory regime, the scale, and the application are completely different. The underlying engineering primitive — an electrical element that converts current into heat — is the same. One radical describes both.

The comparison to Mendeleev is instructive. Mendeleev did not invent the periodic table by guessing. He observed roughly 60 known elements, noticed that their properties repeated at regular intervals when ordered by atomic weight, imposed minimal theoretical structure — two dimensions: atomic weight and valence group — and the table revealed predictable gaps. Elements that had not yet been discovered were visible as empty spaces in the pattern, and their properties could be predicted in advance. We did the same thing. We observed real engineering bills of materials across diverse product classes, imposed minimal structure (five layers plus composition rules), and the structure revealed the universal substrate. The library converged faster than predicted, and it now reveals predictable patterns in new product classes before detailed analysis is complete.

---

## 3. The Five Layers — What Each One Is

### Radicals

A radical is the most atomic semantic unit in engineering — a physical material, a physical function, an energy form, a state of matter, or a field phenomenon that cannot be meaningfully decomposed further without losing engineering content.

There are 22 radicals in the current library. That is not an approximation or a starting point — it is the empirically stable count after testing across 10 product classes totalling 227 bill-of-materials lines.

Examples from the library:

- `silicon_semiconductor_function` — the function class that covers all solid-state semiconductor behaviour: transistors, logic gates, analogue front ends, radio-frequency circuits, imaging sensors. It appears in the battery management system of a grid-scale battery, the flight controller of a drone, the neural processing unit of an AI inference server, and the potentiostat chip in a disposable glucose monitor. One radical, four very different products.

- `fluid_flow_state` — bulk fluid motion through a defined path. It covers the glycol cooling loop in a battery storage container, the nutrient solution circuit in a hydroponic growing system, the refrigerant cycle in a heat pump, and the oil-compensation system in an underwater vehicle battery. Completely different fluids, pressures, temperatures, and applications, sharing one radical.

- `electrochemical_energy_function` — the conversion between chemical energy and electrical energy at an electrode interface. It covers lithium iron phosphate cells in a grid battery, lithium polymer cells in a wearable device, and the faradaic current transduction at a glucose sensor's working electrode. Same fundamental physics across three distinct contexts.

### Characters

A character is a specific engineering function class built by composing two or more radicals. Characters are the level at which engineering meaning becomes concrete enough to appear on a bill of materials as a recognisable component type.

Examples:

- `liquid_cooling_system` — composed from `fluid_flow_state`, `thermal_transfer_function`, and `electromechanical_switching_function`. It describes any closed fluid thermal circuit driven by a pump. This single character covers a 1 MW glycol battery cooling loop, a grow-room HVAC dehumidifier, and a heat pump vapour compression cycle.

- `pressure_vessel` — composed from `pressure_vessel_function` and `solid_state_of_matter`. It covers a halon fire suppression cylinder, a food-grade CO2 cylinder used to acidify irrigation water in a vertical farm, a hydronic expansion vessel in a heat pump, and the titanium depth-rated pressure hull of an autonomous underwater vehicle. Different pressures, different contents, different environments, one character.

- `pcb_controller` — composed from `silicon_semiconductor_function`, `electrical_conducting_function`, and `solid_state_of_matter`. It covers every electronic control board across all 10 product classes: battery management slave modules, drone flight controllers, edge AI inference cards, CGM sensor ASICs, bioreactor process controllers.

### Modifiers

A modifier parameterises a character without changing its fundamental identity. It carries size, grade, certification, or material specifics. A character is generic; a character with modifiers is specific enough to search for in a distributor catalogue.

Examples:

- `316L_grade` applied to a steel bolt: overrides the base steel material to marine-grade stainless, setting `marine_corrosion_resistant = true` and encoding the PREN (pitting resistance equivalent number) of 25–26. The same character, the same function, a different procurement specification.

- `IP67` applied to a polymer enclosure: adds ingress protection rating to a generic housing character, making it suitable for outdoor or wet environments.

- `titanium_6al4v_grade` applied to a pressure vessel: specifies the hull material for an underwater vehicle to titanium alloy, encoding strength, density, and marine corrosion immunity.

### Archetypes

An archetype is the "designed-with" layer. It is a named combination of a character and its modifiers — a specific engineering design choice that exists before any specific manufacturer part number is assigned. The archetype encodes the engineering specification: what the component must do, to what standard, under what conditions. It does not yet say which manufacturer makes it or what the current price is.

Examples:

- `M8x30_316L_socket_head_bolt` — a socket-head cap screw, 8 mm diameter, 30 mm length, 316L stainless steel. A specific engineering choice, not yet a purchase order.

- `lfp_prismatic_cell_280Ah` — a lithium iron phosphate prismatic cell with 280 ampere-hour capacity. The archetype specifies the battery chemistry, form factor, and capacity. It does not specify CATL or BYD.

- `vapour_compression_cycle_R290_30kW` — a 30 kW vapour compression refrigeration cycle using R290 propane refrigerant. The entire refrigerant circuit — compressor, condenser, evaporator, expansion valve — is a single archetype because it is procured as a unit at this level of system engineering.

The archetype is the level at which grammar rules fire. It carries the voltage ratings, operating temperatures, material properties, and physical quantities that the grammar engine checks.

### Catalogue Entries

A catalogue entry is the volatile layer — the actual manufacturer part number (MPN), unit price, lead time, and distributor availability. This is the layer that changes when a part goes end-of-life, when a distributor runs out of stock, or when a better alternative appears on the market. It maps an archetype to a specific, purchasable product at a point in time.

Examples from the BESS demonstration:

- Archetype `dc_contactor_1500V_300A` → catalogue entry `EV200HAANA` (TE Connectivity, £139.16, 2–4 days from Digi-Key)
- Archetype `gas_sensor_electrochemical_offgas` → catalogue entry `MQ135` (£5.09, 2–4 days from Digi-Key)
- Archetype `managed_ethernet_switch_industrial` → catalogue entry `EDS-405A` (Moxa, £985.53, 2–4 days from Digi-Key)
- Archetype `ups_3000va_online` → catalogue entry `SMT3000I` (APC, £2,562, 2–4 days from Farnell)

Separating archetypes from catalogue entries is what allows the architecture to remain stable when component supply changes. The engineering specification (archetype) does not change when a part goes end-of-life. Only the catalogue entry changes.

### Words, Sentences, and Paragraphs

Above the character level, the hierarchy mirrors the linguistic model:

A **word** is a module — a functional group of archetypes that together perform a sub-task. In a battery system: the Battery Management System module, the Power Conversion System module, the Thermal Management module.

A **sentence** is a sub-system — a collection of modules that together form a major functional block. In a battery system: the Battery Enclosure sub-system, the Power Electronics sub-system.

A **paragraph** is the complete product — the full bill of materials and system description assembled from all sub-systems.

Cost rolls up the hierarchy at each level, with integration markups applied at each transition. In the BESS demonstration: parts cost £493,131, character-level assembly markup adds 15%, module integration adds 20%, and system integration adds 25%, producing a total installed cost of £820,637. Each level is auditable independently.

---

## 4. The Grammar Rules — the Part That Makes It Engineering

A vocabulary, however carefully chosen, is not enough. The danger is false synonymy. Two components might both match the same character — both are `liquid_cooling_system`, both are `pressure_vessel` — but be physically incompatible in the same design. A 12V irrigation pump rated for ambient-temperature water at 2 bar cannot be used to cool grid-scale lithium iron phosphate cells that run at 1 MW continuous load. The API might match. Physics does not.

Grammar rules are the engineering laws, standards, and manufacturer constraints that govern which combinations are valid. They operate on the resolved properties of the archetypes in a composition — the actual numbers, materials, and ratings — and they return verdicts that a procurement engineer can act on.

The v1 grammar engine includes six rules:

**Rule 1 — Kirchhoff's Current Law (KCL):** At every declared electrical node, current flowing in must equal current flowing out. This is a conservation law. It is classified as a hard rule with infinite weight, meaning it can never be relaxed — it is physics. In the BESS demonstration, the DC busbar node declared 2,000 A in and 2,000 A out: PASS.

**Rule 2 — Galvanic copper-aluminium contact:** When copper and aluminium components are in direct contact in a humid or marine environment, the anodic index between the metals exceeds 0.25V, driving accelerated corrosion. Direct contact in those environments is a hard block — it cannot be relaxed. A dielectric washer or isolating coating must be specified. In the BESS demonstration, copper and aluminium were both present but the environment was indoor industrial, not marine: PASS.

**Rule 3 — Voltage derating (80% rule):** Operating voltage should not exceed 80% of the rated voltage of a component. This is a standard derating rule that extends component lifetime and provides margin against transient overvoltage. In the BESS demonstration, the LFP cells operate at 3.2V against a rated voltage of 3.65V — a ratio of 87.7%. This is within the 80–100% warning band: the grammar engine issued a WARN. A procurement engineer reviewing this report can confirm the operating point is intentional, or flag it for design review. Without the grammar engine, this signal would not appear in the report at all. This rule is classified as adjustable (weight 6) — it can be relaxed with explicit disclosure of the tradeoff.

**Rule 4 — Mass balance in a closed fluid loop:** In any closed-loop fluid system, the mass flow rate entering the loop must equal the mass flow rate leaving it. This is another conservation law and is a hard rule. In the BESS demonstration, the coolant loop declared 2.5 kg/s in and 2.5 kg/s out: PASS.

**Rule 5 — Thermal capacity versus load:** A cooling system must have at least 20% margin above the thermal load it is managing. If the cooling capacity is below the load, the system cannot maintain temperature: hard block. If the margin is less than 20% but positive: warning. In the BESS demonstration, the chiller is rated at 1.2 MW against a 1 MW load — exactly 20% margin. The rule passed at the gate. Had the chiller been sized at 1.1 MW, a warning would have fired automatically.

**Rule 6 — Material marine corrosion:** Plain carbon steel in a marine environment corrodes rapidly. Structural steel components without a marine-grade rating (such as 316L stainless steel) in a marine environment are a block — replaceable by applying the 316L modifier or specifying an alternative material. This rule is adjustable (weight 5): the lowest-weight soft rule, meaning it relaxes first if a constraint conflict requires it. In the BESS demonstration, the environment was indoor industrial: the rule correctly skipped.

### The Relaxation-Weight Optimiser

Rules can conflict. A design might satisfy the galvanic rule only by specifying aluminium in a location where the thermal rule demands a copper heatsink, or where the voltage derating rule demands a specific grade of conductor that is available only in a form that creates galvanic risk. A simple boolean checker would deadlock: block, block, block, no solution. The grammar engine in this architecture is a constraint optimiser with relaxation weights, not a boolean checker.

When rules conflict, the engine relaxes the lowest-weight rule first, downgrades its BLOCK to a WARN, and discloses the tradeoff explicitly in the engine output. Hard rules (weight infinity) never relax. Adjustable rules relax in ascending weight order. The output always says exactly which rule was relaxed, at what cost, and what tradeoff was accepted. An engineer reading the report sees the constraint conflict, the resolution, and the explicit statement of what was traded away. This is not a workaround — it is sound engineering practice: when constraints compete, the most critical constraint wins, and the relaxation of the less critical constraint is documented.

---

## 5. What We Discovered — the Surprising Findings

The cross-product overlaps are the most striking result. They demonstrate that the abstraction is real, not arbitrarily imposed.

**`silicon_semiconductor_function` spans the entire electronics domain.** This one radical covers the battery management electronics in a grid-scale energy storage system, the LED drivers in a horticultural growing facility, the flight controller in a drone, the power factor correction circuit in an electric vehicle charger, the programmable logic controller in a pharmaceutical bioreactor, the neural processing unit in an AI inference server, DRAM and NAND flash memory, the potentiostat in a medical glucose monitor, and the inertial measurement unit in an autonomous underwater vehicle. Eleven of the 10 product classes tested — the same radical appears in all of them. When you improve how the architecture handles silicon semiconductor components, every one of those product classes benefits simultaneously.

**`electric_heater_element` connects pharma and aerospace.** A resistance heater embedded in the outer jacket of a pharmaceutical bioreactor maintains precise fermentation temperature — a tightly regulated, validated pharmaceutical manufacturing process. A de-icing heater pad on the leading edge of a stratospheric solar aircraft wing prevents ice crystal formation at 20 km altitude, where temperatures reach -60°C and ice accumulation can destroy the wing structure. The applications are about as far apart as engineering gets: ground-based, sterile, regulated, 37°C on one side; stratospheric, exposed, safety-critical, -60°C on the other. The underlying engineering primitive is the same: an electrical element that converts current into heat, positioned where heat is needed. One character.

**`pressure_vessel` collapses three distinct technologies.** A halon fire suppression cylinder in a battery storage container stores compressed gas suppressant ready for emergency deployment. A food-grade CO2 cylinder in a vertical farm supplies dissolved carbon dioxide for water acidification in the nutrient circuit. A hydronic expansion vessel in a heat pump absorbs fluid volume changes as the water circuit heats and cools through operating cycles. Three different pressurised containers, three different industries, three different regulatory regimes, three different contents. The `pressure_vessel` character covers all three, with modifiers encoding the specifics. The same character also covers the titanium depth-rated hull of an autonomous underwater vehicle — the physics of containing hydrostatic pressure at 100 m depth is structurally identical to containing process pressure in a surface vessel.

**`liquid_cooling_system` abstracts across battery storage, agriculture, and HVAC.** A 1 MW glycol cooling loop keeping lithium cells below 40°C, a grow-room HVAC system managing humidity and temperature for plant growth, and a vapour-compression heat pump cycle delivering 30 kW of heating at 65°C flow temperature are, at the radical level, all closed fluid thermal circuits driven by a pump. The modifiers and archetypes carry all the specificity; the character correctly abstracts the shared engineering concept.

**`levelling_foot` in a growing rack and a heat pump.** A mounting foot on a deep-water culture growing rack — the kind used in a hydroponic vertical farm to hold nutrient trays at the correct height — and a levelling foot on an outdoor heat pump plinth are structurally identical at the character level. Same radical stack. Different product domains by roughly as wide a margin as two products can be. The radical correctly collapses them before modifier context distinguishes the specific applications.

---

## 6. The Numbers

The growth of the radical library across the five-week test programme shows the sub-linear convergence that distinguishes a genuine universal substrate from an approximate one.

| Stage | Products cumulative | Radicals | Net new | Signal |
|---|---|---|---|---|
| Seed (baseline) | 0 | 5 | — | Starting point: steel, copper, polymer, electrical conduction, solid state |
| Week 2 (BESS) | 1 | 17 | +12 | One complex product establishes most of the substrate |
| Week 3 (vfarm + heat pump) | 3 | 18 | +1 | Heat pump added zero new radicals — first hard signal of convergence |
| Week 4 (drone + EV charger + bioreactor + edge AI) | 7 | 20 | +2 | Two of four new products added zero new radicals |
| Week 5 (CGM wearable + AUV + HAPS aircraft) | 10 | 22 | +2 | Three niche classes added two radicals total |

The original council prediction, made before the decomposition programme began, was 30 to 50 radicals to achieve 90% coverage across a broad product range. The reality is 22 radicals for 100% coverage across 10 product classes spanning 227 bill-of-materials lines. The library converged sub-linearly and is now empirically stable.

The growth rate pattern — 12, 1, 2, 2 — is the key signal. The first product class establishes the majority of the substrate because it forces the architecture to represent every fundamental physical phenomenon present in complex electronics, thermal management, structural engineering, and fluid dynamics simultaneously. Each subsequent product class reuses the existing library at radical level while adding at most one or two genuinely novel function classes. The heat pump added zero new radicals despite being a completely different technology to a battery storage system. Two of the four Week 4 products added zero. The CGM wearable added zero. Each new product class tested confirms the universality rather than breaking it.

---

## 7. The Demo — What This Does

The demonstration started with the bill of materials for a 3.5 MWh / 1 MW battery storage system in a 40-foot ISO container — a complex industrial product with 25 line items spanning battery cells, power electronics, switchgear, thermal management, fire suppression, monitoring equipment, and enclosure infrastructure. The demo ran the architecture end-to-end: decomposition, resolution, grammar, cost, and CSV export.

**Decomposition** mapped all 25 lines to the radical library — 100% coverage, zero failures.

**Resolution** queried distributor APIs for real part numbers. Four lines returned verified results:

- `EV200HAANA` — TE Connectivity EV200 series 1,500V DC contactor, quantity 2, £139.16 each, 2–4 business days from Digi-Key
- `MQ135` — electrochemical gas sensor for lithium-ion off-gas detection, quantity 4, £5.09 each, 2–4 business days from Digi-Key
- `EDS-405A` — Moxa 5-port managed industrial Ethernet switch, quantity 2, £985.53 each, 2–4 business days from Digi-Key
- `SMT3000I` — APC Smart-UPS 3000VA online UPS, quantity 1, £2,562, 2–4 business days from Farnell

A further seven lines carried MPN hints from the vendor catalogue — real part numbers that can be pasted directly into a distributor search — and 21 of 25 lines carried manufacturer attribution.

**Grammar** fired all six rules and produced the following verdicts:

- KCL: PASS — 2,000 A in, 2,000 A out at the DC busbar node.
- Galvanic: PASS — copper and aluminium both present, but environment is indoor industrial.
- Voltage derating: **WARN** — LFP cells operating at 3.2V, which is 87.7% of their 3.65V rated voltage. This exceeds the 80% derating threshold. A procurement engineer can confirm the operating point is intentional.
- Fluid mass balance: PASS — coolant loop at 2.5 kg/s in, 2.5 kg/s out.
- Thermal capacity: PASS — 1.2 MW chiller capacity against 1.0 MW thermal load, exactly 20% margin.
- Marine corrosion: PASS — environment is not marine.

**Cost** rolled up the hierarchy with explicit integration markups: £493,131 in parts, plus assembly and integration markups across four levels, totalling £820,637. Each cost driver is attributed — battery cells alone account for 32% of system cost.

**CSV export** produced three files in the correct upload formats for Mouser, Digi-Key, and Farnell. These can be uploaded to the distributor's bill-of-materials import tools — Digi-Key's is at digikey.co.uk/BOM/ — right now to create real purchase carts.

### Comparison to the Existing Pipeline

The current production pipeline uses a per-class approach — different logic for each product type. Running the same BESS bill of materials through both pipelines on the same day produced this comparison:

| Metric | Per-class pipeline | Radical architecture |
|---|---|---|
| Lines with a real MPN | 1 of 26 (3.8%) | 11 of 25 (44%) |
| Lines with verified price | 1 of 26 (3.8%) | 4 of 25 (16%) |
| Lines with manufacturer name | 0 of 26 (0%) | 21 of 25 (84%) |
| Grammar verdicts | None | 6 explicit (5 PASS, 1 WARN) |
| Orderable CSV output | None | 3 files, uploadable now |
| Cost waterfall coherence | Flat sum, no markup | 4-level cascade, auditable |

The per-class pipeline also accepted a £0 placeholder for the DC busbar assembly — a custom copper conductor rated at 1,500V and 2,000A — without flagging it. At market rates, such an assembly costs between £800 and £2,500. The Radical architecture surfaces the gap explicitly as a Grade-D flag rather than allowing a zero-cost line to pass silently into the total.

---

## 8. The 22 Radicals — Full List

These are the 22 universal building blocks that cover all 10 product classes tested.

**Materials (substances)**

| Radical | What it is |
|---|---|
| `steel` | Iron-carbon alloy structural and mechanical material |
| `copper` | High-conductivity metal used for electrical conduction and heat transfer |
| `polymer_thermoplastic` | Synthetic polymer materials that soften on heating — plastics, rubbers, adhesives, membranes, films |
| `mineral_fibre_material` | Non-metallic inorganic fibrous and granular materials — glass wool, mineral wool, syntactic foam, ceramic fibre |
| `composite_fibre_material` | Fibre-reinforced composite materials — carbon fibre reinforced polymer, glass fibre, Kevlar composites |

**Functions (physical capabilities)**

| Radical | What it is |
|---|---|
| `electrical_conducting_function` | The capability to carry electrical current with defined resistance — wires, busbars, traces, terminals |
| `silicon_semiconductor_function` | Solid-state semiconductor behaviour — transistors, logic, analogue electronics, RF, imaging, memory |
| `magnetic_coupling_function` | Transfer of energy or force through magnetic fields — transformers, inductors, motors, permanent magnets |
| `electromechanical_switching_function` | Conversion between electrical energy and mechanical motion or switching action — relays, contactors, solenoids, actuators, springs |
| `thermal_transfer_function` | Directed movement of heat by conduction, convection, or radiation — heatsinks, heat exchangers, thermal interface materials |
| `chemical_sensing_function` | Detection and measurement of chemical species or physical quantities via transduction — gas sensors, electrochemical sensors, pH probes, MEMS pressure sensors |
| `optical_sensing_function` | Detection and measurement using photon interactions — photodetectors, cameras, optical encoders, LiDAR |
| `photon_emission_function` | Generation of light — LEDs, lasers, arc sources, electroluminescent panels |
| `bioprocess_chemistry_function` | Biological and pharmaceutical chemistry functions — biocompatibility, sterilisation, enzyme activity, extractables and leachables |
| `photovoltaic_energy_function` | Conversion of photons to electrical current via the photovoltaic effect — solar cells, MPPT conversion |
| `acoustic_wave_function` | Generation and reception of mechanical pressure waves — sonar transducers, ultrasonic sensors, acoustic modems |

**Energy forms**

| Radical | What it is |
|---|---|
| `electrochemical_energy_function` | Conversion between chemical and electrical energy at electrode interfaces — all battery chemistries, fuel cells, electrochemical sensors |
| `chemical_suppressant_material` | Chemical agents that suppress fire, inhibit corrosion, or arrest reactions — fire suppressants, inhibitors, biocides |
| `lithium_iron_phosphate_chemistry` | Specifically LFP battery chemistry — included as a distinct radical because its thermal stability and cycle life properties are architecturally significant for large energy storage |

**States of matter**

| Radical | What it is |
|---|---|
| `solid_state_of_matter` | The solid phase — all rigid, compliant, and granular physical objects. Present in every single bill-of-materials line across all 10 products tested |
| `fluid_flow_state` | Bulk fluid motion through a defined path — liquids and gases in motion, refrigerants, coolants, nutrients, compressed gases |

**Physical containment**

| Radical | What it is |
|---|---|
| `pressure_vessel_function` | Containment of fluid or gas under pressure — from millibar food-grade CO2 cylinders to 100-bar depth-rated submarine hulls |

---

## 9. What This Means in Practice

### For a Procurement Engineer

The bill of materials in a ForgeOS report built on the Radical architecture is structured differently to a conventional engineering estimate. Each line is classified by grade:

- **VERIFIED** — a distributor API confirmed the part number, price, and availability in the past 24 hours. You can click through to the product page or upload the CSV.
- **EST** — a vendor catalogue entry provides the manufacturer and a price estimate based on published list prices or category knowledge. The part is real; the price should be verified before a purchase order.
- **GRADE-D** — the architecture knows this component exists at this position in the design, but no matching distributor entry or catalogue price was found. The gap is explicit. You know where to focus procurement effort.

Grammar verdicts appear alongside the bill of materials. If the voltage derating rule fires a warning, you see exactly which component triggered it, what the operating-to-rated ratio is, and what the engineering standard requires. If the galvanic corrosion rule would fire a block — copper and aluminium in contact in a salt-air environment — the report tells you that explicitly before you commit to a design.

The three CSV files at the end of the report are in the upload formats accepted by Digi-Key, Farnell, and Mouser. You can take those files to the distributor's bill-of-materials import tool and create a real purchase cart in minutes, not hours.

### For an Investor

The universality claim is empirical. This is not an assertion about what the architecture might achieve across hypothetical product types. The test programme ran against 10 real product classes — energy storage, agriculture, heating and cooling, aerial vehicles, road transport, pharma manufacturing, computing, consumer medical devices, marine robotics, and stratospheric aircraft. It decomposed 227 bill-of-materials lines drawn from real engineering briefs. The radical library did not grow beyond 22 entries.

The architectural consequence is that the economics of the system scale sub-linearly. Every improvement to the architecture — a better resolution algorithm, a new grammar rule, a richer vendor catalogue — applies to all 10 product classes simultaneously. Supporting the 11th product class requires writing at most 2 new radicals and some new characters and archetypes, not rebuilding any logic. The marginal cost of expanding coverage decreases as the library grows.

The moat is the empirical library, the grammar rules, and the catalogue integration — none of which is easily replicated from first principles. A competitor starting today would need to run the same discovery programme across a comparable range of product classes to arrive at the same universal substrate.

### For an Engineer Building the Product

Every fix propagates. In the old per-class architecture, a bug in how the system handled thermal management only affected the product class where the bug was found. In the Radical architecture, the `thermal_transfer_function` radical and the grammar rule for thermal capacity versus load apply across every product class simultaneously. Fix the rule once; all 10 classes benefit.

Onboarding a new product class is a decomposition exercise: take a representative bill of materials, map each line to the existing library, add any characters and archetypes needed, and check whether any new radicals are genuinely required. For the last six products tested, the answer was zero or one new radical per product. The library is stable enough that the decomposition is now the productive part of the work, not the infrastructure building.

---

## 10. What Is Next — the Migration Plan

The Radical architecture currently works in a research sandbox. It has been validated thoroughly: decompositions checked, grammar rules tested, resolution queried against live distributor APIs, costs computed, CSVs generated. The production PDF pipeline still uses the older per-class approach.

Migration from the old architecture to the new one is planned across eight phases over approximately 10 to 12 weeks. The phases replace one piece of the old system at a time with its Radical equivalent, rather than switching everything over at once.

The early phases establish the data model and the new radical library alongside the existing pipeline — no change to what users see yet. Middle phases introduce the resolution and grammar modules, connecting the radical decomposition to real distributor queries and physics checks. Later phases replace the cost computation and report rendering with the hierarchy-aware versions that produce the auditable cost waterfall and the orderable CSVs.

The proof of useful arrives at phases five and six, when the production-rendered report for a real customer brief includes verified part numbers, manufacturer attribution, grammar verdicts, and uploadable distributor CSVs for the first time. At that point, the engineering quality gap between what ForgeOS produces and what a procurement engineer would produce manually narrows substantially.

After migration, the target is the consistent 8-out-of-10 score across all 10 baseline product classes that the current per-class pipeline does not reliably achieve. The voltage derating warning on LFP cells, the orderable CSV with four live-verified lines, the 84% manufacturer attribution rate — these are the quality markers the Radical architecture produces today in the sandbox. After migration, they appear in every production report.

---

## Appendix: Source Data

The findings in this document are drawn from the following source files in the ForgeOS repository:

- `src/lib/pdf-engine-v2/radical/seed-library.ts` — the five seed radicals, ten seed characters, five modifiers, and ten archetypes that defined the starting point
- `src/lib/pdf-engine-v2/radical/grammar.ts` — the six grammar rule implementations and the relaxation-weight optimiser
- `src/lib/pdf-engine-v2/radical/week-2/REPORT.md` — the BESS decomposition report (12 new radicals, 100% coverage, 14:1 directionality ratio)
- `src/lib/pdf-engine-v2/radical/week-3/REPORT.md` — the vertical farm and heat pump report (1 new radical for vfarm, zero for heat pump, first convergence signal)
- `src/lib/pdf-engine-v2/radical/week-4/REPORT.md` — the drone, EV charger, bioreactor, and edge AI server report (2 new radicals across four products, convergence confirmed)
- `src/lib/pdf-engine-v2/radical/week-5/decomposition-cgm-wearable.json` — the CGM wearable decomposition (zero new radicals)
- `src/lib/pdf-engine-v2/radical/week-5/decomposition-auv-coastal.json` — the AUV decomposition (one new radical: `acoustic_wave_function`)
- `src/lib/pdf-engine-v2/radical/week-5/decomposition-haps-stratospheric.json` — the HAPS aircraft decomposition (one new radical: `photovoltaic_energy_function`)
- `src/lib/pdf-engine-v2/radical/demo/COMPARISON-RADICAL-VS-PER-CLASS.md` — the side-by-side quality comparison against the current production pipeline
- `src/lib/pdf-engine-v2/radical/demo/output/bess-bom.md` — the complete rendered BESS bill of materials from the demonstration

---

*Fractional Forge — ForgeOS PDF Engine v2 — Radical Architecture — May 2026*
