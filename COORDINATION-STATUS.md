# ForgeOS Redesign — Coordination Status

> **Single source of truth for multi-terminal phase progress.** Every terminal appends one line when a milestone ships. Read this FIRST before starting any "continue <section>" task.

**Phase order (locked 2026-04-19):** Forge → Money → Plan → Products

---

## Live Status

| Phase | Section | State | Branch | Pickup doc | Last update |
|---|---|---|---|---|---|
| 1 | Forge | PR #1 merged, PR #1.5 in flight | `feat/forge-visual-rebuild` | `HANDOVER-pr1-5-build.md` | 2026-04-19 |
| Pre | Products Coming Soon sidecar | Not started | `feat/products-coming-soon` (planned) | `PHASE-PLAN.md` §Pre-Phase | 2026-04-19 |
| 2 | Money | Prep pending | — | (awaits `HANDOVER-money.md`) | — |
| 3 | Plan | Prep pending | — | (awaits `HANDOVER-plan.md`) | — |
| 4 | Products | prep shipped — awaiting review | — | `HANDOVER-products.md` | 2026-04-19 |

---

## Milestone Log (append one line per event)

- ✅ 2026-04-19 — Forge PR #1 merged to main (commit `000be5b3`). Feature flags OFF, no user-visible change yet.
- ✅ 2026-04-19 — Forge PR #1.5 research foundation shipped to `feat/forge-visual-rebuild`: HANDOVER-pr1-5-build.md, SIDEBAR-CLASS-INVENTORY.md, TODAY-V3-SIGNAL-PORTING-MAP.md, FORGE-LEGACY-ROUTES-AUDIT.md, TRACKER-forge-visual-rebuild-pr1-5.md.
- ✅ 2026-04-19 — Phase order revised: Forge → Money → Plan → Products (was Forge → Products → Plan → Money). Products Coming Soon sidecar planned as pre-phase.
- ✅ 2026-04-19 — Parallelisation decision locked: prep docs parallel (3 terminals), code builds sequential. See MemPalace `drawer_forgeos_decisions_9cafddb3415ab00b`.
- ✅ 2026-04-19 — Products prep shipped (Phase 4): PRODUCTS-SCHEMA.md + PRODUCTS-MOCKUP-INDEX.html + PRODUCTS-MOCKUP-GAP-AUDIT.html + HANDOVER-products.md. 18 gaps (6 MUST) + 5 red-team critiques (2 CRIT / 2 HIGH / 1 MED). Awaiting Tristan red-team review → reply `locked` to unblock build.

---

## How to pick up from this file

**Starting a new build session:**
```
cd "/Users/tristanfischer/Developer/CentaurOS created 260126 1435" && cat COORDINATION-STATUS.md
```

Then follow the pickup doc for the section you're continuing.

**"Continue Money" prompt:**
```
Continue Money build per HANDOVER-money.md. Read COORDINATION-STATUS.md first, then HANDOVER-money.md, then MONEY-SCHEMA.md, then execute.
```

**"Continue Plan" prompt:**
```
Continue Plan build per HANDOVER-plan.md. Read COORDINATION-STATUS.md first, then HANDOVER-plan.md, then PLAN-SCHEMA.md, then execute.
```

**"Continue Products" prompt:**
```
Continue Products build per HANDOVER-products.md. Read COORDINATION-STATUS.md first, then HANDOVER-products.md, then PRODUCTS-SCHEMA.md, then execute.
```

---

## Append rules

- One line per milestone, dated `YYYY-MM-DD`.
- States: `prep in flight`, `prep shipped — awaiting review`, `review locked — build-approved`, `build in flight`, `merged to main`.
- When a section transitions, update BOTH the Live Status table AND append a Milestone Log entry.
- Do NOT delete old entries — the log is append-only history.

---

## Pipeline rules (state machine for the autonomous build terminal)

**The build terminal runs continuously through all 4 phases. It consults this file between phases and picks up the next ready one.**

### State transitions (per section)

```
not started
    ↓ (prep terminal starts)
prep in flight
    ↓ (prep terminal commits + updates this file)
prep shipped — awaiting review
    ↓ (Tristan red-teams the gap audit, says "locked")
review locked — build-approved
    ↓ (build terminal starts)
build in flight
    ↓ (PR merges to main)
merged to main
```

### Build terminal decision loop (runs after each PR merge)

1. Re-read this file.
2. Find the next phase in order (Forge → Money → Plan → Products) whose state is `review locked — build-approved`.
3. If found: check out the section's handover doc (`HANDOVER-<section>.md`), create branch `feat/<section>-redesign`, start building.
4. If the next phase is `prep shipped — awaiting review`: notify Tristan (iMessage + prominent banner) and wait. Do NOT close session.
5. If the next phase is `not started` or `prep in flight`: notify Tristan that prep is still needed. Wait.
6. If all 4 sections are `merged to main`: update this file to `redesign complete — pipeline closed` and report to Tristan. Session may end.

### Prep terminal completion protocol

Each of the 3 prep terminals (Money, Plan, Products) MUST do ALL of these on completion:

1. Commit schema + gap audit + handover doc to main.
2. Save MemPalace drawer `forgeos/decisions` summarising V1 cuts + open questions.
3. Update Live Status table row for their section: state = `prep shipped — awaiting review`, pickup doc = `HANDOVER-<section>.md`.
4. Append Milestone Log line with date.
5. Notify Tristan via iMessage (or prominent banner): `<Section> prep ready for red-team review — open <SECTION>-MOCKUP-GAP-AUDIT.html and reply "locked" when approved.`
6. Session may end after step 5.

### Tristan's role (minimised)

- Kick off 3 prep terminals (once).
- When notified, open each `<SECTION>-MOCKUP-GAP-AUDIT.html`, red-team it, reply `locked` to the build terminal (or update this file directly if convenient).
- Nothing else. Pipeline is self-driven between prep completions and build completions.

### Compaction safety

Between each phase, the build terminal must save a MemPalace checkpoint (`forgeos/decisions`) describing what just shipped + what's next. This guarantees the chain survives `/compact` or session restart. A fresh session reading MEMORY.md + this file can always re-enter the pipeline at the correct state.
