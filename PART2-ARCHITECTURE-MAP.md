# Part 2 of the dossier — what it is today, and is it the right approach?

> Mapped 2026-06-11 at Tristan's request, BEFORE wiring the 8 drawings in — because
> there's no point slotting drawings into a Part 2 whose structure is wrong.

## 1. What Part 2 IS today (grounded in a real e-fuel dossier)

Part 2 is labelled **"How to build it"** and is organised as **functional modules →
sub-modules → a bill of materials**, plus a sourcing strategy and a cost roll-up:

| Page (in order) | What it conveys | Driven by |
|---|---|---|
| System Overview | how the whole system works / fits together | moduleDecomposition |
| Module Connection Map (+ exploded view) | the modules and how they interconnect | topology |
| **Per-module section** ×N | each functional module (e.g. "M1 Feedstock Receipt & Conditioning"): a brief, a narrative paragraph, derived parameters, and its **sub-modules** | modules[].sub_modules[] |
| (within each) sub-module | a function with an English sentence + a topology clause (what flows where) + its **words** | sub_modules[].words[] |
| (within each) **words = BoM lines** | every major part, fully specified: quantity, form, capacity, rating, **manufacturer, part number, list price, dimensions, regulatory** | words[].modifier_characters |
| Bill of Materials (per-module + master) | the consolidated parts list + cost | the same words |
| Suppliers + **Sourcing strategy** | who supplies each role, lead-time bands, dual-source, minimum-order-quantity, main-contractor + subcontractor scopes | sourcing-strategy.ts |
| Cost by module | cost split across the modules | BoM totals |

So today Part 2 = **a functional design decomposition + a real branded bill of
materials + a sourcing/procurement strategy + a cost roll-up.** It is validated to
the hilt (≈30 gates on part correctness: real MPNs, real prices, right sizing, right
type, jurisdiction, consistency).

## 2. Honest assessment — is modules/sub-modules/BoM the right approach?

**Confidence: moderate-high.** My answer: **the spine is right and should stay, but
it is not yet "how you manufacture it".**

**What it does well (keep it):** the modules→sub-modules→words structure IS a standard
**indented bill of materials** married to a functional decomposition. It answers
*"what is this made of, who makes each part, what does it cost, who do I buy it from"*
— a genuinely strong **design + procurement** dossier. The part-correctness gate
machinery is real value and is wedded to this structure. Don't throw it away.

**Where it falls short of "how you manufacture it":** it describes the product as a
**static parts tree**, not as a thing you **build through a sequence of operations at a
cost-of-goods**. Specifically MISSING:
1. **Make-vs-buy** — each BoM line classified bought-off-shelf / fabricated / custom-made.
   (The sourcing strategy hints at this via contractor scopes, but it isn't per-line.)
2. **Process route / bill of process** — for each MADE item, HOW it's manufactured
   (machined, fabricated, cast, PCB-assembled, wound…) and in what operation sequence.
3. **Assembly / integration sequence** — the BUILD ORDER: parts → sub-assemblies →
   modules → system. The dossier shows the static tree, not the order you put it together.
4. **Cost-of-goods build-up** — unit COGS = materials + **labour** + **process/overhead**.
   Today it's a parts-PRICE sum + a fabrication factor, not a manufacturing cost model.
5. **Design-for-manufacture** notes — manufacturability, tolerances, process limits.

**Archetype nuance:** for a PROCESS PLANT (e-fuel, CO₂) the module decomposition basically
IS the process flow (M1 feedstock → … → product), so it doubles as a process narrative.
For a DISCRETE PRODUCT (battery pack, drone, satellite) the functional modules are a
DESIGN view and the manufacturing view (sub-assemblies + assembly sequence + make/buy) is
genuinely a different cut the current structure does not provide. So the gap is widest
exactly where Fractional Forge's design-for-manufacture value is highest.

## 3. The fork (Tristan's call)

- **A — Evolve (recommended).** Keep modules/sub-modules/BoM as the spine; ADD a
  manufacturing layer on top: a make-vs-buy column on the BoM, a process-route note per
  made item, an assembly-sequence view, and a cost-of-goods build-up (materials + labour +
  process → unit COGS). Lowest risk, keeps the gate machinery, turns "what it's made of"
  into "how you make it + what it costs to make."
- **B — Re-organise around manufacturing.** Make the **assembly/build sequence** the spine
  of Part 2 (sub-assemblies in build order), with the BoM as a supporting artifact. More
  faithful to "how you manufacture it" for discrete products; bigger rebuild; some gate
  machinery would need re-pointing.
- **C — Leave Part 2 as the design+procurement dossier**, and add "how you manufacture it"
  as a NEW **Part 3** (manufacturing plan: make/buy + process + assembly + COGS), leaving
  the validated Part 2 untouched.

**My recommendation: A**, because the BoM spine is correct and proven, the missing pieces
are all *additive layers on the same data*, and it directly closes the cost-of-goods +
design-for-manufacture gap that is core to the offering — without risking the part-level
validation that already works.
