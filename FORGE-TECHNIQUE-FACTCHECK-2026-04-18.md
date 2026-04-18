# Forge Technique Fact-Check — 2026-04-18

**Rows reviewed:** 80
**Ok (no concerns):** 1
**Concerns:** 79
**Errored (LLM call failed):** 0

Review model: deepseek-chat, temperature 0.1, skeptical-reviewer prompt.
Original seed model: deepseek-chat, temperature 0.3 (see scripts/seed-manufacturing-techniques.ts).
Cross-model fact-check would require swapping the review LLM — left as follow-up.

## High-severity flags

### `incremental-sheet-forming`
_Entry contains an overly optimistic tolerance claim and an inappropriate application suggestion._

- **[application]** ISF is generally not suitable for direct production of medical implants due to surface finish limitations, potential for micro-cracks, and stringent regulatory requirements for material integrity and surface quality. It might be used for prototypes or non-implantable components, but listing it as a common application is misleading.
  > medical implants and prosthetics

## Medium-severity flags

### `5-axis-cnc-milling`
_Entry is mostly accurate but contains an overly optimistic best-case tolerance claim and a slightly misleading simplification about tolerance advantages._

- **[tolerance]** Claiming a best-case tolerance of ±0.02 mm (±0.0008") for 5-axis milling is overly optimistic for general application. While possible on very high-end machines under ideal conditions (small part, rigid setup, optimal feature orientation), a more realistic and commonly cited best-case for precision 5-axis work is ±0.05 mm (±0.002"). The stated value is more typical of high-precision 3-axis or jig grinding.
  > "best_mm": 0.02

### `adhesive-bonding-structural`
_Entry is largely accurate but contains an overly optimistic tolerance claim for bond line control._

- **[tolerance]** Claiming a best-case tolerance of ±0.05 mm for bond line thickness in structural adhesive bonding is overly optimistic. Realistically, for high-precision applications, the best achievable is typically around ±0.1 mm, with 0.05 mm being exceptionally rare and not representative of a general 'best' tolerance.
  > best_mm: 0.05

### `aging-precipitation-hardening`
_Entry is mostly accurate but contains a misleading application example and a minor material mischaracterization._

- **[application]** While high-strength aluminum alloys are used in bicycle frames, precipitation hardening is a specific heat treatment applied to the material, not a typical process for finished composite baseball bats (which are often wood, aluminum, or composite, not precipitation-hardened alloys). This inclusion is misleading as a common application.
  > sporting equipment (bicycle frames, baseball bats)

### `anodising`
_Entry contains an unrealistic best-case tolerance claim and oversimplifies material/process compatibility._

- **[tolerance]** Anodising growth is typically 50% of the oxide thickness into the part and 50% outward. A 'best' tolerance of ±0.01 mm (10 microns) is unrealistic for controlling total dimensional growth; it implies controlling oxide thickness to ~20 microns with extreme precision, which is not standard practice. Typical growth control is in the range of ±0.025 mm or more.
  > best_mm: 0.01

### `binder-jetting-metal`
_Entry contains overly optimistic tolerance claims and includes some materials/applications not representative of typical production use._

- **[tolerance]** Binder jetting metal typically achieves best-case tolerances around ±0.2-0.3 mm (±0.008-0.012 in) after sintering shrinkage compensation. ±0.1 mm (±0.004 in) is overly optimistic for this process and approaches capabilities of higher-precision metal AM methods like metal FDM or DMLS.
  > best_mm: 0.1

### `binder-jetting-sand`
_Entry is mostly accurate but contains an overly optimistic tolerance claim and a slightly overstated application example._

- **[tolerance]** Claiming a best-case tolerance of ±0.3 mm for a binder-jetted sand mold followed by metal casting is overly optimistic. The additive tolerance stack from printing resolution, sand grain movement, and casting shrinkage typically results in a best-case tolerance no better than ±0.5 mm for most applications, with ±0.75–1.0 mm being more common for larger parts.
  > best_mm: 0.3

### `blow-moulding`
_Entry contains an overly optimistic tolerance claim and includes a misleadingly common material listing._

