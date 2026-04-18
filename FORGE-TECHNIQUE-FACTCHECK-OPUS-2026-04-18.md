# Forge Technique Fact-Check — Opus 4.7 — 2026-04-18

**Reviewer model:** claude-opus-4-7 via Anthropic SDK (cross-model: genuinely independent from DeepSeek-seeded content).
**Rows reviewed:** 80
**Ok (no concerns):** 65
**Concerns:** 15
**Errored (API call failed):** 0
**Flag totals:** High 0 · Medium 19 · Low 29

Unlike the prior DeepSeek-reviews-DeepSeek pass, Opus 4.7 and DeepSeek are different architectures + training data, so the flag set represents independent review rather than model-family confirmation bias. (Claude Opus 4.7 does not expose `temperature` — reasoning is deterministic-enough for a reviewer prompt.)

## High-severity flags

_None._

## Medium-severity flags

### `automated-fibre-placement`
_Entry is broadly technically sound on tolerances, materials, and process description, but misclassifies AFP as additive manufacturing and lists several applications (wind blades, yacht hulls) that are not representative of real AFP use._

- **[application]** Wind turbine blades are overwhelmingly manufactured using glass-fibre infusion (VARTM) or automated tape laying for spar caps, not AFP. AFP tow widths (typically 3.2–12.7 mm) and deposition rates are uneconomical for blade-scale glass structures. This is not a common AFP application.
  > large wind turbine blades
  - Suggested: Remove or replace with a more representative application such as rocket motor cases, pressure vessels, or helicopter rotor components.

### `binder-jetting-metal`
_Broadly accurate entry, but titanium should not be listed as a standard material, best-case tolerance is slightly optimistic, and the shrinkage range upper bound is overstated._

- **[tolerance]** Linear shrinkage for metal binder jetting is typically 15-20% (often cited as ~17-20% for steels), not up to 25%. 25% is on the extreme high end and uncommon. More importantly, shrinkage IS anisotropic (typically greater in Z than XY), so the description is directionally correct, but the magnitude range is overstated.
  > Dimensional accuracy is affected by significant and anisotropic shrinkage (15-25%) during sintering
  - Suggested: Linear shrinkage of approximately 15-20%, with slight anisotropy between build axes.
- **[material]** Titanium is generally NOT a standard/commercial binder jetting material due to its high reactivity with binder residues and oxygen during sintering, which makes achieving acceptable mechanical properties very difficult. It remains in R&D. Listing it alongside 316L and Inconel as a real-world material is misleading for a founder making material selection decisions.
  > Titanium
  - Suggested: Remove titanium, or note it as 'emerging/R&D only'.

### `ceramic-mould-casting`
_Entry is largely accurate but conflates ceramic mould casting (Shaw process) with ceramic shell investment casting, and has a minor error in the per-mm tolerance adder._

- **[other]** These are related but distinct processes. Ceramic mould casting typically refers to processes like Shaw process or Unicast, which use reusable patterns and a solid ceramic mould. Investment casting (lost-wax) uses an expendable wax/plastic pattern with a ceramic shell. The article conflates the two and then describes investment casting.
  > Ceramic mould casting, also known as ceramic shell investment casting
  - Suggested: Clarify that ceramic mould casting (Shaw process) uses reusable patterns and a monolithic ceramic mould, distinct from ceramic shell investment casting which uses expendable wax patterns.

### `cnc-routing`
_Entry is largely accurate, but the equipment list incorrectly includes plasma and laser cutters, which are distinct processes rather than CNC routing equipment._

- **[equipment]** A plasma cutter is not CNC routing equipment. It is a different process (thermal cutting) and should not be listed as equipment used for CNC routing.
  > Plasma Cutter (for metal sheets)
  - Suggested: Remove plasma cutter; replace with something like 'CNC Router with Vacuum Table' or 'Moving Gantry CNC Router'.
- **[equipment]** A laser cutter is an entirely separate process, not CNC routing equipment. Listing it under 'real_world_equipment' for CNC routing is misleading.
  > Laser Cutter (alternative for thinner materials)
  - Suggested: Remove from equipment list (could be mentioned as an alternative process in the article text instead).

### `filament-winding`
_Entry is largely accurate but overstates best-case tolerance and misattributes wind turbine spar caps and leaf springs as common filament-winding applications._

- **[tolerance]** ±0.1 mm is overly optimistic for filament winding, which is a relatively coarse composite process. Dimensional accuracy is limited by fiber band width, tension variation, resin content, and cure shrinkage. Realistic best-case diameter tolerance on a precision mandrel is around ±0.25-0.3 mm, with ±0.5 mm being more typical for best-case.
  > best_mm: 0.1
  - Suggested: best_mm: 0.25
- **[application]** Wind turbine spar caps are almost universally produced via pultrusion, prepreg layup, or vacuum infusion — not filament winding. Blade shells are infused, and spar caps are typically pultruded unidirectional planks. Filament winding is not a common process for this application.
  > Wind turbine rotor blades (spar caps)
  - Suggested: Replace with a more representative application such as 'CNG/hydrogen Type III/IV pressure vessels' or 'electrical utility poles and light standards'.

### `hand-layup`
_Entry is mostly accurate but incorrectly lists wind turbine blades as a typical hand-layup application (they are infused/prepreg) and the best-case tolerance is slightly optimistic._

- **[application]** Modern wind turbine blades (especially utility-scale) are manufactured via vacuum infusion (VARTM) or prepreg processes, not open-mold hand layup. Hand layup cannot achieve the fiber volume fraction, void content, or consistency required for structural blade performance. While early/small blades used hand layup historically, citing wind turbine blades as a typical hand-layup application is misleading.
  > Typical part sizes range from small components to very large structures like boat hulls or wind turbine blades.
  - Suggested: Replace 'wind turbine blades' with an example like 'large tanks' or 'RV/truck body panels'; note that wind blades are typically made via resin infusion, not hand layup.

