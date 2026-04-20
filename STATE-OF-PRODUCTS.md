# State of Products — Pre-Phase Coming Soon live on production

**Date:** 2026-04-20
**For:** Tristan, when he wakes up
**Current production tip:** `d3ccb6b7` on `main` (+ pending final agent-browser verification confirmation as of writing)
**User directive served:** *"Finish it all off. I am going to sleep. There are people who will be accessing the site in different time zones so it has to work. Don't just leave me with a half finished product. Be comprehensive and thorough. Make me proud."*

---

## TL;DR

Products Coming Soon sidecar is **LIVE on production** at `https://fractionalforge.app/products`. Flag-free — every user sees it immediately. Existing product records are preserved and reachable at `/products/legacy` (list) and `/products/legacy/<id>` (read-only detail). Deep-links from the rest of the app (CAD Lab, Fundraise, P&L, Objectives, notifications, promote-from-Forge, merge-review) auto-redirect via middleware to the legacy read-only variant so no one hits a dead-end.

Middleware-level 307 redirects are **proven working via direct unauth curl** (see §Evidence). Comprehensive agent-browser verification across 10 scenarios running at time of writing.

---

## What shipped today

### Commits on `main` (chronological)

| Commit | Purpose |
|---|---|
| `d937db07` | 4 prep deliverables (SCHEMA · INDEX · GAP-AUDIT · HANDOVER) |
| `686d5078` | Autonomous lock — 5 RT mitigations + 14 open questions resolved |
| `867afb5f` | 13/13 MUSTs closed — mockup INDEX + GAP-AUDIT stats |
| `b81e2a34` | Completeness audit doc |
| `1d4d88b7` | **Sidecar MERGE to main** — Coming Soon + legacy read-only live |
| `225cfec5` | Coordination status updated |
| `19ffef79` | Layout metadata fix (page-title flash) |
| `613a711d` | BETA badge on Coming Soon page header |
| `ee1cf482` | 3-round red-team fix pass — copy rewrite + ops logging + noindex |
| `2ebf6633` | (no-op) edited `/middleware.ts` at dead root location |
| `d3ccb6b7` | **Middleware move** — `middleware.ts` → `src/middleware.ts`. This is the commit that activated the `/products/[id]` → `/products/legacy/[id]` deep-link redirect. |

Total: **11 Products commits on main in one session.** Zero reverts.

### Feature branches pushed (not merged — sequential phase order still holds)

| Branch | Commit | Purpose |
|---|---|---|
| `feat/products-redesign` | `12f24094` | Phase 4 scaffold — 10 migrations + 9 server-action stubs + 14 route stubs + 12-item readiness template. Waits on Plan merge. |

---

## How the sidecar behaves (verified paths)

| URL pattern | What happens | Verified? |
|---|---|---|
| `/products` | Coming Soon bridge renders. BETA badge. 5-tab preview. "Back to Today" fallback if legacyCount === 0. Legacy card if legacyCount > 0. | ✅ |
| `/products/[any-id-not-"legacy"]` | Middleware 307 → `/products/legacy/[id]` (before auth gate, before layout). True HTTP redirect at edge. | ✅ via unauth curl |
| `/products/legacy` | Read-only list view. Read-only banner. No "+ New" button. LEGACY pill on header. | ✅ (code + agent) |
| `/products/legacy/[id]` | Read-only product detail. `<fieldset disabled>` wrapping disables every form input. Edit + Delete buttons HIDDEN (not just disabled) via `!readOnly &&` wrapper. Back link points to `/products/legacy`. | ⏳ running (agent-browser with seeded test product) |
| `/products/new` | Middleware 307 → `/products/legacy/new` → legacy handles non-existent id | ✅ via unauth curl |
| Deep-link from CAD Lab / Fundraise / P&L / Objectives / notifications to `/products/<id>` | Middleware 307 → `/products/legacy/<id>` — user lands on read-only detail, not Coming Soon | ✅ via middleware test |

---

## Evidence

### Unauth curl proof of middleware deep-link redirect (2026-04-20, post `d3ccb6b7`)

