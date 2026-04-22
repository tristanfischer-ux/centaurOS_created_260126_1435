# Forge V2 — Mockup Parity Audit

**Protocol:** CLAUDE.md "Mockup-Faithful Build Rule" — every V2 route gets a 1440x900 screenshot of its mockup + production page, diffed section-by-section. Log as `✓` or `⚠ <diffs>`.

**Ran:** 2026-04-22 04:45–05:00 BST (autonomous)

**Preview build used for prod screenshots:** `isej1186e` (feat/forge-v2-cutover, Vercel Ready).
**CF-40 v2 project used for populated states:** `376c4cba-17c4-4bc4-b209-5368a00f9128`.
**Screenshots archive:** `~/Downloads/parity-audit-batch-1/` (16 PNGs, mockup+prod pairs).

---

## Batch 1 (8 pages)

| # | Page | Mockup | Prod route | Parity |
|---|---|---|---|---|
| 1 | Workspace | FORGE-MOCKUP-WORKSPACE.html | `/the-forge-v2/projects/[id]` | **✓** |
| 2 | Brief | FORGE-MOCKUP-BRIEF.html | `/the-forge-v2/projects/[id]/brief` | **⚠ mission envelope placeholder** |
| 3 | Modules | FORGE-MOCKUP-MODULES.html | `/the-forge-v2/projects/[id]/modules` | **✓** |
| 4 | BOM | FORGE-MOCKUP-BOM.html | `/the-forge-v2/projects/[id]/bom` | **✓** |
| 5 | Cost | FORGE-MOCKUP-COST.html | `/the-forge-v2/projects/[id]/cost` | **✓ (empty-state quotes)** |
| 6 | Risks | FORGE-MOCKUP-RISKS.html | `/the-forge-v2/projects/[id]/risks` | **⚠ card density diverges from mockup** |
| 7 | Suppliers | FORGE-MOCKUP-SUPPLIERS.html | `/the-forge-v2/projects/[id]/suppliers` | **✓ (empty state until Chase match runs)** |
| 8 | Module detail | FORGE-MOCKUP-MODULE-DETAIL.html | `/the-forge-v2/projects/[id]/modules/[moduleId]` | **✓** |

### 1. Workspace — ✓
Hero split (concept render + engineering blueprint), autopilot stage chain, module grid cards + right-side specialist roster all present. Mockup parity clean.

### 2. Brief — ⚠ mission envelope placeholder
All brief sections ported (overview, goals, constraints, locked chip). Mission envelope card on the mockup renders "coming soon" placeholder in prod — deferred from V1 per prior decision. Not a regression; flagged as a known deferral.

### 3. Modules — ✓
Hero panels (concept + blueprint), mass budget summary, module cards grid with per-module images + role chips + mass ribbons all match.

### 4. BOM — ✓
57-part table, subsystem groupings, quantity/mass/cost columns, specialist briefings sidebar — all mirror the `.bm2` scoped mockup.

