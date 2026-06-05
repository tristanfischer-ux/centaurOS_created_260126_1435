# Module-Level Advisor Engagement — Plan

_2026-06-05. Tristan's brief: make the report a due-diligence + advisor-engagement tool. Per module, tell the founder/investor the questions to ask, what a good answer looks like, and WHO is qualified to answer — then route them to those people (curated first, automated later)._

## 1 · Playback — what you're asking for

Evolve the report from **"what the design is"** to **"what to do about it."** For each module (and the document as a whole), three new things:

1. **The questions to ask** — split two ways:
   - **Design/engineering questions** — what to validate or clarify about the design itself.
   - **Manufacturing/procurement questions** — what to ask whoever is going to build or supply it.
2. **What a good answer looks like** — so the founder can judge whether the advisor they're speaking to actually knows their stuff (this is the bit that makes it useful to a non-expert).
3. **Who to ask** — the specific *kind* of person: discipline, seniority, and the background they'd need to answer well.

And the strategic intent: this becomes the on-ramp to Fractional Forge's value-add — the report tells you who you need, and Fractional Forge connects you to them (advisors **and** suppliers). Curated first, automated once there's volume.

You asked the key technical question yourself: most of the report is deterministic, but the questions + the "who" probably can't be — that's likely an LLM job. Agreed, with a refinement below.

## 2 · The one sharpening — from our 3 June red-team

Your instinct ("curated first, automated only once enough people are using it") is exactly the **demand-first sequencing law** we landed on 3 June: solve the hard side (founders generating reports) first, monetise the easy side (advisors/suppliers) last. So the vision is right.

The refinement is on **"who finds the people."** We concluded that the Fractional-Forge-as-marketplace shape (we match you to a third-party advisor and take a cut) is the trap — disintermediation, unenforceable take-rate, chicken-and-egg. The **viable kernel** is **Tristan-as-advisor (Forge-powered), lead-gen not take-rate.** So I'd route the "who to speak to" deliberately, not generically:

- **Cross-cutting design / feasibility / strategy questions** → **"Book a call"** — these are the questions *you* answer as the fractional advisor (the £1,500/day motion we already designed; the report is the free lead magnet that pulls toward it). This makes the feature monetise **immediately**, with no network required.
- **Niche specialist asks** (a specific crystalliser vendor, a metallurgist, a named discipline you wouldn't personally cover) → **curated specialist shortlist** — demand-first; you build this supply side only once report volume justifies it, exactly as you said.

So the "who to speak to" section isn't a generic directory — it's a **funnel into your advisory**, with a curated overflow for the specialist tail. Same feature you described; sharper money path; consistent with what we already decided rather than re-floating the marketplace.

## 3 · The architecture — deterministic spine, LLM voice

You're right that it's not fully deterministic — but it shouldn't be fully free-form either, or it loses the credibility the rest of the report fights for. **Hybrid:**

- **Deterministic grounding (the spine).** The engine *already computes*, per module, every open item the questions should target:
  - RFQ-flagged lines (quote-only / build-to-order) → procurement questions
  - Physics-critic findings tagged to the module → design-validation questions
  - Cost lines at ±30% / estimate-class 4–5 → "get a firm quote" questions
  - Engineering-contract closures that warn / low-confidence → "validate this" questions
  - Key design assumptions → "confirm this holds for your conditions" questions
  - Unverified brief constraints (the "—" compliance rows) → "verify in detailed design" questions
- **LLM voice (the part that generalises).** Feed those grounded items to a good LLM, which writes: the sharp question, the "what a good answer looks like," and the advisor persona (discipline + seniority + background). This is where the LLM earns its place — phrasing and persona inference **generalise to any module of any archetype** (the universal aim), which a hand-coded table never could.

Net: every question is **traceable to a real open item the engine found** (not invented), but reads like a sharp human advisor wrote it. Same credibility contract as the cost section — grounded, not hallucinated.

## 4 · What it looks like in the document

**Per module — a closing "Take this to your advisors" block.** After Module N's content and total:

> **Module 3 · Skid Structure & Containment — take this to your advisors**
>
> **Validate the design**
> - We've assumed secondary containment at 110% of the largest vessel volume. Confirm the bund sizing and whether a Dangerous Substances and Explosive Atmospheres (DSEAR) zone applies around the monoethanolamine storage. → _A strong answer cites the containment standard, asks about your site drainage and fire strategy, and gives a bund volume in cubic metres — not just "that's fine."_
> - **Who:** a chartered mechanical or structural engineer with chemical-plant skid-packaging experience and corrosive-duty containment. → _This is the kind of cross-cutting question Tristan covers directly — book a call._
>
> **Get firm prices**
> - The skid frame is a build-to-order fabrication, costed by material take-off at ±30% (~£X). Ask a fabricator: can you build to this specification, what's the lead time, and what's the firm price?
> - **Who:** a stainless-steel process-skid fabrication shop. → _Curated supplier shortlist._

**Once per document — "Your engagement plan."** A consolidated section near the end (alongside "Taking this forward", which already lists vendor quotes / validate-with-engineer / open decisions — this extends it): de-duplicates the per-module personas into a shortlist, splits **Book a call (Tristan)** from **Specialists to source**, and carries the call-to-action.

No-acronym rule applies to all founder-facing copy (spell out DSEAR, monoethanolamine, etc. on every mention).

## 5 · Phasing

- **Phase 1 — the report feature (build now).** Per-module blocks + the consolidated engagement plan, hybrid-generated. Mockup one module first for sign-off, then wire the generator stage (deterministic gather → LLM synth), universal across classes.
- **Phase 2 — the routing.** The consolidated section's call-to-action goes to your advisory (book-a-call) for cross-cutting asks; a curated specialist hand-off for the tail. Lead-gen, not take-rate.
- **Phase 3 — automation.** Only once report volume exists — turn the curated hand-off into matched introductions. Demand-first.

## 6 · Decisions to confirm
1. **Routing** — agree the "who" splits into *book-a-call-with-Tristan* (cross-cutting) vs *curated specialist* (niche), rather than a generic "Fractional Forge finds anyone"? (My recommendation: yes — it monetises now and matches 3 June.)
2. **Placement** — per-module blocks **and** a consolidated engagement plan? (Recommendation: both — per-module for context, consolidated for the outreach shortlist + call-to-action.)
3. **Grounding** — hybrid (engine open-items → LLM voice), accepting the LLM writes the questions/persona from grounded inputs? (Recommendation: yes.)

## 7 · First step
Mockup the **Module 3 · Skid Structure** block (real content from the current co2 run) as static HTML for sign-off — then build the generator stage behind it.