- **[tolerance]** Claiming a best tolerance of ±0.25 mm for blow moulding is overly optimistic and unrealistic for typical production. Realistic best tolerances for high-precision blow moulding (e.g., on small, controlled parts) are typically in the range of ±0.5 mm to ±1.0 mm. A ±0.25 mm claim is more characteristic of injection moulding.
  > best_mm: 0.25

### `braiding-composite`
_Generally accurate but contains an overly optimistic tolerance claim._

- **[tolerance]** ±0.2 mm is unrealistically tight for as-braided composite parts before machining. Typical best-case dimensional tolerances for braided composites are ±0.5 mm or more due to fiber movement during resin infusion and cure shrinkage.
  > best_mm: 0.2

### `brazing`
_Entry is mostly accurate but contains a misleading tolerance claim and an oversimplified material inclusion._

- **[tolerance]** Claiming a 'best' tolerance of 0.1 mm for brazing is misleading. While joint gaps are designed in that range, the overall dimensional tolerance of a brazed assembly is typically much coarser (±0.25 mm or more) due to fixture limitations, thermal distortion, and filler metal flow. The 'best' value should reflect achievable assembly tolerance, not joint gap design.
  > best_mm: 0.1

### `carburising`
_Entry contains a misleading claim about dimensional stability and an optimistic tolerance claim._

- **[tolerance]** This is misleading. Carburising and quenching often cause significant dimensional changes and distortion due to phase transformation and thermal stresses, which is why the tolerance notes correctly identify distortion as a primary concern. The statement contradicts the real-world expectation of post-heat-treatment grinding.
  > The process does not significantly alter the part's overall dimensions or surface finish from its pre-carburised state; final machining and grinding are usually performed beforehand.

### `case-hardening`
_Entry contains a misleading claim about dimensional stability and incorrectly lists a nitriding-specific process as standard case-hardening equipment._

- **[application]** This is misleading. Case hardening (especially carburizing and quenching) often causes significant and unpredictable dimensional changes and warpage, which is why the 'real_world_tolerances' section correctly notes the need for post-hardening grinding.
  > The process does not significantly alter the part's dimensions

### `centrifugal-casting`
_Entry contains an overly optimistic tolerance claim and a misleading application example._

- **[tolerance]** Claiming a best-case tolerance of ±0.5 mm for as-cast centrifugal casting is overly optimistic for typical production. Realistic best-case dimensional tolerances for the controlled outer diameter are typically in the range of ±1.0 to ±1.5 mm for standard sizes, with inner diameters being significantly less accurate.
  > best_mm: 0.5

### `ceramic-mould-casting`
_Entry contains an overly optimistic tolerance accumulation claim and an incorrect equipment item._

- **[tolerance]** This tolerance accumulation claim (±0.003 mm/mm) is unrealistically tight for ceramic mould casting; typical additional tolerance is more like ±0.005 to ±0.01 mm per mm.
  > additional tolerance is approximately ±0.003 mm per mm thereafter.

### `chemical-polishing`
_Entry is mostly accurate but contains an overly optimistic surface finish claim and an under-qualified material listing._

- **[tolerance]** The Ra range is overly optimistic for a typical chemical polishing process. While possible in ideal, controlled cases for specific materials, a more common and realistic range for a bright finish from chemical polishing is Ra 0.4–1.6 µm (16–63 µin). The cited lower bound of 0.1 µm (4 µin) is exceptionally fine and more typical of mechanical or electropolishing processes.
  > It produces a bright, reflective surface finish, typically in the range of Ra 0.1–0.8 µm.

### `chromate-conversion`
_Entry contains minor inaccuracies regarding substrate materials, etching dimensional change, and equipment._

- **[material]** Cadmium is a metal plating, not a substrate material for chromate conversion. Chromate conversion is applied over cadmium plating, but 'cadmium plate' is misleadingly listed as a base material.
  > cadmium plate

### `clinching`
_Entry is mostly accurate but contains an overly optimistic tolerance claim and a vague, potentially misleading material restriction._

- **[tolerance]** Claiming a best-case positional tolerance of ±0.1 mm for clinching is overly optimistic. Realistic best-case tolerances for joint position in high-precision, fixture-controlled setups are typically in the range of ±0.2 to ±0.3 mm.
  > best_mm: 0.1

