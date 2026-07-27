## Judgement

Your diagnosis is right: class-keyed structure is a silent correctness bug, not a tuning issue. The landed patches are better than nothing; I would not revert them. They are still the wrong end state. I would not invest further in “more scoping dimensions.”

### 1. Content-hash vs remove caches

**Content-hash keying is the correct cache design if structural caches remain.** Class (even `class//application`) is not a function of what determines a skeleton.

But reuse is secondary. The primary rule is: **structure is computed from the brief-derived duty/requirement set; caches only memoize that computation.** The “stale-but-coherent beats domain-blind planner” comment is a smell that the miss path is weak. Wrong coherent structure is worse than a noisy planner because it fails closed and late.

So: **do not remove caches as the goal**; remove **class as a structure source**. On miss, bootstrap from inputs. Re-introduce/keep a cache only keyed by a hash of those inputs for determinism and cost. If reuse collapses to near-zero, that is evidence products were never similar—not a reason to keep class keys. Then invest in the bootstrap/planner, not in inheritance.

### 2. Hash input set

**`derived_requirement` keys + units is necessary and insufficient.**  
A module skeleton is determined by **obligations and envelope**, not quantity names alone.

Include at least:

- sorted derived duties / capability obligations (not just keys—roles that force modules),
- units and magnitude/scale tier (desk vs plant),
- hard envelope constraints that change architecture (mains vs battery, budget band, mobility, environment).

**Risk:** if `derived_requirements` were themselves shaped by class or by a class-bootstrapped graph upstream, the hash launders contamination. Hash only artifacts produced *before* any class-structure injection; audit that pipeline order.

I am **not** confident keys+units alone is enough; treat duty-set + scale/envelope as the minimum determinant.

### 3. May `class` contribute structure?

**No.** Class may supply defaults, tolerances, vocabulary, and priors that lose to brief-derived structure. It must not be allowed to insert modules, edges, or tool plans.

**Minimal enforcement (principle, not patch list):** structural stores and bootstrap entry points must not accept class slug as a lookup key for nodes/edges/tools. Class feeds a **defaults merge after** skeleton existence is justified by duties. No discipline-based “don’t use class for modules”—make it unrepresentable.

The classifier issue (§7) is real but secondary: a wrong class with defaults-only hurts less than a wrong class that owns the skeleton. Do not grow a product-named taxonomy to paper over this.

---

### 4. One thing first

**Disable class-based structural hits (graph + tool plan + tool-creation proposals) and run the cycler plus 2–3 known products on pure brief→bootstrap only.**  

Why first: you do not yet know whether content-hash is worth building, because you have never measured bootstrap alone under this failure. Content-hash before a clean miss path optimizes a contaminated pipeline. Fix “what generates structure,” then memoize.

### 5. Strongest argument against me

If bootstrap/auto-planner is still domain-blind, forcing miss **degrades every design** (cost, variance, and quality) while you repair it—including first-in-class products that today look “fine” only because you are not comparing them to a better planner. Content-hash-first would preserve luck on near-duplicate runs and feel safer operationally.

### 6. What to measure

- **Donor bleed:** count modules/tools/edges on product B that are only justified by donor product A’s brief (target: 0 on cycler vs RPM).
- **Skeleton critic / brief fidelity** on cycler (target: recover to your ≥8 floor, not 2/10).
- **Reuse audit:** every hit logs key + donor product id; cycler must not name the RPM appliance as donor.
- **Sensitivity:** identical brief → cache hit + bit-identical skeleton; single duty/scale edit → miss + structurally different skeleton.
- **Regression:** prior golden products on forced-miss bootstrap stay within acceptance (if they collapse, bootstrap is the fire, not the cache).

**Falsification:** cycler still carries gravity-averaging / microfluidics / industrial refrigeration after class structure is gone, **or** golden products systematically fall below floor on pure bootstrap with no path to repair without reintroducing class-owned modules.

**Bottom line:** §6 direction is mostly right; your moderate confidence should be spent on the **hash input set and pipeline order**, not on whether class-alone is wrong. First kill class-as-structure and measure bootstrap; then content-hash for determinism—not the reverse.