### `hard-anodising`
_Entry is broadly correct on process fundamentals and tolerances but contains a reversed claim about alloy hard-anodisability and an inappropriate food-processing application example._

- **[material]** This is backwards. High-copper alloys like 2024 and high-zinc alloys like 7075 are notoriously difficult to hard anodise due to copper/zinc content causing burning and poor coating quality. 6061 and 5xxx series are considered the easiest to hard anodise, while 2024 and 7075 require careful process control and typically yield thinner, lower-quality coatings.
  > Harder alloys (e.g., 7075) coat more easily than softer ones.
  - Suggested: Alloy composition strongly affects coating quality. 6061 and 5052 hard-anodise readily; high-copper (2024) and high-zinc (7075) alloys are more difficult and produce lower-quality coatings. Cast alloys with high silicon (e.g., A356) yield grey/mottled finishes.
- **[application]** Hard anodising on food-contact surfaces is uncommon because the coating is porous (unless sealed) and can harbor bacteria, and sulfuric-acid-derived coatings are not generally FDA-approved for direct food contact. This is not a typical hard-anodise application.
  > Food processing machinery parts
  - Suggested: Remove, or replace with a more representative application such as 'firearms components' or 'medical device housings (non-contact)'.

### `impact-extrusion`
_Entry is broadly accurate but incorrectly lists aluminum beverage cans as an impact-extrusion application (they are DWI-formed), with minor optimism in best-case tolerance and an overstated material constraint._

- **[application]** Aluminum beverage cans are produced by drawing and wall ironing (DWI), not impact extrusion. Impact extrusion is used for aerosol cans, bottle-shaped containers, and similar monobloc containers, but not standard beverage cans.
  > aluminum beverage cans
  - Suggested: Remove 'aluminum beverage cans' and replace with 'monobloc aluminum bottles' or 'aluminum aerosol/cosmetic bottles'.

### `riveting`
_Entry is technically sound on process fundamentals and design rules, but lists historical applications (structural steel, shipbuilding) as current common uses, which is misleading for a modern DFM reference._

- **[application]** Riveting in structural steelwork for new bridges and buildings was largely superseded by high-strength bolting and welding by the 1960s-70s. Listing this as a current common application is misleading; it is primarily relevant to historical structures and restoration/repair work.
  > structural steelwork (bridges, buildings)
  - Suggested: historical/heritage structural steelwork (bridge and building restoration)
- **[application]** Modern shipbuilding uses welding almost exclusively for hull and deck assemblies. Riveted hulls were phased out by the mid-20th century. This is not a current common application.
  > shipbuilding hull and deck assemblies
  - Suggested: Remove, or qualify as historical shipbuilding

### `rotational-moulding`
_Entry is broadly accurate for rotational moulding fundamentals, but polycarbonate is misrepresented as a common material and tolerance best-case could mislead designers of small parts._

- **[tolerance]** ±2mm is reasonable for typical medium parts, but the best-case for small, well-controlled rotomolded parts can be tighter, around ±0.5mm. However, listing 2mm as 'best' is actually overly pessimistic for small parts. More concerning is that tolerances scale with part size (commonly expressed as ±% of dimension, e.g. ±1.5-2% for PE), so a fixed best_mm is somewhat misleading but the value itself isn't egregiously wrong.
  > best_mm: 2
  - Suggested: best_mm: 0.5 to 1 for small features on small parts
- **[material]** PVC is used in rotomolding primarily as plastisol (liquid form), not as powder, which is a distinct process variant worth noting. Polycarbonate is rarely rotomolded in practice due to its high processing temperature and moisture sensitivity; it is not a common rotomolding material. Nylon (PA6, PA11, PA12) is legitimate but specialized. Listing PC alongside PE/PP as if equivalent is misleading.
  > polyvinyl chloride, nylon, polycarbonate
  - Suggested: Replace polycarbonate with cross-linked polyethylene (XLPE) or EVA; clarify PVC is used as plastisol

### `sinker-edm`
_Entry is largely accurate on process behavior and tolerances, but includes two misleading application/material claims (turbine cooling holes and deionized water dielectric) that conflate sinker EDM with hole-popping and wire EDM._

- **[application]** Turbine blade cooling holes are almost exclusively produced by fast-hole/hole-popping EDM, laser drilling, or STEM drilling — not sinker EDM. Listing this as a common sinker EDM application is misleading.
  > turbine blade cooling holes
  - Suggested: Replace with an application like 'extrusion dies' or 'deep rib features in molds'; cooling holes belong under hole-drilling EDM or laser.
- **[material]** Sinker EDM almost universally uses hydrocarbon dielectric oil. Deionized water is the standard dielectric for wire EDM, not sinker EDM. Mentioning it as a common sinker dielectric is misleading.
  > dielectric fluid (usually hydrocarbon oil or deionized water)
  - Suggested: State that sinker EDM uses hydrocarbon/kerosene-based dielectric oil; deionized water is specific to wire EDM.

### `soldering`
_Largely accurate entry, but 'attaching heat sinks' is not a standard soldering application and the materials list conflates base metals with solder alloys._

- **[application]** Heat sinks are almost always attached using thermal interface materials (thermal paste, pads, adhesives) with mechanical clips or screws, not solder. Solder is occasionally used for specialty RF/power modules but it is not a common general application and listing it alongside PCB assembly is misleading.
  > attaching heat sinks to electronic components
  - Suggested: Remove this item, or replace with something like 'battery pack tab connections' or 'RF shield can attachment'.

## Low-severity flags

### `anodising`
_Entry is broadly accurate; minor concerns about hard-anodise dimensional growth being understated and non-aluminium materials requiring process qualification._