### `cnc-engraving`
_The entry is largely accurate but contains an overly optimistic best-case tolerance claim._

- **[tolerance]** Achieving a ±0.025 mm tolerance in CNC engraving is extremely optimistic and unrealistic for typical production. This is more characteristic of high-precision milling of features, not engraving. A realistic 'best' tolerance for engraving is more likely in the range of ±0.05 to ±0.1 mm.
  > best_mm: 0.025

### `cnc-grinding`
_Generally accurate, but the stated best-case tolerance is overly optimistic for a general reference._

- **[tolerance]** While achievable in specialized cylindrical grinding, presenting 0.001 mm (1 micron) as a 'best' tolerance for CNC grinding in a general reference is misleading. It is an exceptional, not typical, capability for the process and is highly dependent on part size, machine, and material.
  > best_mm: 0.001

### `cnc-honing`
_Entry contains an overly optimistic tolerance claim and a vague material classification._

- **[tolerance]** Claiming a best-case diameter tolerance of ±0.0025 mm (2.5 µm) for CNC honing is unrealistic. Honing is a finishing process, but such a tight unilateral tolerance is more typical of grinding or lapping. Realistic best-case diameter tolerances for honing are typically in the range of ±0.005 mm to ±0.01 mm.
  > best_mm: 0.0025

### `cnc-routing`
_Entry contains a major equipment misclassification and an optimistic tolerance claim._

- **[equipment]** Plasma cutting is a distinct thermal cutting process, not a type of CNC router. Including it in the equipment list for CNC routing is factually incorrect and misleading.
  > Plasma Cutter (for metal sheets)

### `cold-forging`
_The entry is generally accurate but contains an unrealistically tight claimed tolerance for the process._

- **[tolerance]** Claiming a best-case tolerance of ±0.05 mm for cold forging is overly optimistic. Realistic best-case diametral tolerances for cold forging are typically in the range of ±0.1 mm to ±0.2 mm, even for simple geometries. A value of ±0.05 mm is more typical of precision machining or grinding.
  > best_mm: 0.05

### `compression-moulding-composite`
_Entry is generally accurate but contains overly optimistic tolerance and surface finish claims._

- **[tolerance]** A best-case tolerance of ±0.2 mm is extremely tight for compression moulded composites. Realistic best-case tolerances for high-precision SMC parts are typically in the range of ±0.3 to ±0.5 mm due to material shrinkage and flow variations.
  > "best_mm": 0.2

### `directed-energy-deposition`
_The entry is largely accurate but contains an overly optimistic tolerance claim for the DED process._

- **[tolerance]** Claiming a best-case tolerance of ±0.25 mm for as-deposited DED is overly optimistic. Realistic best-case tolerances for high-end DED systems are typically in the range of ±0.5 mm to ±1 mm before post-machining.
  > best_mm: 0.25

### `edm-drilling`
_Entry contains an overly optimistic typical tolerance claim and an overly broad material exclusion statement._

- **[tolerance]** This tolerance claim is overly optimistic for typical production. While achievable under ideal conditions, ±0.025 mm (±0.001") is at the very best end for small-hole EDM; a more realistic typical range is ±0.05 mm (±0.002") or wider, especially for deep holes.
  > with tolerances on hole diameter typically within ±0.025 mm.

### `electroless-plating`
_Entry is mostly accurate but contains an overly optimistic tolerance claim and an overgeneralization about plating polypropylene._

- **[tolerance]** Claiming a best-case coating thickness uniformity of ±0.002 mm (2 microns) is overly optimistic for electroless plating. Realistic best-case uniformity for a well-controlled process is typically in the range of ±0.005 mm (5 microns) or more, especially across complex parts.
  > best_mm: 0.002

### `electron-beam-melting`
_Entry is mostly accurate but contains an overly optimistic tolerance claim and a rarely used material listing._

- **[tolerance]** Achieving ±0.1 mm as a 'best' tolerance for EBM is overly optimistic. Realistically, EBM typically holds ±0.2 mm or more for best-case features due to thermal distortion and powder particle size effects.
  > best_mm: 0.1

### `electron-beam-welding`
_Entry is mostly accurate but contains an overly optimistic tolerance claim and an uncommon application listed as common._

