# Council deliberation — class-keyed design contamination

**2026-07-27 · five independent seats · analysis only, no code requested or produced**
Seats: `anthropic/claude-fable-5`, `openai/gpt-5.6-sol`, `google/gemini-3.1-pro-preview`, `x-ai/grok-4.5`, `deepseek/deepseek-v4-pro`. Each saw the same report and answered independently.

---

## The headline: they agree with the diagnosis and reject my recommendation

Unanimous on the disease. **Four of five reject the cure I proposed**, and the fifth (Grok) accepts it only as a secondary concern. More usefully, two seats identified an error in my *ordering* that my own evidence already supported and I had not seen.

---

## 1. Unanimous: `class` must never contribute structure

5/5. No dissent, and no seat thought this needed qualifying beyond one point from SOL:

> **SOL:** "Class may propose structure, but must never commit it. Restricting it to scalar defaults and vocabulary is unnecessarily absolute... The prohibition should instead be against **class-only justification**."

The mechanism they converge on is an **admission invariant**, not discipline:

> **SOL:** "every module, edge, and tool must trace to an accepted requirement, derived duty, interface, or hazard. 'Selected because class=X' is not valid provenance."

> **Fable:** "A hard gate fails the run if any element's provenance chain terminates in a class label... This also fixes your worst complaint — silent, confident inheritance — because reuse now names its donor at the element level, not the log level."

Fable and Gemini go further: make it **structurally unrepresentable** — the class-keyed store must not have fields capable of holding nodes, edges or tool specs. Gemini: *"Radically sever the data models."*

## 2. Unanimous: my hash input was wrong — it omits magnitude

I proposed `sha1(requirement keys + units + scale tier)`. Every seat rejected it, and two gave the same decisive counter-example:

> **SOL:** "Omitting values recreates exactly the scale failure you observed: 120 W and 200 kW requirements can have identical keys and units."

> **Fable:** "the 200 kW heat exchanger and the 16 A breaker on a 0.12 kW load are **magnitude** errors, not topology errors. Keys + units say 'this product has thermal management'; they don't distinguish 50 W Peltier from 200 kW industrial."

Fable's constructive fix: hash **per-requirement order-of-magnitude buckets** per physical domain, binned coarsely so paraphrase drift doesn't cause spurious misses.

Grok adds a warning nobody else raised and I had not considered:

> **Grok:** "if `derived_requirements` were themselves shaped by class or by a class-bootstrapped graph upstream, the hash **launders contamination**. Hash only artifacts produced *before* any class-structure injection; audit that pipeline order."

## 3. The finding that matters most: the caches were masking a broken generator

This is where the council earned its keep. My report treated the caches as the disease. Four seats independently said the caches were a **symptom**, and pointed at evidence that was already in my own data — **with `reused=false`, the run still scored 2/10.**

> **Fable:** "Perfecting the cache key merely converts 'confidently wrong inherited design' into 'wrong fresh design.'"

> **DeepSeek:** "The comments say this was 'hard-won' robustness, but the evidence says otherwise: the protected output was *never tested against a second product in the same class*. That's not robustness; **it's fossilized luck**."

> **Gemini:** "A truly universal engine cannot rely on a cache of previously seen designs to function."

> **SOL:** "A weak fallback is an engine defect. Masking it with an unrelated donor design is worse because it fails confidently."

## 4. Where they split

| Position | Seats |
|---|---|
| Remove cross-product structural reuse outright | SOL, Gemini, DeepSeek |
| Keep caches as pure memoization; remove `class` as a structure source | Grok |
| Keep them, but they are not the critical path — fix bootstrap first | Fable |

The split is narrower than it looks. All five agree the end state has **no cross-product structural inheritance**; they differ on whether a same-input memoization cache survives, which is a low-stakes question because everyone expects its hit rate to be near zero.

Nobody recommended reverting the three landed patches. SOL: *"reasonable containment... not the destination"*, and adds one thing I had missed — **the existing class-authored candidate rows are still in the database and are still untrustworthy**: "Quarantine or purge existing class-authored candidates; changing keys does not make those artifacts trustworthy."

## 5. What I now think, having read them

**I was right about the diagnosis and wrong about what to do next, in the ordering rather than the content.**

My §6 said: fix the cache key, demote class, log reuse. The council's correction is that this is all necessary but it is *second*. The first question is whether the engine can design a product it has never seen **from the brief alone** — because that is the actual claim, and every genuinely novel product goes down that path regardless of what the caches do.

Fable states the strategic consequence most clearly, and it decides the architecture:

> "if bootstrap from the brief is good, the structural caches are pure cost optimization and the keying debate becomes low-stakes; if bootstrap can't be made good, then reuse-with-adaptation is load-bearing architecture and needs real design, not a hash."

That is a fork we cannot reason our way past — it has to be measured.

**Revised recommendation, in order:**

1. **Measure the miss path.** Run the cell cycler with all three structural stores cold and cross-product reads disabled. Record the skeleton-critic scores. This is one run and it settles the fork above.
2. **Add the admission invariant** — every module/edge/tool must name the requirement that justified it; a chain terminating in a class label fails the run. This is the mechanism that makes contamination *impossible to reintroduce* rather than merely unlikely, and it is worth doing whichever way the fork lands.
3. **Quarantine the 14 existing class-authored candidate rows.** They were written by one product each and are untrustworthy under any keying scheme.
4. **Only then** revisit cache keying — and if step 1 shows bootstrap is sound, the correct answer may be to delete the structural caches rather than key them better.

**What would change my mind:** if step 1 shows the miss path produces ≤3/10 plausibility even with clean caches, then Fable's second branch is live — reuse-with-adaptation is real architecture, not an optimisation, and it needs designing properly (named donor, adapted against the brief, revalidated) rather than deleting.

**The strongest argument against this ordering**, which several seats raised against themselves: fixing a generator is an open-ended LLM-quality problem with no bounded fix, while keying plus provenance is bounded and stops silent corruption today. My answer is that step 2 stops the silent corruption independently of the generator work, so we get the bounded safety without betting on the unbounded fix first.

## 6. What everyone agreed to measure

Common across seats: cold-cache plausibility and brief-fidelity on novel briefs; **zero donor-specific modules** verified through element provenance rather than by eye; determinism on repeated identical briefs; cache hit rate under any new key (if ~0%, delete the cache); and a direct **order-of-magnitude check** between sized components and derived loads — a named test for the breaker-and-heat-exchanger failure class.

Fable's disproof condition is the sharpest: *"If miss-path plausibility stays ≤3–4, the keying direction was a distraction and the failure was never really about caches."*