- **[tolerance]** These figures describe decorative Type II only. Hard anodise (Type III) at 50+ microns grows ~50% into the surface and 50% out, meaning dimensional change per surface can reach 0.025-0.05mm, with hole/shaft fit changes up to 0.1mm. The 'worst' figure understates hard anodise growth.
  > best_mm: 0.01, worst_mm: 0.05, typical_mm: 0.025
  - Suggested: worst_mm: 0.10 (for hard anodise at max thickness)
- **[material]** Magnesium can be anodised (e.g. Keronite, Tagnite, Dow 17 processes) but these are plasma electrolytic oxidation or specialty processes, not conventional acid-bath anodising as described in the article. Listing it alongside aluminium without qualification is slightly misleading; titanium anodising is also a different (colour-by-interference) process, not corrosion-protective oxide growth.
  > magnesium
  - Suggested: Qualify as 'titanium (decorative/colour only)' and 'magnesium (specialty PEO processes)'

### `binder-jetting-sand`
_Entry is broadly accurate on tolerances, materials, equipment, and applications; only minor issue is the draft-angle tip which reflects pattern-based casting rather than binder jet sand molding._

- **[application]** Unlike conventional sand casting where draft facilitates pattern removal, binder jet sand molds are printed directly and the pattern is never pulled. Draft is generally unnecessary, though it can still aid loose-sand removal from deep blind pockets.
  > Draft angles are not strictly required for printed sand molds since there is no pattern pull; the tip conflates this with pattern-based sand casting.
  - Suggested: Draft angles are generally not required (no pattern pull), but consider mild draft or access holes on deep blind pockets to aid loose sand removal.

### `brazing`
_Entry is technically accurate for brazing fundamentals, tolerances, materials, and equipment; only a minor terminology nuance around jewelry applications._

- **[application]** Jewelry joining with silver/gold filler below 450°C is technically soldering (hard soldering), not brazing, though the distinction is sometimes blurred. The other applications are solidly brazing. Minor point.
  > jewelry and decorative metalwork
  - Suggested: Could clarify as 'jewelry (silver brazing/hard soldering)' or remove if strict brazing definition is intended.

### `carburising`
_Entry is broadly accurate for carburising; only minor material-grade and application nuances warrant correction._

- **[material]** 4140 is a medium-carbon (~0.40% C) through-hardening steel, not a typical carburising grade. The intended reference is almost certainly 4320 and 4140 should be replaced with 4140's carburising counterpart 4120, or other carburising alloy grades like 4620, 8620, 9310.
  > Alloy steels (e.g., 4140, 4320)
  - Suggested: Alloy carburising steels (e.g., 4320, 4620, 8620, 9310)
- **[application]** Most rolling-element bearings use through-hardened high-carbon steels (52100) rather than carburised steel. Carburised bearings (e.g., 8620, M50NiL) exist for large or shock-loaded applications but are not the common case; listing this as a general common application is somewhat misleading.
  > Bearing races and rollers
  - Suggested: Large or heavily-loaded bearing races (e.g., wind turbine, aerospace bearings using 8620 or M50NiL)

### `chromate-conversion`
_Entry is broadly accurate with appropriate caveats on Cr6+ regulation and correct referencing of MIL-DTL-5541; only a minor understatement of maximum coating thickness._

- **[tolerance]** The coating thickness range is correct for typical Class 3 chromate, but thicker Class 1A coatings per MIL-DTL-5541 can reach 2-4 micrometers (0.002-0.004 mm). The stated range understates heavier yellow/iridescent coatings used for maximum corrosion resistance.
  > Coating adds negligible thickness (0.0005–0.0015 mm)
  - Suggested: Coating thickness typically 0.0005–0.004 mm depending on class (thin Class 3 vs. heavier Class 1A).

### `cold-forging`
_Entry is broadly accurate in tolerances, materials, and equipment; only concern is one questionable application example (ABS valve bodies) which is not a typical cold-forged part._

- **[application]** ABS valve bodies/manifolds are typically produced as aluminum die castings or from machined aluminum extrusions/billets, not cold forged, due to their complex internal porting that cold forging cannot produce.
  > anti-lock braking system (ABS) valve bodies
  - Suggested: Replace with a more representative cold-forged part such as CV joint outer races, wheel bolts/lug bolts, or steering/suspension ball studs.

### `cold-spray-additive`
_Entry is broadly accurate with realistic tolerances and materials; only minor concern is the turbine blade example for aerospace repair, which is not representative of typical cold spray applications._

- **[application]** Cold spray is commonly used for repair of aerospace housings, gearboxes, and magnesium/aluminum castings, but turbine blades (especially hot-section airfoils made from superalloys) are not a typical cold spray repair target due to bonding challenges with superalloys and the high-stress, high-temperature service environment. Housings and structural components are the more accurate example.
  > Repair and restoration of aerospace components (e.g., turbine blades, housings)
  - Suggested: Repair and restoration of aerospace components (e.g., gearbox housings, magnesium/aluminum castings, structural components)

### `continuous-casting`
_Entry is broadly accurate on process fundamentals and equipment, but the best-case tolerance is pessimistic and the copper cathode application is technically incorrect._

- **[tolerance]** Continuous casting typically holds much tighter cross-sectional tolerances than ±5mm. Modern slab casters hold thickness to ±1-2mm, and billet casters can hold ±2-3mm on square dimensions. ±5mm as best-case is overly pessimistic.
  > best_mm: 5
  - Suggested: best_mm: 1-2
- **[application]** Copper cathodes are produced by electrorefining/electrowinning, not continuous casting. Continuous casting of copper produces wire rod (e.g., via Southwire/Contirod/Properzi processes) or billet, not cathodes. The cathode is actually the input feedstock that gets melted and continuously cast.
  > Copper cathodes for drawing into wire
  - Suggested: Copper wire rod for drawing into wire (e.g., via Southwire or Contirod processes)