- **[tolerance]** While EBW requires good fit-up, claiming a typical gap tolerance of <0.1 mm is overly restrictive and optimistic for many production applications; a more realistic typical range is 0.1-0.25 mm, with tighter fits needed for specific geometries or materials.
  > Gap tolerance is typically less than 0.1 mm for optimal results.

### `extrusion-plastic`
_The entry is largely accurate, but the stated best-case tolerance is overly optimistic for the process._

- **[tolerance]** Claiming a best-case tolerance of ±0.1 mm for plastic extrusion is unrealistic for most profiles. For critical dimensions on small-to-medium profiles, a more realistic best-case is typically ±0.2 mm to ±0.5 mm, heavily dependent on material, cooling, and calibration.
  > best_mm: 0.1

### `fast-hole-edm`
_Entry is mostly accurate but contains an overly optimistic tolerance claim and a questionable application example._

- **[tolerance]** For fast-hole EDM, a best-case tolerance of ±0.01 mm (10 µm) is overly optimistic for typical production. Realistic best-case positional or diameter tolerance is more commonly in the range of ±0.02 to ±0.03 mm, especially when considering electrode wear and thermal effects.
  > best_mm: 0.01

### `friction-stir-welding`
_Entry is mostly accurate but contains an overly optimistic tolerance claim and overstates the commonality of steel FSW._

- **[tolerance]** Claiming a best-case tolerance of ±0.1 mm for FSW is unrealistic for the process as a whole. While joint alignment or tool positioning might be controlled to that level on a high-end machine, the primary dimensional outputs (like post-weld distortion or joint line straightness) are typically worse. A more realistic 'best' for a critical output like angular distortion on a well-fixtured part would be on the order of 0.5 mm or more.
  > best_mm: 0.1

### `gas-assisted-injection`
_Entry contains misleading tolerance generalization and includes atypical materials and applications._

- **[tolerance]** This is misleading. While gas pressure variations exist, GAIM often provides better dimensional stability and reduced warpage compared to standard injection molding for thick parts, potentially allowing tighter tolerances in some dimensions, not universally wider ones.
  > Tolerances are generally wider than standard injection molding due to gas pressure variations and material displacement.

### `gravity-die-casting`
_Entry is mostly accurate but contains a misleading tolerance claim and an overly broad material inclusion._

- **[tolerance]** While percentage-based tolerances are sometimes referenced, the provided absolute tolerance values (best 0.25mm, typical 0.5mm) are more standard and realistic for engineering specifications. The ±0.3% claim is overly simplistic and can be misleading for small dimensions (e.g., ±0.03mm on a 10mm part is unrealistically tight for gravity die casting).
  > The achievable tolerance band is generally around ±0.3% of the nominal dimension

### `hand-layup`
_The entry is generally accurate but contains an unrealistically optimistic tolerance claim for the hand layup process._

- **[tolerance]** Claiming a best-case tolerance of ±0.5 mm for hand layup is overly optimistic and unrealistic for this manual, open-mold process. Realistically, even with a high-quality mold and skilled operator, achieving repeatable tolerances better than ±1-2 mm is very difficult due to manual fabric placement, resin application, and consolidation.
  > "best_mm": 0.5

### `hard-anodising`
_Entry contains misleading tolerance representation and minor technical inaccuracies regarding material behavior and process steps._

- **[tolerance]** These values (0.05-0.5 mm) represent dimensional growth from coating, not achievable tolerances on machined features. The 'best' value of ±0.05 mm (0.1 mm total) is unrealistic for hard anodizing growth control; typical growth is less predictable. This misrepresents the tolerance capability.
  > best_mm: 0.05, worst_mm: 0.5, typical_mm: 0.1

### `hvof-coating`
_The entry is largely accurate but contains an overly optimistic tolerance claim for the as-sprayed coating process._

- **[tolerance]** A ±0.05 mm thickness tolerance for an as-sprayed HVOF coating is unrealistically tight. The process inherently builds up material in layers, and typical as-sprayed thickness control is in the range of ±0.1 mm to ±0.25 mm. The stated 'best' value is more representative of a tolerance achievable only after post-spray machining.
  > "best_mm": 0.05