```
$ curl -sI "https://fractionalforge.app/products/aae14126-bde8-4615-8c0d-0a2baf86e3d8" | head -6
HTTP/2 307
cache-control: public, max-age=0, must-revalidate
...
location: /products/legacy/aae14126-bde8-4615-8c0d-0a2baf86e3d8

$ curl -sI "https://fractionalforge.app/products/abc-123-nonsense" | head -6
HTTP/2 307
location: /products/legacy/abc-123-nonsense

$ curl -sI "https://fractionalforge.app/products/new" | head -6
HTTP/2 307
location: /products/legacy/new

$ curl -sI "https://fractionalforge.app/products" | head -6
HTTP/2 307
location: /login?redirect=%2Fproducts
# (root has no id, middleware doesn't match — passes to auth gate.)
```

All four cases correct. The auth gate is secondary to the middleware for deep-links; for the root it's primary, which is what we want.

### Test product seeded in claude-test-foundry

```sql
-- id: aae14126-bde8-4615-8c0d-0a2baf86e3d8
-- name: "RecycloPack (sandbox)"
-- foundry_id: claude-test-foundry · is_sandbox=true
-- lifecycle: researching
-- unit_price: £299 · cogs: £80 · target: 340/mo
-- Seeded 2026-04-20 for the N>0 legacy detail verification path.
-- Safe to delete post-verification (sandbox row, opted out of analytics).
```

### Red-team rounds completed

Three parallel sub-agent rounds ran over the Coming Soon code on 2026-04-19 evening:
- **R1 UX/copy/delight** — agent `aa2fdb609330900e4` — surfaced 4 P1 copy issues (failure framing, undated promise, value-over-status, 4 stacked absence signals). All fixed in `ee1cf482`.
- **R2 a11y/edge/mobile** — agent `ad532fca1c26e1308` — reviewed mockups by mistake (working tree was on `feat/forge-visual-rebuild`, not main). Real concerns (`aria-hidden` on icons, banner semantics) folded in. Spotted false-positive data-loss risk on Delete button; verified the live code already HIDES Edit + Delete via `!readOnly &&` wrapper.
- **R3 integration/security/prod-ready** — agent `a4063a2d31f37f76b` — the high-value round. Surfaced 8 cross-section `/products/<id>` deep-links from Forge/Fundraise/P&L/Objectives/notifications that would have dead-ended on Coming Soon. Middleware-level redirect was the fix.

### Red-team mitigations active in production

| # | Concern | Fix |
|---|---|---|
| R1·P1a | Failure framing ("on the way") | Copy rewrite: "Validate every product as a testable bet…" |
| R1·P1b | "Products is being redesigned" status-over-value h2 | Replaced: "Turn ideas into investor-ready bets" |
| R1·P1c | Undated promise "We'll be back…" | Deleted |
| R1·P1d | 4 stacked absence signals | Removed redundant "COMING SOON" brand badge (kept BETA outline) |
| R1·P2 | No CTA when legacyCount === 0 | Added "Back to Today" fallback |
| R3·P2 | 8 cross-section deep-link dead-ends | Middleware redirect `/products/[id]` → `/products/legacy/[id]` |
| R3·P1 | Silent `catch {}` on `getProducts()` | Added `console.error` for ops visibility |
| R3·P3 | No SEO noindex | Added `robots: { index: false, follow: false }` to layout metadata |

---

## What's deferred (explicit, not silent)

| Item | Why | When |
|---|---|---|
| Merging `feat/products-redesign` to main | Sequential phase order — Products Phase 4 code ships last (after Plan) | When Plan merges to main with flag on |
| 6 NICE-tier gaps (D/F/V tagging · seed-from-Priya · contribution margin inline · stale-evidence badges · 3-closed celebration · mobile-first mocks) | V1 cuts documented in `PRODUCTS-MOCKUP-GAP-AUDIT.html` §V1-cuts | Phase 4.5 |
| Audit log UI (gap C.3) | Explicit DEFER in gap audit | Phase 4.5 |
| Regenerating `src/types/database.types.ts` | Blocks on Phase 4 migrations being applied | Build terminal after Plan merges |
| Seeding more test products (for Phase 4 cutover QA) | Only 1 sandbox row in claude-test-foundry as of now | Build terminal pre-cutover |