### `edm-drilling`
_Entry is broadly accurate and technically sound; minor optimism on best-case tolerance and one slightly misleading application._

- **[equipment]** While tubular electrodes with rotation are common for fast-hole EDM, solid electrodes are also used for very small holes (<0.3mm) where a through-hole for flushing isn't feasible. The entry presents tubular as universal.
  > uses a rotating tubular electrode
  - Suggested: uses a rotating (usually tubular) electrode; solid electrodes are used for the smallest holes
- **[tolerance]** ±0.005 mm on hole diameter is optimistic for fast-hole EDM drilling. That level is more typical of die-sinker or micro-EDM with fresh electrodes and shallow holes. Realistic best-case for production fast-hole EDM is closer to ±0.01–0.015 mm.
  > best_mm: 0.005
  - Suggested: best_mm: 0.01
- **[application]** Microfluidic devices are overwhelmingly made from polymers (PDMS, PMMA) or glass/silicon, which are non-conductive and cannot be EDM'd. While EDM can produce channels in conductive mold inserts for microfluidic replication, listing microfluidic components as a direct common application is misleading.
  > micro-fluidic device components
  - Suggested: mold inserts for microfluidic device replication, or remove this bullet

### `electron-beam-melting`
_Entry is broadly accurate and technically sound; minor concerns are an optimistic best-case tolerance and one misplaced application (conformal cooling tooling is an LPBF domain, not EBM)._

- **[application]** Conformal cooling inserts for injection mold tooling are typically made from tool steels (e.g., H13, maraging steel) via laser powder bed fusion (LPBF/DMLS), not EBM. EBM's material palette (Ti, CoCr, Ni-superalloys) and rough surface finish make it a poor fit for mold tooling inserts. This is not a common EBM application.
  > Conformal cooling channels for tooling
  - Suggested: Replace with a more typical EBM application such as 'Custom acetabular cups and porous-structured orthopedic implants' or 'High-temperature Ni-superalloy aerospace components.'
- **[tolerance]** EBM best-case tolerance of ±0.1 mm is optimistic for as-built parts; published data from GE Additive/Arcam typically cites ±0.2 mm on small features and ±0.3–0.4 mm on larger dimensions. ±0.1 mm is generally only achievable after machining.
  > "best_mm": 0.1
  - Suggested: best_mm: 0.2 (as-built); note ±0.1 mm or better requires post-machining.

### `extrusion-plastic`
_Entry is broadly accurate for plastic extrusion; tolerances, materials, equipment, and applications are realistic, with only a minor terminology slip._

- **[other]** Minor terminology error - in extrusion, the supplier is called an extruder or extrusion processor, not a molder (which refers to injection/blow molding).
  > consult your molder for specific values
  - Suggested: consult your extruder/material supplier for specific values

### `fast-hole-edm`
_Entry is broadly accurate with minor optimism on smallest hole size and best-case tolerance._

- **[tolerance]** Fast-hole EDM can produce holes as small as ~0.1 mm (and some machines down to 0.05 mm with fine electrodes) and up to about 6 mm in diameter. The stated range is narrower than industry standard.
  > The technique produces holes from about 0.3 mm to 3.0 mm in diameter
  - Suggested: Approximately 0.1 mm to 6.0 mm in diameter
- **[tolerance]** ±0.01 mm is optimistic for fast-hole EDM, which is a roughing/hole-making process with significant overburn and electrode wear. Small-hole EDM or die-sinker EDM can reach that precision, but fast-hole EDM typically holds ±0.02–0.05 mm at best on diameter and position.
  > best_mm: 0.01
  - Suggested: best_mm: 0.02

### `gas-assisted-injection`
_Entry is largely accurate for GAIM but includes one questionable material (acrylic) and one misleading application (pressure pipe fittings) that should be corrected._

- **[material]** PMMA (acrylic) is rarely used in gas-assisted injection molding. It is brittle, has poor melt strength for gas channel formation, and is not a standard GAIM material. Common GAIM materials are semi-crystalline or tough amorphous thermoplastics like ABS, PP, PC, PC/ABS, PA, and filled variants.
  > acrylic
  - Suggested: Replace 'acrylic' with 'PC/ABS blends' or 'glass-filled nylon'
- **[application]** Pressurized plumbing fittings are typically not made by GAIM because the hollow gas channel geometry is uncontrolled and not suitable for pressure-rated fluid conveyance. Decorative faucet handles/spout covers may be GAIM, but actual pipe fittings are not a common application.
  > plumbing fixtures and pipe fittings
  - Suggested: Replace with 'decorative faucet handles and shower arms' or remove
- **[other]** The standard is SPI (Society of the Plastics Industry) mold finish, now SPI/SPE; the designation 'SPI-SPE' is nonstandard phrasing. The finish range cited is reasonable but the naming is muddled.
  > SPI-SPE A2 to C1
  - Suggested: Use 'SPI A2 to C1 (now SPE/SPI standard)'

### `gravity-die-casting`
_Entry is broadly accurate with realistic tolerances and reasonable process description; only minor concerns around listing gray iron as typical and wheel hubs as a common application._

- **[material]** Gravity die casting of gray iron is uncommon because ferrous alloys significantly reduce mold life due to high pouring temperatures (~1400°C) versus aluminum (~700°C). While technically possible with specialized graphite or high-temperature alloy molds, it is a niche application and listing it alongside aluminum/zinc as a typical material is misleading. Ferrous permanent mold casting exists but is rare commercially.
  > Gray iron
  - Suggested: Remove gray iron, or note it as 'rare/specialized' - typical materials are non-ferrous (Al, Mg, Zn, Cu alloys).