### `hydrostatic-extrusion`
_Entry is mostly accurate but contains an overly optimistic tolerance claim and a slightly misleading application example._

- **[tolerance]** Claiming a best tolerance of ±0.05 mm for hydrostatic extrusion is overly optimistic. This process is for difficult materials and complex shapes; typical dimensional tolerances are more realistically in the range of ±0.1% to ±0.5% of diameter, which for a 150 mm part would be ±0.15 mm to ±0.75 mm. A ±0.05 mm absolute tolerance is more characteristic of precision cold drawing or machining.
  > best_mm: 0.05

### `impact-extrusion`
_Entry contains an overly optimistic tolerance claim and one misattributed common application._

- **[tolerance]** Claiming a best-case tolerance of ±0.05 mm for impact extrusion is overly optimistic. Realistic best-case tolerances for wall thickness in cold impact extrusion are typically in the range of ±0.1 mm to ±0.2 mm, even for well-controlled processes.
  > best_mm: 0.05

### `incremental-sheet-forming`
_Entry contains an overly optimistic tolerance claim and an inappropriate application suggestion._

- **[tolerance]** Claiming a best tolerance of ±0.2 mm for ISF is overly optimistic. Realistically, even with excellent support and compensation, typical best-case dimensional accuracy is in the range of ±0.5 mm to ±1 mm due to inherent springback and elastic recovery.
  > best_mm: 0.2

### `induction-hardening`
_The entry is largely accurate but contains an overly optimistic best-case tolerance claim._

- **[tolerance]** Claiming a best-case dimensional tolerance of ±0.05 mm for induction hardening is unrealistic. The process inherently causes thermal distortion; achieving such tight tolerances directly from hardening is not typical. Final precision is achieved through post-hardening grinding, not the hardening process itself.
  > best_mm: 0.05

### `insert-moulding`
_Contains one unrealistic tolerance claim and one misleading material presentation._

- **[tolerance]** ±0.05mm (±0.002") is unrealistically tight for insert moulding considering plastic shrinkage variation around inserts and insert placement accuracy. Realistic best-case is typically ±0.1mm (±0.004") for critical dimensions.
  > best_mm: 0.05

### `laser-beam-welding`
_Entry is mostly accurate but contains an overly optimistic tolerance claim and an oversimplification regarding dissimilar metal welding._

- **[tolerance]** Claiming a best-case joint fit-up/gap tolerance of ±0.05 mm (50 µm) for laser beam welding is overly optimistic for general production. While possible in highly controlled lab or micro-welding setups, a more realistic best-case for precision industrial applications is typically ±0.1 mm.
  > best_mm: 0.05

### `lost-foam-casting`
_Entry contains an overly optimistic tolerance claim and an uncommon material listing._

- **[tolerance]** Lost-foam casting typically achieves tolerances around ±0.5% to ±1% of dimension; ±0.3% is overly optimistic and not representative of standard industrial capability.
  > Dimensional tolerance is typically ±0.3% of the nominal dimension.

### `material-extrusion-composite`
_Entry contains an overly optimistic tolerance claim and includes a non-standard material combination._

- **[tolerance]** For continuous fiber composite extrusion, achieving ±0.15mm as a 'best' tolerance is overly optimistic. The process involves co-extrusion of stiff fibers and thermoplastic, leading to significant challenges with dimensional accuracy due to fiber alignment, thermal effects, and nozzle pressure variations. Realistic best-case tolerances are typically ±0.3-0.5mm.
  > best_mm: 0.15

### `micro-injection-moulding`
_The entry is generally accurate but contains an overly optimistic best-case tolerance claim._

- **[tolerance]** A best-case tolerance of ±0.005 mm (5 µm) for micro-injection moulding is extremely optimistic and not typical for production. Realistic best-case tolerances for high-precision micro-moulding are typically in the range of ±0.01 mm to ±0.02 mm, depending heavily on feature size, material, and geometry.
  > best_mm: 0.005

### `nitriding`
_Entry is mostly accurate but contains an overly optimistic general tolerance claim and an incomplete material condition requirement._

