# Source + Assemble Reimagining — Autonomous Tracker

**Started:** 2026-04-17 evening (Tristan asleep)
**Goal:** Turn Source and Assemble from "supplier picker + packaging form" into **a hardware-launch cockpit** — the pages a founder uses to manage 13k supplier relationships, reduce supply risk, and ship a first pilot run with confidence.
**Mode:** Fully autonomous. Design + red team + implement + verify + commit.

---

## Problem Statement

A first-time hardware founder lands on Source. They have:
- A specified product with N modules
- A database of ~13,000 suppliers (marketplace_listings)
- No idea who to trust, no experience sending RFQs, no template for what to ask

Today's pages answer: **"who should I ask to quote?"**
They don't answer the harder questions:
- Have I got redundancy on critical parts?
- Am I over-exposed to one country?
- Is this supplier actually able to scale with me from 10 → 10,000 units?
- What do I need to send them before I can share my design?
- What do I need back from them to know they're legit?
- When will I know I'm ready to ship a pilot?

This session builds the pieces that answer those questions.

---

## Scope (ship targets)

### Source page
1. **Supplier Relationship Hub** — per-supplier conversation thread, response tracking, outreach status
2. **Supply Risk Radar** — dual-sourcing alerts + geographic concentration + trade-lane risk
3. **Volume Ramp Planner** — tag each shortlisted supplier proto / pilot / production
4. **Capability Interview Pack** — AI-generated Q&A pack to send to each supplier (MOQ, tooling, lead time, payment terms, comparable projects)
5. **NDA gate + warm-intro discovery** — require NDA ack before design share; surface warm paths via existing rfqs/awards