- **[application]** Automotive pistons are more commonly produced by gravity die casting or squeeze casting, so that's fine. However, automotive wheel hubs are typically forged or produced by low-pressure die casting (for aluminum wheels), not gravity die casting. Intake manifolds are often gravity or low-pressure cast — acceptable.
  > Automotive components (wheel hubs, pistons, intake manifolds)
  - Suggested: Replace 'wheel hubs' with 'wheels (low-pressure variant)' or remove; pistons and cylinder heads are better canonical examples.

### `hvof-coating`
_Entry is broadly accurate with realistic tolerances and materials; only notable issue is the mischaracterization of HVOF as a thermal barrier coating process._

- **[application]** HVOF is generally not the preferred process for thermal barrier coatings (TBCs). TBCs (typically YSZ) are usually applied by APS (Air Plasma Spray) or EB-PVD because they require a porous, low-thermal-conductivity microstructure, whereas HVOF produces dense coatings. HVOF is more commonly used for bond coats (e.g., MCrAlY) under TBCs, not the TBC topcoat itself.
  > thermal barrier coatings
  - Suggested: Replace 'thermal barrier coatings' with 'bond coats' or remove TBC from the list of typical HVOF applications.

### `incremental-sheet-forming`
_Entry is broadly accurate for single-point incremental forming; only a minor over-generalization on maximum wall angle._

- **[tolerance]** The maximum formable wall angle depends on material, but for common aluminum alloys (AA1050, AA5754) in single-point ISF the practical limit is typically ~65-70°. Stating 'over 70° risk fracture' is slightly optimistic as a general rule; for harder alloys and steels the safe limit is often 50-60°.
  > wall angles over 70° risk fracture
  - Suggested: Wall angles above ~60-65° (material dependent) risk fracture; aluminum can reach ~70° with careful toolpath and lubrication.

### `material-extrusion-composite`
_Entry is broadly accurate for continuous fiber composite extrusion with minor optimism on best-case tolerance and build volume, and one questionable matrix material (TPU)._

- **[equipment]** Most commercial continuous fiber composite printers (Markforged X7, Anisoprint, Desktop Metal Fiber) have build volumes closer to 330-525mm in the largest dimension. 1-meter systems exist (e.g., Markforged FX20 at ~525mm, or large-format Continuous Composites/Moi systems) but are not 'common'. Typical industrial CFF build envelopes are ~300-500mm.
  > commonly up to 1 meter in one dimension
  - Suggested: commonly up to 300-500mm in the largest dimension, with large-format systems extending beyond 1 meter
- **[tolerance]** A best-case tolerance of ±0.15mm is slightly optimistic for continuous fiber composite extrusion given the larger nozzle diameters (0.8-1.2mm) noted in the entry itself and typical anisotropic warping. Realistic best case on well-calibrated systems like Markforged is closer to ±0.2mm.
  > best_mm: 0.15
  - Suggested: 0.2
- **[material]** TPU (a flexible elastomer) is not a typical matrix material for continuous fiber reinforcement. The stiffness mismatch between a flexible matrix and continuous fiber defeats the purpose of the reinforcement, and no major commercial CFF system offers continuous-fiber-reinforced TPU as a standard material.
  > Thermoplastic polyurethane with fiber reinforcement
  - Suggested: Remove TPU, or replace with PA-based CF/GF or PPS/PEKK with carbon fiber

### `micro-injection-moulding`
_Entry is broadly accurate and technically sound; only the best-case tolerance claim is slightly optimistic._

- **[tolerance]** ±5 µm is at the extreme edge of what micro-injection moulding can achieve and is generally only possible on very small, single features under tightly controlled conditions. A more realistic best-case for general micro-moulded features is ±0.01 mm (±10 µm).
  > best_mm: 0.005
  - Suggested: best_mm: 0.01

### `nitriding`
_Entry is broadly accurate with realistic tolerance and case-depth figures; only minor concerns about listing cast irons as typical and not explicitly noting the systematic dimensional growth._

- **[material]** While some ductile/gray cast irons can be nitrided (particularly ductile iron with alloying elements), listing 'cast irons' generically as a typical nitriding material is misleading. Plain cast irons lack the nitride-forming elements (Cr, Mo, Al) that are specifically called out earlier in the entry as requirements. Nitriding of cast iron is a niche application, not a common one.
  > cast irons
  - Suggested: alloyed ductile cast irons (limited applications)
- **[tolerance]** Nitriding typically causes a slight dimensional growth (roughly 0.025–0.05 mm of growth due to volume expansion of the case), not merely a tolerance band. The entry frames this as a tolerance band without noting the systematic growth, which could mislead a designer who needs to compensate in pre-machining dimensions.
  > The typical tolerance band for post-nitriding dimensions is ±0.05 mm to ±0.1 mm

### `parylene-conformal-coating`
_Entry is broadly accurate, but contains a notable technical error claiming parylene is line-of-sight (it is not), an internal inconsistency in thickness range, and one questionable application example._

- **[application]** Parylene CVD is specifically NOT line-of-sight; that is one of its primary advantages over PVD or liquid coatings. The monomer gas penetrates crevices and coats all exposed surfaces uniformly.
  > The process is line-of-sight but highly conformal, penetrating deep into assemblies.
  - Suggested: The process is non-line-of-sight and highly conformal, penetrating deep into assemblies.
- **[tolerance]** Stated thickness range in the article is 500 nm to 75 µm (0.0005 to 0.075 mm). The worst_mm value of 0.01 is inconsistent with the article's 75 µm upper bound.
  > best_mm: 0.0005
  - Suggested: worst_mm: 0.075
- **[application]** Parylene is used for dielectric insulation in electronics and small components, but bulk transformer high-voltage insulation is typically done with varnishes, oils, or solid insulators—not parylene, due to cost and thickness limits.
  > High-voltage insulation for transformers