- **[tolerance]** This tolerance claim is overly optimistic for a general statement. While achievable on simple, well-prepared parts, the typical range is more realistically ±0.1 mm to ±0.25 mm (±0.004" to ±0.010") due to inherent distortion from thermal stresses and part geometry.
  > The typical tolerance band for post-nitriding dimensions is ±0.05 mm to ±0.1 mm

### `over-moulding`
_Entry is generally accurate but contains an overly optimistic tolerance claim and a minor equipment categorization error._

- **[tolerance]** A best-case tolerance of ±0.05 mm for an over-moulded feature relative to a substrate is unrealistically tight for a typical production environment. This is more characteristic of precision machining. A more realistic best-case for a well-controlled process would be in the range of ±0.1 mm to ±0.15 mm.
  > best_mm: 0.05

### `parylene-conformal-coating`
_Entry contains a misleading tolerance claim and incorrectly describes the deposition as line-of-sight._

- **[tolerance]** While ±10% is achievable, it is not 'typical' across all applications and thicknesses; it is a best-case or controlled specification. Real-world batch variation, part geometry, and equipment can lead to wider tolerances, especially at the extremes of the thickness range.
  > Tolerance on coating thickness is very tight, typically within ±10% of target.

### `plasma-spray-coating`
_Entry is mostly accurate but contains an overly optimistic tolerance claim and includes a less common material without proper qualification._

- **[tolerance]** Claiming ±0.05mm (0.1mm total tolerance band) as 'best' for plasma spray coating thickness control is overly optimistic. Realistic best-case thickness control for plasma spray is typically ±0.075mm to ±0.125mm (0.15-0.25mm total band). The 0.05mm claim approaches precision of much more controlled processes like PVD/CVD.
  > best_mm: 0.05

### `polyjet`
_Entry contains a misleading claim about support-free overhangs and misrepresents material simulations as distinct materials._

- **[application]** PolyJet typically requires support material for overhangs; it does not print overhangs without supports.
  > complex overhangs without supports

### `prepreg-autoclave`
_The entry is largely accurate but incorrectly lists a heated platen press as standard equipment for the prepreg-autoclave process._

- **[equipment]** A heated platen press is a separate, non-autoclave composite curing method (e.g., for compression molding). Listing it as standard equipment for the prepreg-autoclave process is incorrect and misleading.
  > heated platen press

### `resin-transfer-moulding`
_Entry contains an overly optimistic tolerance claim and incorrectly lists VARTM as standard RTM equipment._

- **[tolerance]** Claiming a best tolerance of ±0.2 mm for RTM is overly optimistic. Realistically, for high-precision molds and controlled processes, the best achievable tolerance is typically in the range of ±0.3 to ±0.5 mm due to inherent factors like fiber movement, resin shrinkage, and thermal effects.
  > best_mm: 0.2

### `resistance-spot-welding`
_Entry contains an unrealistic tolerance claim and a slightly misleading material limitation statement._

- **[tolerance]** Claiming a best-case positional tolerance of ±0.2 mm for resistance spot welding is unrealistic. The process is heavily influenced by sheet fit-up, fixture play, and electrode wear; typical best-case repeatability for nugget position in a production setting is more on the order of ±0.5 mm to ±1 mm.
  > best_mm: 0.2

### `riveting`
_Entry is mostly accurate but contains an overly optimistic tolerance claim and an unqualified material listing._

- **[tolerance]** ±0.05 mm is an unrealistic best-case tolerance for typical riveting in production; precision riveting in aerospace might achieve ±0.1 mm, but ±0.05 mm is more characteristic of machining, not a mechanical fastening process.
  > best_mm: 0.05

### `rotational-moulding`
_Entry is mostly accurate but contains misleading tolerance presentation and an atypical material listing._

- **[tolerance]** Tolerance values are given as absolute numbers (mm) without reference to part size, which is misleading. Rotomolding tolerances are typically expressed as a percentage of dimension or ±X mm per Y mm. A 'best' of 2 mm is unrealistic for a large part (e.g., a 5m tank), while it is very loose for a small part. The entry should specify that tolerances scale with part size.
  > best_mm: 2, worst_mm: 10, typical_mm: 5

### `self-piercing-riveting`
_Entry contains optimistic tolerance claims and some material/application overstatements._