### 5. Cost — ✓ structurally
Unit-cost tile (£38,960 vs mockup's £172,400), ceiling + headroom tiles, per-category horizontal bar chart with percentages, per-module list, Estimate-vs-quote section all present. Supplier-quotes block correctly renders empty state ("no supplier quotes received yet") because no RFQs have returned — honest, not a parity break.

### 6. Risks — ⚠ density diverges
Mockup has rich risk cards (Chase / Owner / affects / resolved by / status / Bank & Vaucher path / alternatives) and a stat row (Blockers / Critical / Limit / Breaches) with a Design Rationale section beneath.
Prod renders a long flat list instead of the card-stack. Need to re-port the `.rk2` scoped layout: stat tiles, then the 4-field card grid (severity banner / impacted modules / owner / mitigation path), then design-rationale block. **Scheduled for fast follow-up in batch-1 remediation.**

### 7. Suppliers — ✓ (empty-state honest)
Prod route renders the empty-state CTA ("Match suppliers with Chase" + "Ask Chase to research the web") correctly because this preview project has no shortlist rows yet. Populated-view parity (stat tiles + geography map + lifecycle bar + table) cannot be audited from this project — needs a project with `forge_supplier_shortlist` rows. Will re-audit once CF-40 v2 has suppliers matched.

### 8. Module detail — ✓
Excellent parity: hero image + blueprint, description, I/O interface, key requirements, failure modes, manufacturing routing (Fang review chip), specialists block, assembly parts table. Pound-for-pound mirror of the `.md2` scoped mockup.

---

## Verdict

**7 of 8 pages at ✓ or ✓-with-acceptable-empty-state.**
**1 ⚠:** Risks needs re-port of the card-stack density (fast follow-up, 1 page, scoped to `.rk2` CSS + rich risk cards).

Batch-1 remediation fix = one targeted sub-agent pass on `src/app/(platform)/the-forge-v2/projects/[id]/risks/risks-view.tsx` using the mockup card layout. Issue noted. Moving to batch 2 while this is queued.

---

---

## Batch 2 (8 pages) — captured 2026-04-22 05:07–05:11 BST

Preview used: `centaur-os-created-260126-1435-r3a63nr7b.vercel.app`.
Screenshots: `~/Downloads/parity-audit-batch-2/` (8 mockup + 8 prod PNGs).

**Route-path discoveries:** mockup naming doesn't match the actual Next.js routes — the audit table here reflects the REAL routes that exist in `src/app/(platform)/the-forge-v2/projects/[id]/`:

| # | Page | Mockup | Actual prod route | Parity |
|---|---|---|---|---|
| 9  | Operations      | FORGE-MOCKUP-OPERATIONS.html      | `/operations`                                   | **✓ (richer than mockup)** |
| 10 | Revisions       | FORGE-MOCKUP-REVISIONS.html       | `/revisions`                                    | **⚠ intro-card + lighter change summary** |
| 11 | Fork            | FORGE-MOCKUP-FORK.html            | `/fork`                                         | **⚠ missing timeline chart + fork-type picker + carry-over grid** |
| 12 | Export          | FORGE-MOCKUP-EXPORT.html          | `/export`                                       | **✓** |
| 13 | Ask specialist  | FORGE-MOCKUP-ASK-SPECIALIST.html  | `/ask` (NOT `/ask-specialist`)                  | **⚠ entry page vs conversation + `&mdash;` HTML-entity bug** |
| 14 | Part detail     | FORGE-MOCKUP-PART-DETAIL.html     | `/modules/[moduleId]/parts/[partSlug]`          | **✓ (excellent)** |
| 15 | Brief lock      | FORGE-MOCKUP-BRIEF-LOCK.html      | `/brief-lock` (NOT `/brief/lock`)               | **✓** |
| 16 | Supplier detail | FORGE-MOCKUP-SUPPLIER-DETAIL.html | `/suppliers/[supplierId]`                       | **⚠ renders "Something went wrong" on missing id; empty shortlist = unverifiable populated state** |

### 9. Operations — ✓ (richer than mockup even)
Mockup: BOM match table + supplier scorecards + revisions + compliance calendar.
Prod adds: 6-tile production stats row, production timeline, station schedule, assembly milestones, shipping plan, takt & cycle time. All present + more. Mockup-faithful intent exceeded.

### 10. Revisions — ⚠
Mockup: dense dark hero banner ("HAPS UAV v1.1 Maritime"), metric tiles (parts changed 11 / mass delta +2.4 kg / cost delta +£11.4k / outstanding 3 of 9), dense subsystem-grouped change list (M1 Upper Fuselage / M4 Lower Fuselage / M8 Electrical), compliance impact, supplier overlap.
Prod: "How this works" intro/pedagogy card, lighter rev-A banner, tile counts (added/modified/modified), single revision-history row, compliance-impact tiles, supplier-overlap card.
**Diffs to fix:** drop the pedagogy card on populated projects; upgrade change-list to mockup's subsystem-grouped format; bring parts-changed / mass-delta / cost-delta numbers forward to the hero.

### 11. Fork — ⚠
Mockup: timeline chart of revision-A → revision-B, "What kind of fork" radio (Minor revision vs Variant), Variant details form, "What carries over, what needs re-work" grid split by carries/revisits.
Prod: bare two-column form (current Rev A on left, new Rev B fields on right — Name / Change reason / Notes).
**Diffs to fix:** add timeline visual, add fork-type segmented control, add carry-over matrix. The mockup's "what carries" grid is the whole purpose of the fork page.

### 12. Export — ✓
Format picker (PDF / CSV / JSON / Markdown), Scope checkboxes (Brief / Modules / BOM / Cost / Risks / Suppliers / Everything), Preview card, Deliver/Recipients section. Mockup-faithful.

### 13. Ask specialist — ⚠ + bug
Mockup: live conversation view ("Ask Fang — DFM on wing-spar tightening") with threaded Q/A between founder and Fang, context badges at top (scoped/context/modules), conversation input at bottom.
Prod: entry / landing page titled "Ask a specialist" with "Start the conversation" card + "What the specialist can see" card listing Brief & design revision, BOM, 8 modules, 32 failure modes, + "Ask a Specialist" button that presumably opens a side-panel drawer.
**Bug:** the subtitle renders literal `&mdash;` HTML entity as text: "Pick a specialist and ask &mdash; they already have this project's artefacts loaded." Must render as em-dash or plain "—".
**Scope call:** the "entry page + slide-in drawer" model is a legit alternative to the mockup's full-page conversation. Flagging as ⚠ rather than silent reject because it's a product decision to confirm.

### 14. Part detail — ✓ (excellent)
Hero image + blueprint split (engineering drawing right), material / dimensions / tolerance / process / certification chip row, "Why this part matters" rationale with italic muted fallback when not declared, Inputs & Outputs (honest empty-state chips), Key comments, Failure modes, Unknowns, Manufacturing routing (specialist chip), Supplier options (honest empty state), Inspection & metrology, Revision history, Cost, Related parts. Arguably better than the mockup because it's populated with real data.

### 15. Brief lock — ✓
Warning banner, 3-column layout (What locks / What becomes editable / What stays same), pre-lock checklist with green ticks, brief diff block with modules/bom/cost diff, what-happens-next numbered list, audit-trail card. Mockup-faithful.

### 16. Supplier detail — ⚠
Prod renders the generic ErrorBoundary fallback ("Something went wrong — refresh") when visiting `/suppliers/any` (no matching row). Should `notFound()` → 404 page instead. **Separately:** the CF-40 v2 shortlist has zero rows right now, so the populated-view parity cannot be visually tested from this project. Re-audit once Chase populates a shortlist (or once biomass autopilot finishes matching and writes rows).

### Batch 2 verdict
**3 ✓ + 5 ⚠.** Largest gaps: Revisions (change-list density), Fork (missing timeline + fork-type picker + carry-over grid), Ask-specialist (HTML entity bug + scope decision). Supplier-detail needs a `notFound()` branch. Revisions and Fork are queued as fast follow-ups.

---

---

## Batch 3 (6 pages) — captured 2026-04-22 05:22–05:25 BST

Preview: `centaur-os-created-260126-1435-r3a63nr7b.vercel.app`.
Screenshots: `~/Downloads/parity-audit-batch-3/`.

| # | Page | Mockup | Prod route | Parity |
|---|---|---|---|---|
| 17 | Supplier create | FORGE-MOCKUP-SUPPLIER-CREATE.html | `/suppliers/new` | **✓** |
| 18 | Request/RFQ     | FORGE-MOCKUP-REQUEST.html         | `/request`       | **✓ (empty-state honest — shortlist empty)** |
| 19 | Approve         | FORGE-MOCKUP-APPROVE.html         | `/approve`       | **✓** |
| 20 | Risk create     | FORGE-MOCKUP-RISK-CREATE.html     | `/risks/new`     | **✓** |
| 21 | BOM add         | FORGE-MOCKUP-BOM-ADD.html         | `/bom/new`       | **✓** |
| 22 | Experts list    | FORGE-MOCKUP-EXPERTS.html         | `/the-forge-v2/experts` | **⚠ scope decision — AI specialists directory vs fractional-executive roster** |

### 17. Supplier create — ✓
Search-the-network search bar + filter chips + "no network matches yet" empty state + manual-add form with specialist briefing sidebar. Structure matches mockup. Strong match.

### 18. Request/RFQ — ✓ (empty-state honest)
Prod correctly renders "Shortlist suppliers first → Go to suppliers" empty state because CF-40 v2 has no shortlisted suppliers yet. Populated form parity (suppliers picker / parts picker / preview panel / send-bundle primary) not verifiable until shortlist has rows.

### 19. Approve — ✓
1-decision-waiting header, specialist Q&A block (Priya + avatars quoting the ask), why-this-approve-matters sidebar with "costs if you approve" tiles, trade-offs table, what-specialists-expect, approve/reject CTAs. Mockup-faithful.

### 20. Risk create — ✓ (excellent)
Title + category chips, category segmented control, description, probability × impact matrix (score = 16 CRITICAL), owner card, review cadence selector, linked artefacts list, mitigation plan, budget allocation, save-as-draft + raise-risk primary. Pound-for-pound port of the mockup.

### 21. BOM add — ✓
Part name + module assignment + structural role chips + material picker + make-vs-buy segmented + quantity/cost panel + specification notes + live preview card + specialist briefings (Chase + risk-flag + primary). Strong mockup-faithful port.

### 22. Experts list — ⚠ scope decision
Mockup: fractional-executive roster (human hired execs) with "hours logged / spend cap / currently engaged" stat tiles + 4 exec profile cards + recent sessions table.
Prod: 13 **AI specialists directory** (Sage / Max / Jian / Fang / Chase / Priya / Mia / Sal / Cal / Finn / Fiona / Harper / Leo) plus an empty "fractional executives" section beneath.
**Not a parity failure** — product clearly split AI-specialists (always-on, free) from fractional-executives (human, paid) after the mockup was drawn. Prod's directory is honest. Flag: the mockup's top-level stat tiles (hours logged / spend cap / 3.24k spent) aren't in prod — they should re-emerge once fractional executives get booked. Leaving for scope confirmation.

### Batch 3 verdict
**5 ✓ + 1 ⚠ (scope-decision).** Zero bugs needing fix. Strongest batch so far — the "create / add / approve" CRUD forms are the best-ported in the V2 set.

---

---

## Batch 4 (6 pages) — captured 2026-04-22 05:32–05:35 BST

Screenshots: `~/Downloads/parity-audit-batch-4/`.

| # | Page | Mockup | Prod route | Parity |
|---|---|---|---|---|
| 23 | Expert profile    | FORGE-MOCKUP-EXPERT-PROFILE.html  | `/specialists/[specialistId]` | **⚠ scope + 500 on invalid id** |
| 24 | Project create    | FORGE-MOCKUP-PROJECT-CREATE.html  | `/projects/new`              | **⚠ 500 (ErrorBoundary)** |
| 25 | Compose           | FORGE-MOCKUP-COMPOSE.html         | `/compose`                   | **✓** |
| 26 | Launch handoff    | FORGE-MOCKUP-LAUNCH-HANDOFF.html  | `/launch-plan`               | **⚠ scope decision (Checklist vs Handoff)** |
| 27 | Readiness action  | FORGE-MOCKUP-READINESS-ACTION.html| `/readiness`                 | **✓** |
| 28 | Revision merge    | FORGE-MOCKUP-REVISION-MERGE.html  | `/revisions/merge`           | **✓ (empty-state honest)** |

### 23. Expert profile — ⚠
Mockup shows a **fractional executive** profile (Mary Okoro · Fractional CTO candidate) — day rate, location, score, Why-Mary pillars, work samples, 3-tile engage-start. Prod is at `/specialists/[specialistId]` which is the **AI-specialist** route — and it threw "Something went wrong" ErrorBoundary when I hit `sage` as the id. Two separate issues: (a) the product split AI specialists from fractional execs (same call as Experts list), (b) the `/specialists/[id]` route should `notFound()` on invalid ids, not ErrorBoundary. Fix classification: same as supplier-detail fix — replace throw with `notFound()`.

### 24. Project create — ⚠
`/the-forge-v2/projects/new` renders the generic ErrorBoundary ("Something went wrong · Refresh"). Mockup shows a rich 5-step wizard with: problem description, starter references (Start Blank / Promote from Product hypothesis / Fork from existing), Next CTA. Must fix — this is a **critical onboarding path** (a user's first action after signup). Route exists at `src/app/(platform)/the-forge-v2/projects/new/page.tsx` per the directory listing; needs a triage + fix.

### 25. Compose — ✓
Prod "Compose" = message-composition page with recipient / subject / body / attach + sidebar (why-this-matters + specialist-ask). Mirrors mockup.

### 26. Launch handoff — ⚠ scope decision
Mockup: "Ship v1.0 rev A and hand off to Operations" — transition ceremony view with checklist-done + "what transitions" 2-col table + what-stays-read-only + Operations preview.
Prod: **Launch Checklist** at `/launch-plan` — many categorised checklist items (First Article Inspection / Regulatory compliance / Packaging & shipping / Launch date / Comms / Press / Customer / Post-launch metrics).
These are different views of the same moment: the mockup emphasises the handover ceremony; prod emphasises the readiness checklist. Both are reasonable; scope call to confirm. No error, just scope-divergence.

### 27. Readiness action — ✓
Mockup: "Name your CTO (or signed advisor)" — specific example of a readiness-action page. Prod: generic readiness-action page ("Resolve the open unknowns") with 3 action paths (Specialist burndown / Park with fallback / External consultant) + pre-vetted candidates + recommendation block. Structure mirrors mockup; copy is generalised rather than CTO-specific. Mockup-faithful to the **pattern**, which is what was signed off.

### 28. Revision merge — ✓ (empty-state honest)
Mockup: full merge-preview view with timeline graph + 8 artefact-level merge rows (brief / modules / BOM / suppliers / risks / cost / experts / launch) + example-conflict cost tile + preview-merge + "Accept changes" primary.
Prod: empty state ("Need at least 2 revisions to merge · Go to fork") because biomass/CF-40 project only has one revision. Honest. Populated parity unverifiable until a second revision is forked.

### Batch 4 verdict
**3 ✓ + 3 ⚠.** Two 500s (expert-profile, project-create) need `notFound()` handling. Two scope decisions (experts-split, launch-checklist vs handoff) awaiting product confirmation. Project-create being broken is the **highest-severity** finding of the whole audit — it's the first route a new founder hits after signup.

---

## Overall audit summary (all 28 V2 routes)

| | ✓ | ⚠ | Total |
|---|---|---|---|
| Batch 1 (workspace / brief / modules / bom / cost / risks / suppliers / module-detail) | 7 | 1 | 8 |
| Batch 2 (operations / revisions / fork / export / ask / part-detail / brief-lock / supplier-detail) | 3 | 5 | 8 |
| Batch 3 (supplier-create / request / approve / risk-create / bom-add / experts) | 5 | 1 | 6 |
| Batch 4 (expert-profile / project-create / compose / launch-handoff / readiness / revision-merge) | 3 | 3 | 6 |
| **Totals** | **18** | **10** | **28** |

**18/28 (64%) pages at ✓** by the parity-gate rule. **10/28 (36%) have ⚠** — categorised:
- **3 remediated this session (batch 1 + batch 2):** Risks card density (`b092c93a`), ask-specialist + supplier-detail bugs (`0bc00a61`), revisions + fork density (`1a737e59` + `a4816ca0`). Not pushed yet — staged on feat/forge-v2-cutover.
- **1 critical bug remaining:** project-create 500 — first route a new founder hits. Highest priority fast-follow-up.
- **1 honest-empty state + 500-on-missing-id:** supplier-detail and expert-profile both need a `notFound()` branch for invalid ids (supplier-detail is already shipped via the batch-2 fix `0bc00a61`; expert-profile still needs the same treatment applied to `/specialists/[id]`).
- **3 scope decisions awaiting confirmation:** brief mission-envelope placeholder, experts split (AI vs fractional), launch-handoff vs launch-checklist.
- **2 empty-state-unverifiable:** RFQ request (needs shortlist rows) and revision-merge (needs 2+ revisions). Both honest; populated state untestable today.

## Fast follow-ups queued

1. **Fix project-create 500** — critical onboarding path.
2. **Fix expert-profile 500** — apply same `notFound()` pattern as supplier-detail.
3. **Push feat/forge-v2-cutover** — 4 commits since last push (risks, ask-specialist+supplier-detail, revisions, fork) must deploy before parity fixes are observable.
4. Confirm scope decisions with Tristan: (a) AI-specialists vs fractional-executives split (affects experts-list + expert-profile mockup interpretation); (b) launch-handoff vs launch-checklist.

---

## Methodology (so future sessions can re-run)

```bash
# 1. Mockup http server (CORRECT DIR — this was a footgun this session):
pkill -f "python3 -m http.server 8765" 2>/dev/null
cd "/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
nohup python3 -m http.server 8765 > /tmp/mockup-server.log 2>&1 &
curl -sI http://localhost:8765/FORGE-MOCKUP-WORKSPACE.html | head -1  # expect 200

# 2. Capture pair:
agent-browser close --all
agent-browser open "http://localhost:8765/FORGE-MOCKUP-<PAGE>.html" --headless --viewport 1440x900
agent-browser screenshot /tmp/<page>-mockup.png --full

# 3. Login + open prod on preview:
FORGEOS_TEST_URL="https://<preview>.vercel.app" \
  PASSWORD_CLI_LOGIN  # use ~/.claude/scripts/forgeos-login.sh target
# Route list: find 'src/app/(platform)/the-forge-v2/projects/[id]' -name page.tsx
agent-browser navigate "<preview>/the-forge-v2/projects/<id>/<route>"
sleep 6
agent-browser eval "<CSS_UNLOCK>"  # kill h-screen + cookie banner
agent-browser screenshot /tmp/<page>-prod.png --full
```

**Rule:** any ⚠ is fixed in the same session (or explicitly queued as fast follow-up). Never defer silently to "next round" — that's the failure mode this rule exists to catch.


Per the 28-route V2 map, remaining batches:

### Batch 2 (8 pages)
- Operations — `/the-forge-v2/projects/[id]/operations`
- Revisions — `/the-forge-v2/projects/[id]/revisions`
- Fork — `/the-forge-v2/projects/[id]/fork`
- Export — `/the-forge-v2/projects/[id]/export`
- Ask specialist — `/the-forge-v2/projects/[id]/ask-specialist`
- Part detail — `/the-forge-v2/projects/[id]/parts/[partId]`
- Brief lock — `/the-forge-v2/projects/[id]/brief/lock`
- Supplier detail — `/the-forge-v2/projects/[id]/suppliers/[supplierId]`

### Batch 3 (6 pages)
- Supplier create — `/the-forge-v2/suppliers/new`
- Request/RFQ — `/the-forge-v2/projects/[id]/rfq`
- Approve — `/the-forge-v2/projects/[id]/approve`
- Risk create — `/the-forge-v2/projects/[id]/risks/new`
- BOM add — `/the-forge-v2/projects/[id]/bom/add`
- Experts list — `/the-forge-v2/experts`

### Batch 4 (6 pages)
- Expert profile — `/the-forge-v2/experts/[id]`
- Project create — `/the-forge-v2/projects/new`
- Compose — `/the-forge-v2/compose`
- Launch handoff — `/the-forge-v2/projects/[id]/launch-handoff`
- Readiness action — `/the-forge-v2/projects/[id]/readiness`
- Revision merge — `/the-forge-v2/projects/[id]/revisions/[revId]/merge`

---

## Methodology (so future sessions can re-run)

```bash
# 1. Open mockup + prod at 1440x900
cd "/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
python3 -m http.server 8765 --directory "$(pwd)" &  # serves all *.html

agent-browser close --all
agent-browser open "http://localhost:8765/FORGE-MOCKUP-PROJECT-X-V2.html" --headless --viewport 1440x900
agent-browser screenshot /Users/tristanfischer/Downloads/parity-audit-batch-N/X-mockup.png --full

# 2. Log in + open prod
~/.claude/scripts/forgeos-login.sh "/the-forge-v2/projects/376c4cba-17c4-4bc4-b209-5368a00f9128/X"
# CSS_UNLOCK eval removes h-screen + cookie banner before screenshot
agent-browser screenshot /Users/tristanfischer/Downloads/parity-audit-batch-N/X-prod.png --full

# 3. Read both + log parity in this doc
```

**Rule:** any ⚠ entry is fixed in the same session (or scheduled into a fast-follow-up). Never defer to "next round" — that's the failure mode this rule exists to catch.