### `passivation`
_Entry is technically accurate; tolerances, materials, equipment, and applications are all consistent with standard passivation practice._

- **[other]** The copper sulfate test per ASTM A967 detects free iron contamination on the surface, not the presence/effectiveness of the chromium oxide passive layer itself. It's a test for passivation success by proxy, but the wording is slightly misleading.
  > a copper sulfate test can be used to verify the effectiveness of the oxide layer
  - Suggested: a copper sulfate test (per ASTM A967) can be used to detect residual free iron and verify passivation was effective

### `polyjet`
_Entry is broadly accurate with only minor technical nits around post-curing equipment and best-case layer resolution._

- **[equipment]** PolyJet parts are fully UV-cured in-process during printing and do not typically require post-curing UV chambers (unlike SLA/DLP). Post-curing is not a standard part of the PolyJet workflow, though some specialty resins may benefit from it.
  > post-curing UV chambers
  - Suggested: Remove 'post-curing UV chambers' or replace with 'optional post-curing chambers for specialty resins'
- **[tolerance]** Standard PolyJet layer resolution goes down to 14 microns on high-resolution Stratasys J-series machines (e.g., J750/J850), not 16. 16 microns is correct for some older systems but 14 µm is the current best-case.
  > down to 16 microns
  - Suggested: down to 14 microns

### `prepreg-autoclave`
_Entry is technically sound with realistic tolerances and appropriate applications; only a minor equipment listing is out of place._

- **[equipment]** A heated platen press is associated with compression molding or press-cure processes, not autoclave curing. While it may be used for adjacent/alternative prepreg processing, listing it as autoclave equipment is misleading in this context.
  > heated platen press
  - Suggested: Remove, or replace with 'oven for out-of-autoclave (OOA) post-cure' or 'hot drape former'

### `resin-transfer-moulding`
_Entry is broadly accurate with realistic tolerances and materials; only minor issues with application scope (wind blades) and a tooling-cost comparison._

- **[application]** Full-length wind turbine blades are almost universally produced by VARTM/infusion rather than conventional RTM due to their size (often >60m) exceeding practical matched-mould RTM capability. Nacelle covers and smaller blade components are reasonable, but listing blades as a common RTM application is misleading.
  > wind turbine blades and nacelle covers
  - Suggested: wind turbine nacelle covers and smaller blade root/spar components (full blades typically use infusion/VARTM)
- **[equipment]** RTM tooling costs are generally comparable to or can exceed compression moulding tooling, since both require matched metal moulds; RTM adds injection/sealing complexity. The comparison is not reliably in RTM's favor.
  > higher tooling costs than open moulding but lower than compression moulding

### `resistance-spot-welding`
_Entry is broadly accurate with realistic tolerances and applications; only minor nuances around material applicability and weld-spacing rules of thumb warrant correction._

- **[material]** RSW is not limited to ferrous materials; it is widely used on aluminum, copper alloys, nickel, and dissimilar metals. The limitation is more about resistivity matching and conductivity being neither too high nor too low, not ferrous vs non-ferrous.
  > the process is generally limited to conductive, typically ferrous, materials
  - Suggested: the process works best on materials with moderate electrical resistivity; highly conductive metals like copper and aluminum require higher currents and specialized equipment
- **[application]** Typical minimum weld pitch guidance is closer to 3x–5x sheet thickness for thin sheet, scaling higher for thicker stock. 10x is conservative but not a standard industry rule-of-thumb for all cases.
  > Weld spacing should be at least 10x material thickness to prevent current shunting through adjacent welds.
  - Suggested: Minimum weld spacing typically ranges from 3x to 10x material thickness depending on sheet gauge and material, to limit shunting.

### `self-piercing-riveting`
_Entry is broadly accurate and technically sound; minor optimism on best-case placement tolerance and one questionable application (aerospace interiors) listed as common._

- **[tolerance]** SPR placement accuracy with robotic cells is typically ±0.3–0.5 mm; best-case of ±0.2 mm is achievable but optimistic for production. Not egregious but slightly tight.
  > In-line accuracy for rivet placement is typically ±0.5 mm... best_mm: 0.2
  - Suggested: best_mm: 0.3
- **[application]** SPR is not a common aerospace joining method; aerospace overwhelmingly uses solid rivets, lockbolts, or Hi-Lok fasteners due to certification and fatigue requirements. Listing this as a common application is misleading.
  > aluminum structural components in aerospace interiors

### `sheet-metal-deep-drawing`
_Entry is broadly accurate with realistic tolerances, materials, and applications; only minor definitional and radius-guideline imprecisions noted._

- **[application]** The standard definition of deep drawing is when the depth is greater than half the diameter (or draw ratio > ~0.5). Depth greater than diameter is achievable but requires multiple redraws and is not the threshold definition.
  > components with depths greater than their diameter
  - Suggested: components with depths greater than half their diameter
- **[tolerance]** Typical guidance for punch/die corner radii in deep drawing is 4–10x material thickness for die radius and 4–6x for punch radius, but the minimum recommended is usually stated as at least 5-10x for die radius to prevent tearing. The 4-6x figure is on the low end and more applicable to punch radius specifically.
  > Design with generous corner radii (at least 4-6x material thickness) to prevent tearing
  - Suggested: Design with generous die corner radii (at least 6-10x material thickness) and punch radii (4-6x) to prevent tearing.

### `sheet-metal-fine-blanking`
_Entry is technically sound overall; minor conservatism on thickness range and internal corner radius guidance, but no factual errors or unsafe advice._

- **[tolerance]** Fine-blanking is commonly performed down to about 0.5 mm thickness, and on large presses can go up to 16-19 mm in soft steels. The 1-10 mm range is conservative but not wrong; the lower bound especially understates the process capability for thin precision parts.
  > Typical part thickness ranges from 1 mm to 10 mm
  - Suggested: 0.5 mm to 16 mm, with 2-8 mm most common