- **[tolerance]** ±0.2mm is unrealistically tight for self-piercing riveting placement accuracy in production. Typical in-line accuracy is ±0.5mm as noted, with best-case realistically around ±0.3-0.4mm with exceptional fixturing.
  > best_mm: 0.2

### `sheet-metal-deep-drawing`
_The entry is largely accurate but contains an overly optimistic best-case tolerance claim._

- **[tolerance]** A best-case tolerance of ±0.1 mm for deep drawing is unrealistically tight for most production scenarios. Typical best-case tolerances for diameter on medium-sized parts are in the range of ±0.2 to ±0.3 mm, with ±0.1 mm being exceptionally precise and not representative of a general 'best' capability.
  > best_mm: 0.1

### `sheet-metal-fine-blanking`
_Entry contains an overly optimistic tolerance claim and a slightly misleading material generalization._

- **[tolerance]** A best-case tolerance of ±0.02 mm (20 microns) for fine-blanking is overly optimistic for general part dimensions. While possible for specific features like hole diameters under ideal conditions, it is not a representative 'best' tolerance for the process. A more realistic best-case is typically in the range of ±0.05 mm to ±0.1 mm.
  > best_mm: 0.02

### `sheet-metal-hydroforming`
_Entry contains a misleading tolerance comparison and an incorrect application example._

- **[tolerance]** Hydroforming can achieve good tolerances, but claiming they are 'generally tighter' than conventional deep drawing is misleading. Deep drawing with well-engineered tooling can achieve very tight tolerances (±0.1mm or better for certain applications), often comparable to or exceeding typical hydroforming capabilities, especially for simpler geometries. The uniform pressure in hydroforming helps with formability and surface finish, but does not inherently guarantee superior dimensional accuracy across all part features compared to a high-precision mechanical stamping process.
  > Tolerances are generally tighter than conventional deep drawing due to the uniform fluid pressure.

### `sheet-metal-progressive-die`
_The entry is largely accurate, but the stated best-case tolerance is unrealistically tight for general application._