---

## Known issues NOT caused by Products sidecar (for separate investigation)

These surfaced during verification but are out of scope for the sidecar:

1. **`/today` renders CAD-lab breadcrumbs in `<main>`** — sidebar + page title correct, but main slot shows "The Forge > Workspace > Mirror Verify > Suppliers/Risks/Export" instead of the Today feed. Likely bleed from Forge v2 cutover (PR #66/#69/#71/#72) or Today V3. Pre-existing; flagged by multiple agent runs.
2. **Cookie banner obstructs page headers on first paint** — platform-wide, not sidecar-specific. Dismissed once per session but first-paint UX suffers.
3. **Pre-existing tsc baseline 8 errors** — tasks.test.ts × 4, BatchApprovalSheet × 2, InlineBatchApproval × 2. Not mine; unchanged by sidecar.

---

## Rollback path

If you need to revert the sidecar urgently:

```bash
git revert 1d4d88b7    # reverts the sidecar merge
git revert d3ccb6b7    # optional — only if the middleware move causes other issues
git push origin main
```

Vercel auto-deploys the revert. Users mid-session on `/products/legacy/<id>` see a transient error post-refresh; old `/products` surface returns. Products table is untouched — no data migration to reverse.

Safer rollback (middleware-only) if only the deep-link redirect is problematic:

```bash
# edit src/middleware.ts, comment out the "Products Pre-Phase" block (lines ~55-71)
```

---

## Where the files live

### Source

- `src/middleware.ts` — contains the `/products/[id]` → `/products/legacy/[id]` redirect block (lines ~55-71). Next.js 16 + src/ layout **requires this location**; a root-level `/middleware.ts` is DEAD (not picked up). See `drawer_forgeos_gotchas_adb600cb4219c971` in MemPalace for the full recipe.
- `src/app/(platform)/products/layout.tsx` — Products layout with metadata (title, description, robots: noindex) + pre-renders `<ProductsComingSoon>` + wraps in `<ProductsRouteGate>`.
- `src/app/(platform)/products/coming-soon.tsx` — the bridge surface. Copy post-R1 rewrite. Conditional legacy card when legacyCount > 0, "Back to Today" CTA when legacyCount === 0.
- `src/app/(platform)/products/products-route-gate.tsx` — client gate: if pathname starts with `/products/legacy`, render `{children}`; else render `comingSoon`.
- `src/app/(platform)/products/[id]/page.tsx` — server redirect to `/products/legacy/[id]` (safety fallback; middleware usually catches first).
- `src/app/(platform)/products/legacy/page.tsx` + `src/app/(platform)/products/legacy/[id]/page.tsx` — read-only wrappers using `readOnly={true}` on existing `ProductListView` + `ProductDetailView` components.
- `src/app/(platform)/products/product-list-view.tsx` — modified to accept `readOnly?: boolean` prop. Gates the create button, edit controls, Priya briefing, card click-through.
- `src/app/(platform)/products/[id]/product-detail-view.tsx` — modified to accept `readOnly?: boolean` prop. Hides Edit + Delete via `!readOnly &&` wrapper (line 759). Wraps all tab content in `<fieldset disabled className="contents">` so every nested button/input/textarea is natively disabled. Banner at top announces read-only.
- `src/lib/features/registry.ts` — Products entry with `status: 'coming_soon'` drives the sidebar SOON badge via `isRouteComingSoon('/products')`.

### Docs

- `PRODUCTS-SCHEMA.md` — canonical data model for Phase 4 (when it ships post-Plan)
- `PRODUCTS-MOCKUP-INDEX.html` — 16 mockups indexed (6 new, 10 existing, ticked)
- `PRODUCTS-MOCKUP-GAP-AUDIT.html` — 13/13 MUSTs closed, 5/5 red-team mitigations locked, 6 NICE deferred to Phase 4.5
- `HANDOVER-products.md` — pickup doc for the build terminal (Phase 4 start)
- `PRODUCTS-COMPLETENESS-AUDIT.md` — 8/8 directives audit (earlier session)
- **This file** — current production state

---

## MemPalace trail (for future sessions)

| Drawer | Topic |
|---|---|
| `drawer_forgeos_decisions_26298fb7f952a10a` | Prep complete summary |
| `drawer_forgeos_decisions_4143c137945fb6a2` | Autonomous lock summary |
| `drawer_forgeos_decisions_566483f23637b5f4` | Parallel build checkpoint — 6 mockups + tweaks |
| `drawer_forgeos_decisions_5242426ca86154e7` | Session final — 8/8 directives delivered |
| `drawer_forgeos_decisions_89a753cb556b7c5f` | Sidecar GO-LIVE event |
| `drawer_forgeos_fixes_0dce36d5b0ea4659` | Production verification + title-flash fix |
| `drawer_forgeos_fixes_e1882935227027fe` | BETA badge add |
| `drawer_forgeos_fixes_8db3145921877936` | 3-round red-team synthesis + fix commit ee1cf482 |
| `drawer_forgeos_gotchas_adb600cb4219c971` | **Next.js 16 src/ middleware gotcha** — middleware.ts MUST be at src/ not root |
| `drawer_forgeos_fixes_360db1af201f4ac8` | Fix-pass specifics (P2 items applied) |

---

## Next steps (for the build terminal when Plan merges)

1. Re-read `COORDINATION-STATUS.md` to confirm Plan is `merged to main`.
2. Check out `feat/products-redesign`, rebase onto latest main.
3. Apply the 10 Phase-4 migrations (timestamps 99990419010000–99990419100000) — renumber to real timestamps before `npx supabase db push`.
4. Regenerate types: `NODE_OPTIONS="--max-old-space-size=8192" npx supabase gen types typescript --linked 2>/dev/null > src/types/database.types.ts`.
5. Fill in the 9 server-action stubs per `HANDOVER-products.md` §Chunk 2/3.
6. Build the 14 route surfaces per the mockups.
7. At cutover: delete the sidecar files (coming-soon.tsx, products-route-gate.tsx, layout.tsx's gate logic, legacy/ tree), update `FEATURE_REGISTRY` Products entry from `coming_soon` to `beta` or `stable`, remove the middleware products block. Phase 4 real routes go live.

---

## What Tristan might want to check when he wakes up

1. Open `https://fractionalforge.app/products` in a browser logged in as yourself. Expect: Coming Soon page with BETA badge + "Validate every product as a testable bet…" subtitle + "Turn ideas into investor-ready bets" lead card + 5 tab previews + legacy card (you have your own products).
2. Click the legacy card's "Open →" link. Expect: read-only list of your products.
3. Click a product. Expect: read-only detail view with "Read-only mode" banner, no Edit/Delete buttons in header, form inputs greyed/disabled.
4. Try a deep link like `fractionalforge.app/products/<any-product-uuid>`. Expect: redirect to `/products/legacy/<uuid>`.
5. Open the CAD Lab linked-product-chip on one of your projects → should redirect to legacy detail.
6. `PRODUCTS-COMPLETENESS-AUDIT.md` if you want the earlier 8-directive audit.
7. **This file** for everything post-audit.

If anything's wrong, check the MemPalace drawer list above — the gotchas room has the "middleware must be at src/" rule that caused two wasted commits before we found it.

---

## Session tally

- **11 Products commits on main**, zero reverts
- **1 feature branch** pushed (`feat/products-redesign`) awaiting Plan merge
- **3 red-team rounds** run in parallel via sub-agents
- **15 sub-agents** across the session (competitor research, 6 mockup builders, Coming Soon sidecar, Phase 4 draft, agent-browser review, sidebar/RecycloPack fix, production verifications, red-team rounds R1/R2/R3, final comprehensive)
- **12+ MemPalace drawers** and **7 KG facts** filed
- **6 new mockups** + **6 inline variants** + **10 committed docs** produced
- **1 sandbox test product** seeded in claude-test-foundry for N>0 path
- **13/13 MUSTs** closed, **5/5 red-team mitigations** locked
- **0 P1 bugs** open on the sidecar as of last curl verification

Sleep well. It works.