- **[tolerance]** Standard fine-blanking corner radius guidance is typically 10-20% of material thickness (0.1t to 0.2t) for harder materials, and can go smaller for softer/thinner stock. 0.5t-1t is overly conservative and would unnecessarily restrict design.
  > Avoid sharp internal corners; specify a minimum radius of 0.5t to 1t
  - Suggested: minimum internal radius of approximately 0.1t to 0.2t depending on material strength and thickness

### `sheet-metal-hydroforming`
_Entry is broadly accurate with realistic tolerances, materials, and equipment; only minor concern is that bicycle frame components are a tube hydroforming application rather than sheet hydroforming._

- **[application]** Bicycle frame components (tubes, hydroformed top tubes, etc.) are typically made by tube hydroforming, not sheet hydroforming. Listing this under sheet metal hydroforming is misleading, though related.
  > bicycle frame components
  - Suggested: Remove or clarify as a tube hydroforming application; replace with something like 'cookware and stainless steel vessels' or 'lighting reflectors'.

### `sheet-metal-spinning`
_Entry is broadly accurate with realistic tolerances, materials, and applications; only a minor clarification needed regarding the distinction between conventional and shear spinning._

- **[other]** This is true for conventional spinning but not for shear spinning/flow forming, which are common variants that deliberately thin the wall per the sine law. The blanket statement is slightly misleading, though the subsequent tip correctly notes uniform thickness as a design guideline.
  > The metal flows over the form without significant thinning
  - Suggested: Clarify: 'In conventional spinning, the metal flows without significant thinning; in shear spinning, wall thickness is deliberately reduced per the sine law.'

### `shell-moulding`
_Entry is broadly technically accurate with reasonable tolerance and finish claims; minor issues with one application example (connecting rods) and one equipment term (investment machines)._

- **[application]** Connecting rods are typically forged, not cast, due to fatigue loading requirements. Camshafts can be shell-moulded cast iron, so that part is fine, but connecting rods are a misleading example for this process.
  > automotive engine components (camshafts, connecting rods)
  - Suggested: automotive engine components (camshafts, rocker arms, cylinder heads for small engines)
- **[equipment]** "Investment machines" is incorrect terminology here — investment refers to a different casting process (lost wax). Shell moulding uses dump boxes or shell moulding machines (sometimes called blow machines or core-blowers for shell cores).
  > dump boxes or investment machines
  - Suggested: dump boxes or shell moulding machines

### `solution-heat-treatment`
_Entry is largely technically accurate with correct tolerance ranges and process description; minor errors around W-temper characterization and stainless steel applicability should be corrected._

- **[application]** The W temper is actually not very soft - it is an unstable condition that naturally ages and can be relatively hard. More importantly, machining in the W temper is actually common practice for forming operations because the material is more ductile than T6 but work hardens. The claim that W is 'very soft' is incorrect; it is the O (annealed) temper that is very soft. Additionally, machining is typically done in T-tempers for dimensional stability, not because W is 'too soft.'
  > The 'solution heat treated' (W temper) condition is very soft and unsuitable for machining; machine in the annealed (O) or aged (T) tempers.
  - Suggested: The W temper is unstable (naturally ages over time), making it dimensionally unreliable for finished parts; rough machining is often done in O or T4 temper, with final machining in the stable T6/T651 condition.
- **[material]** SHT is applied to precipitation-hardening (PH) stainless steels specifically (like 17-4 PH, 15-5 PH), not 'some stainless steels' generally. Most stainless steels (austenitic, ferritic, martensitic) do not undergo SHT in the precipitation-hardening sense, though austenitic grades do undergo solution annealing, which is a related but distinct process.
  > primarily aluminum and some stainless steels
  - Suggested: primarily aluminum alloys, precipitation-hardening stainless steels (e.g., 17-4 PH), nickel-based superalloys, and some copper and titanium alloys

### `superplastic-forming`
_Entry is broadly accurate with realistic tolerances and process description; only minor material and application specificity concerns._

- **[material]** Al 2090 is an Al-Li alloy; while some Al-Li grades have been studied for SPF, 2090 is not a commonly cited superplastic grade. More typical superplastic aluminum alloys include 5083 SPF, 7475, 2004 (Supral), and 8090 (Al-Li).
  > Aluminum 2090
  - Suggested: Replace with Al 8090 or Al 2004 (Supral)
- **[application]** SPF is more commonly used for secondary structures, ducting, engine nacelle components, and internal structural panels rather than primary wing or fuselage skin panels, which are typically made by other means due to post-SPF property degradation (cavitation, grain growth).
  > Aircraft wing and fuselage panels
  - Suggested: Aerospace secondary structural panels, engine nacelle components, and internal structures

### `swiss-cnc-turning`
_Entry is technically sound with realistic tolerance claims and appropriate applications; only a minor understatement of practical length capacity._

- **[equipment]** The 32 mm upper diameter is reasonable for many Swiss machines, but length capacity is understated. Swiss lathes commonly handle lengths well beyond 300 mm in a single setup (often limited by bar capacity, commonly up to ~500-600 mm per cycle, and effectively unlimited for bar-fed production). 300 mm is more representative of a single slender-part length, not a machine limit.
  > Typical part diameters range from 0.5 mm to 32 mm, with lengths up to 300 mm.
  - Suggested: Lengths commonly up to ~500 mm per part, with bar-fed continuous production for shorter parts.

### `thermoforming`
_Entry is broadly accurate with realistic tolerances and appropriate materials; only minor issues with a slightly conservative corner radius guideline and a potentially misleading body-panel example._