- **[tolerance]** While achievable for features within a single station, a blanket 'best' tolerance of ±0.05 mm (0.002") for progressive die stamping is overly optimistic for general design guidance. Realistically, ±0.1 mm is a more common best-case claim for high-precision progressive dies.
  > best_mm: 0.05

### `sheet-metal-roll-forming`
_The entry contains overly optimistic tolerance claims that could mislead designers about achievable precision._

- **[tolerance]** ±0.13mm tolerance for roll forming cross-sectional dimensions is unrealistically tight. Realistic best-case tolerances for roll forming are typically ±0.25mm to ±0.5mm depending on material and profile complexity.
  > best_mm: 0.13

### `sheet-metal-spinning`
_Entry is mostly accurate but contains an overly optimistic best-case tolerance claim and an oversimplified statement about material thinning._

- **[tolerance]** A best-case tolerance of ±0.1 mm (0.004") for sheet metal spinning is unrealistically tight for the process, especially for diameters. Typical best-case tolerances for CNC spinning are in the range of ±0.25 mm to ±0.5 mm (±0.010" to ±0.020").
  > best_mm: 0.1

### `shell-moulding`
_Entry contains an unrealistic tolerance claim and a questionable material inclusion._

- **[tolerance]** This is an overly optimistic and unrealistic blanket tolerance claim for shell moulding. Realistic tolerances are typically expressed as linear values (e.g., ±0.5 mm per 100 mm), not a percentage, which would imply impossibly tight tolerances on large parts.
  > Dimensional tolerances are tighter, generally within ±0.5% of the nominal dimension.

### `sinker-edm`
_Entry is mostly accurate but contains an optimistic tolerance claim and a misleading material inclusion._

- **[tolerance]** The claim of ±0.005 mm (5 µm) as a 'best' achievable tolerance for sinker EDM is overly optimistic for typical production. While possible in lab or high-precision setups, a more realistic best-case for production is often cited as ±0.01 mm (10 µm). The stated 'standard' of ±0.025 mm is reasonable.
  > Holding ±0.025 mm is standard for production. Achieving ±0.005 mm requires meticulous setup and multiple electrodes.

### `soldering`
_Minor material misclassification and an overly pessimistic tolerance claim._

- **[tolerance]** Claiming a best tolerance of 0.1 mm for soldering is unrealistic for typical component placement; high-precision SMT placement can achieve 0.05 mm or better, so this is misleadingly coarse.
  > "best_mm": 0.1

### `superplastic-forming`
_Entry contains minor material inaccuracy and an overly optimistic tolerance claim._

- **[tolerance]** A best-case tolerance of ±0.25 mm for superplastic forming is overly optimistic; typical achievable tolerances are in the range of ±0.5 mm to ±1.0 mm, with ±0.25 mm being exceptionally tight and not representative of standard SPF capabilities.
  > best_mm: 0.25

### `swiss-cnc-turning`
_Entry contains overly optimistic tolerance claims and a minor material qualification issue._

- **[tolerance]** While Swiss turning is precise, claiming ±0.0125 mm (or ±0.0005") as 'often held' is overly optimistic for typical high-volume production. This is a very tight tolerance more characteristic of a best-case, controlled scenario, not a common or 'often' achievable value.
  > Diameterical tolerances on critical features are often held to ±0.0125 mm.

### `thermoforming`
_The entry is largely accurate, but the stated best-case tolerance is unrealistically tight for the thermoforming process._

- **[tolerance]** Claiming a best-case tolerance of ±0.25 mm for thermoforming is overly optimistic for most production scenarios. Realistic best-case tolerances for well-controlled pressure forming of smaller parts are typically in the range of ±0.5 mm to ±1.0 mm.
  > best_mm: 0.25

### `ultrasonic-welding-metal`
_Entry is mostly accurate but contains an overly optimistic tolerance claim and oversimplifies the weldability of mild steel._

- **[tolerance]** Claiming a best-case tolerance of ±0.05 mm for part positioning in ultrasonic metal welding is overly optimistic. Realistic best-case positioning tolerances for high-precision fixtures in this process are typically in the range of ±0.1 mm to ±0.2 mm.
  > "best_mm": 0.05

### `ultrasonic-welding-plastic`
_Entry contains an overly optimistic tolerance claim and an unqualified material recommendation._

- **[tolerance]** Claiming a best-case tolerance of ±0.1 mm for ultrasonic welding is overly optimistic. The process is highly dependent on part consistency and fixture precision, and typical achievable tolerances are generally in the range of ±0.25 mm or larger. A ±0.1 mm claim is unrealistic for standard production.
  > best_mm: 0.1

### `upset-forging`
_Entry is mostly accurate but contains an overly optimistic tolerance claim and a minor misapplication._

- **[tolerance]** Claiming a best tolerance of ±0.5 mm for upset forging is overly optimistic, especially for hot forging. Realistic best tolerances for hot upset forging are typically ±1 mm or worse, and even cold forging may struggle to consistently achieve ±0.5 mm on all dimensions without secondary operations.
  > best_mm: 0.5

### `vat-photopolymerisation-dlp`
_The entry is largely accurate but contains an overly optimistic tolerance claim._

- **[tolerance]** Claiming a best-case tolerance of ±0.025 mm (25 microns) for DLP is overly optimistic and not typical for real-world production. While high-end industrial DLP systems can achieve such resolution in ideal conditions, the stated 'best' tolerance should reflect a more realistic, achievable value for general use, typically around ±0.05 mm to ±0.1 mm.
  > best_mm: 0.025

## Low-severity flags (summary)

- `automated-fibre-placement` — 1 minor: application
- `cold-spray-additive` — 2 minor: tolerance, material
- `continuous-casting` — 1 minor: application
- `filament-winding` — 1 minor: application
- `hot-forging` — 1 minor: tolerance
- `passivation` — 1 minor: tolerance
- `pultrusion` — 2 minor: tolerance, material
- `solution-heat-treatment` — 2 minor: material, application

## OK rows

- `vacuum-bag-layup`

---

### Suggested actions

1. **High-severity flags** — manually review the quoted claim. If confirmed wrong, either edit the row (article_markdown / tolerances / etc.) or run `rejectTechnique` via `/ops/techniques`. A re-embed cron pass will refresh the vector next night.
2. **Medium-severity flags** — same process, less urgent. Consider editing before a public demo.
3. **Low-severity flags** — batch-edit on the next enrichment pass; no urgent action.