### Assemble page
6. **Launch Readiness Score** — composite 0-100 covering coverage × FAI × compliance × shipping × inventory
7. **Compliance Packet builder** — regional regulatory checklist (CE, FCC, RoHS, REACH, UL, UKCA) with supplier attestation status
8. **FAI checklist generator** — per-module First Article Inspection pass/fail template
9. **BOM traceability card** — per-unit provenance (module → supplier → lot # → cert)

### Cross-cutting
10. **Specialist integration** — Chase (VP Supply Chain) and Fang (VP Manufacturing) insights surfaced directly in UI, not just stage briefings

---

## Success criteria (what "done" means)

- [ ] All 9 features ship and render without errors
- [ ] Every new component uses design tokens (no hardcoded colors) and light-first palette
- [ ] No AI emphasis ("13 specialists" not "AI agents")
- [ ] Pages load cold with sensible empty states
- [ ] agent-browser walks Source and Assemble without runtime errors
- [ ] Vercel deployment shows Ready (not Error)
- [ ] `npx tsc --noEmit` passes
- [ ] Design-token script passes
- [ ] Test user cleaned up at end per 2026-04-17 rule

---

## Abort criteria

- If a migration fails and can't be fixed in 1 attempt → descope that feature, keep others
- If Vercel build errors on push → fix same-session, never leave red
- If an RLS policy can't be resolved safely → descope to localStorage-only; never commit insecure policies

---

## Red Team Rounds (5 cycles, different founder archetypes)

### Round 1 — First-time hardware founder (Alice)
**Background:** Ex-software engineer, raised seed, first hardware product.
**Fears:** I'll get ripped off. Suppliers will string me along. I don't know what questions to ask.
**Needs:** Templates, examples, guardrails, anchors for what normal looks like.
**Validates:** Capability Interview Pack, NDA gate, Supplier Relationship Hub

**What Round 1 demanded we change in the design:**
- Capability Interview Pack must have **default template** (she can't write one from scratch)
- Must include **red flags checklist** — supplier responses that should worry her
- Supplier Relationship Hub must show **"avg response time"** benchmarked against expected (48h)
- NDA gate must have **a default NDA template link** (pointing to a generic mutual NDA)
- Tooltips everywhere explaining **why** each field matters

### Round 2 — Ex-BigCo operator turned founder (Ben)
**Background:** 15 years at Dyson/Bose. Knows what "good" looks like in supplier relationships.
**Fears:** My suppliers are too small to scale. Single-point-of-failure. Capability gaps I haven't spotted.
**Needs:** Redundancy, capacity signals, supplier depth beyond one small shop.
**Validates:** Supply Risk Radar, Volume Ramp Planner

**What Round 2 demanded we change in the design:**
- Supply Risk Radar must flag **single-source categories** with a **severity score**, not a binary warning
- Volume Ramp Planner must let you tag a supplier as **"proto only — cannot scale"** explicitly
- Show **employee_count_exact** and **founded_year** on supplier cards so the founder judges capability depth
- Risk Radar must flag **>70% in one country** AND **>50% in one supplier across your BOM**
- Need a **"backup supplier"** slot per category — visible even if empty

### Round 3 — Deep-tech founder in regulated industry (Chen)
**Background:** Ex-MedTech engineer. Product will need FDA 510(k). Export-controlled (ITAR).
**Fears:** Compliance failure. IP leak through unsecured supplier comms. Non-compliant supplier blows up my launch.
**Needs:** Compliance Packet, cert attestations, NDA enforcement, export-controls check.
**Validates:** Compliance Packet, NDA gate, export-controls surface

**What Round 3 demanded we change in the design:**
- Compliance Packet must support **custom regulations** (FDA 510(k), ISO 13485, ITAR), not just a fixed list
- Show **supplier's export_controls** and **security_clearances** fields from marketplace_listings on the card
- NDA gate must require **NDA reference (doc ID)** logged before design share, not just a checkbox
- FAI must include a **"traceability record retained"** line for regulatory audit
- Launch Readiness must deduct points if any regulatory packet is missing

### Round 4 — Cost-sensitive bootstrapper (Dipa)
**Background:** No outside money. Needs to ship 100 units to paying customers to survive.
**Fears:** MOQ traps (supplier wants 5,000 min). Tooling sunk cost. Running out of cash mid-production.
**Needs:** MOQ checks, tooling cost visibility, cost-down roadmap, total-cost-of-ownership.
**Validates:** Volume Ramp Planner, Capability Interview Pack, Launch Readiness

**What Round 4 demanded we change in the design:**
- Capability Interview Pack must ask for **MOQ**, **tooling cost**, **NRE**, **per-unit cost at 100 / 1000 / 10000**
- Volume Ramp Planner must **warn if MOQ > target volume** for a stage (e.g., supplier MOQ 5000 for pilot of 100)
- Show **unit cost curve** on supplier card if responses have been received
- Launch Readiness must include a **"cash to ship"** line item
- Cost rollup on Assemble must surface **tooling amortisation** per unit

### Round 5 — Global seller / repeat founder (Elena)
**Background:** Third hardware product. Sells into EU, US, APAC. Tariff-aware.
**Fears:** Tariff changes (especially US-China Section 301). Port disruption (e.g., Red Sea). Slow response from suppliers killing her launch window.
**Needs:** Geographic risk map, trade-lane exposure, supplier SLA tracking.
**Validates:** Supply Risk Radar, Supplier Relationship Hub

**What Round 5 demanded we change in the design:**
- Supply Risk Radar must show **trade-lane exposure** (e.g., "80% of your BOM ships via Shanghai")
- Supplier Relationship Hub must track **days since last contact** per supplier and highlight stale threads (>14d)
- Show **"tariff exposure"** estimate for suppliers in high-tariff regions when shipping to US (e.g., Section 301 list)
- Response time SLA should be **user-configurable** — not all suppliers are expected to reply in 48h (overseas = 5 business days)

---

## Red Team Synthesis — Revised ship list

Adding the round findings into the build plan:

### Source
- **Supplier Relationship Hub** now includes: response-time tracking + stale thread flags + SLA
- **Supply Risk Radar** now includes: dual-sourcing severity + geographic % + trade-lane + tariff exposure + backup slot
- **Volume Ramp Planner** now includes: proto/pilot/production tag + "cannot scale" flag + MOQ warning
- **Capability Interview Pack** now includes: MOQ/tooling/NRE/unit cost at tiers + red flags checklist + default template
- **NDA gate** now includes: reference doc ID field + default template link + export-controls display

### Assemble
- **Launch Readiness Score** now deducts for: missing regulatory packet + missing FAI + MOQ-vs-volume mismatch + cash-to-ship shortfall
- **Compliance Packet** now supports: custom regulations + supplier attestation status + traceability record retention
- **FAI checklist** now includes: traceability record retained field
- **BOM traceability card** unchanged — as designed

---

## Phases

### Phase 1: Tracker + Red Team ← CURRENT
- [x] Build tracker doc with 5 red team rounds
- [x] Synthesise findings back into design

### Phase 2: Source — Supplier Relationship Hub
- [ ] Migration: `supplier_outreach_threads` table (project × supplier × messages)
- [ ] Server action: list threads, send message, mark read, compute response-time
- [ ] Component: SupplierRelationshipHub (new tab in Source)
- [ ] Integrate into Source page as new tab
- [ ] Show stale thread warnings

### Phase 3: Source — Supply Risk Radar
- [ ] Lib: computeSupplyRisk(shortlistedSuppliers, categoryRankings, marketplace data)
- [ ] Component: SupplyRiskRadar card (dual-source + geo concentration + trade-lane)
- [ ] Wire into Shortlist tab as top-of-panel warning

### Phase 4: Source — Volume Ramp Planner
- [ ] Extend ShortlistedSupplier interface with rampRole: "proto" | "pilot" | "production" | "cannot_scale"
- [ ] Component: VolumeRampPlanner (table view per category, drag-or-click tags)
- [ ] Surface MOQ warnings
- [ ] Persist to localStorage + cad_lab_projects.volume_ramp JSONB (new column)

### Phase 5: Source — Capability Interview Pack
- [ ] Server action: generateCapabilityInterviewPack(moduleIds, supplierId) → LLM-generated pack
- [ ] Component: CapabilityInterviewPackDialog with preview + copy-to-clipboard + download .txt
- [ ] Include default fallback template if LLM unavailable
- [ ] Add "Generate interview pack" button on supplier cards in Shortlist

### Phase 6: Source — Warm Intro + NDA gate
- [ ] Extend marketplace_listings-backed warm_intro_requests to also apply to suppliers (verify it already does — migration text shows it references marketplace_listings generically which includes suppliers)
- [ ] Component: NDAGate (checkbox + doc ID input, stored in localStorage)
- [ ] Show export_controls + security_clearances on supplier card

### Phase 7: Assemble — Launch Readiness Score
- [ ] Lib: computeLaunchReadiness(project state) → { score: 0-100, breakdown: { coverage, fai, compliance, shipping, inventory } }
- [ ] Component: LaunchReadinessGauge (large circular score + breakdown)
- [ ] Hero position on Assemble page (above tabs)

### Phase 8: Assemble — Compliance Packet
- [ ] New tab in Assemble: "Compliance"
- [ ] Component: CompliancePacket (region selector + regulation list + supplier attestation status)
- [ ] Persist to cad_lab_projects.compliance_packet JSONB

### Phase 9: Assemble — FAI + BOM traceability
- [ ] Component: FAIChecklist per module
- [ ] Component: BOMTraceabilityCard (per-unit provenance template)
- [ ] Add to Assembly Flow tab

### Phase 10: Migrations + Types regen
- [ ] Apply `supplier_outreach_threads` migration (if needed — may use project JSONB instead to avoid migration)
- [ ] Apply `volume_ramp` + `compliance_packet` columns if not JSONB-piggybacked
- [ ] Regenerate types
- [ ] tsc --noEmit

### Phase 11: Verify + commit + push
- [ ] Create test user + foundry via secure script
- [ ] agent-browser walkthrough of Source + Assemble
- [ ] Screenshot key new components
- [ ] Fix any runtime errors
- [ ] Commit + push
- [ ] Verify Vercel Ready
- [ ] Delete test user + foundry per 2026-04-17 rule

---

## Score Card (keep updated)

| Phase | Status | Notes |
|-------|--------|-------|
| 1. Tracker + Red Team | ✅ | Done |
| 2. Supplier Relationship Hub | ⏳ | |
| 3. Supply Risk Radar | ⏳ | |
| 4. Volume Ramp Planner | ⏳ | |
| 5. Capability Interview Pack | ⏳ | |
| 6. Warm Intro + NDA gate | ⏳ | |
| 7. Launch Readiness Score | ⏳ | |
| 8. Compliance Packet | ⏳ | |
| 9. FAI + BOM traceability | ⏳ | |
| 10. Migrations + types | ⏳ | |
| 11. Verify + commit | ⏳ | |

---

## Rules (self-discipline)

- **Every commit** must pass `npx tsc --noEmit` AND design-token check
- **No `any` types** — use unknown + type guards
- **Light-first design tokens only** — no dark mode, no hardcoded hex
- **No AI emphasis** — "13 specialists" not "AI agents"
- **No "use server" files exporting non-async** — maxDuration goes in route segment config
- **Log every fix** to `~/.claude/projects/-Users-tristanfischer/memory/forgeos-fix-log.md`
- **Test user cleanup** at session end per 2026-04-17 rule
- **Verify in agent-browser** after push, not just tsc