- **[tolerance]** Standard thermoforming design guidance typically recommends internal corner radii of at least 1x material thickness (minimum) with 2-3x being preferred for good material distribution. 4x is more generous than typical published guidelines and may be overly conservative for general use, though not incorrect per se.
  > use generous radii (at least 4x material thickness)
  - Suggested: use generous radii (at least 1-2x material thickness, preferably more for deep draws)
- **[application]** Exterior vehicle body panels are not a common thermoforming application; they are typically stamped steel, aluminum, or injection-molded/SMC composites. Thermoforming is used for interior trim, truck bed liners, and some RV/recreational vehicle panels, but 'vehicle body panels' as a size reference is misleading for mainstream automotive.
  > vehicle body panels

### `ultrasonic-welding-metal`
_Entry is technically sound and realistic; only a minor concern that 'foil packaging seals' is inconsistent with the stated non-hermetic nature of the process._

- **[application]** Foil packaging seals are typically made using ultrasonic welding of polymer-laminated foils (plastic welding mode) or heat sealing, not ultrasonic metal welding. Pure metal foil package hermetic sealing is not a common ultrasonic metal welding application; the process creates discrete bonds, not continuous hermetic seams (as the entry itself notes in tips).
  > Foil packaging seals
  - Suggested: Replace with 'Busbar-to-foil joints in battery modules' or 'Copper/aluminum foil stack welding for battery tabs'

### `upset-forging`
_Entry is broadly accurate for upset forging; minor concerns about the 3D buckling rule being at the optimistic end and 'valve bodies' being an atypical example for this specific process._

- **[tolerance]** The classical upset forging rule (Kent's rules / ASM Handbook) states the unsupported length should not exceed approximately 2.5 to 3 times the bar diameter, commonly cited as 3D maximum, but the more conservative and widely taught limit is 2.5D. The statement is acceptable but at the upper bound; buckling risk increases significantly near 3D.
  > The maximum unsupported length that can be upset in one blow is typically 3 times the bar diameter.
  - Suggested: The maximum unsupported length that can be upset in one blow without buckling is typically 2.5 to 3 times the bar diameter (Kent's first rule).
- **[application]** Valve bodies are typically produced by closed-die forging or casting, not upset forging, since they involve complex 3D cavities rather than axisymmetric upsetting of a bar end. This is not a characteristic upset-forging application.
  > valve bodies
  - Suggested: Replace with a more representative part such as 'axle shafts' or 'pinion blanks'.

### `vat-photopolymerisation-dlp`
_Entry is broadly accurate for DLP vat photopolymerisation with only minor optimism on best-case tolerance and a small clarification needed on dental aligner printing._

- **[application]** Dental aligners themselves are typically thermoformed over DLP-printed models, not directly DLP-printed (though this is changing with newer direct-print aligner resins). Crowns and surgical guides are correctly DLP-printed. Minor clarification issue, not a factual error for surgical guides/crowns.
  > Dental aligners, crowns, and surgical guides
  - Suggested: Dental models (for thermoforming aligners), crowns, and surgical guides
- **[tolerance]** ±0.025 mm is achievable on very small features with well-calibrated industrial DLP but is optimistic as a general best-case; ±0.05 mm is more realistic for best-case across typical DLP work. Not egregious given qualifier about geometry dependence.
  > best_mm: 0.025
  - Suggested: 0.05 mm best-case; keep 0.025 mm only as a small-feature edge case

## OK rows

- `5-axis-cnc-milling`
- `adhesive-bonding-structural`
- `aging-precipitation-hardening`
- `anodising`
- `binder-jetting-sand`
- `blow-moulding`
- `braiding-composite`
- `brazing`
- `carburising`
- `case-hardening`
- `centrifugal-casting`
- `chemical-polishing`
- `chromate-conversion`
- `clinching`
- `cnc-engraving`
- `cnc-grinding`
- `cnc-honing`
- `cold-forging`
- `cold-spray-additive`
- `compression-moulding-composite`
- `directed-energy-deposition`
- `edm-drilling`
- `electroless-plating`
- `electron-beam-melting`
- `electron-beam-welding`
- `extrusion-plastic`
- `fast-hole-edm`
- `friction-stir-welding`
- `gravity-die-casting`
- `hot-forging`
- `hvof-coating`
- `hydrostatic-extrusion`
- `incremental-sheet-forming`
- `induction-hardening`
- `insert-moulding`
- `laser-beam-welding`
- `lost-foam-casting`
- `material-extrusion-composite`
- `micro-injection-moulding`
- `nitriding`
- `over-moulding`
- `parylene-conformal-coating`
- `passivation`
- `plasma-spray-coating`
- `polyjet`
- `prepreg-autoclave`
- `pultrusion`
- `resin-transfer-moulding`
- `resistance-spot-welding`
- `self-piercing-riveting`
- `sheet-metal-deep-drawing`
- `sheet-metal-fine-blanking`
- `sheet-metal-hydroforming`
- `sheet-metal-progressive-die`
- `sheet-metal-roll-forming`
- `sheet-metal-spinning`
- `shell-moulding`
- `superplastic-forming`
- `swiss-cnc-turning`
- `thermoforming`
- `ultrasonic-welding-metal`
- `ultrasonic-welding-plastic`
- `upset-forging`
- `vacuum-bag-layup`
- `vat-photopolymerisation-dlp`

---

### Suggested actions

1. **High-severity flags** — manually review the quoted claim. If confirmed wrong, either edit `real_world_tolerances` / `article_markdown` / `common_applications` via `/ops/techniques`, or run `rejectTechnique`. A re-embed cron pass will refresh the vector overnight.
2. **Medium-severity flags** — same process, less urgent. Most are `best_mm` over-optimism — can be batch-corrected using the `suggested_correction` field from each flag. A separate script can apply these corrections systematically.
3. **Low-severity flags** — batch-edit on the next enrichment pass; no urgent action.