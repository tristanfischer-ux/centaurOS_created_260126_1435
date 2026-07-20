# Cursor → Terminal — DB grow-loop + function→form audits (2026-07-20)

**Authority:** Tristan asked Cursor to (1) ensure you see firmware Fix 9, (2) audit whether DBs grow via miss→web→writeback→use with timestamps, (3) audit function-dictates-form / covariant envelope, (4) give specific code recommendations, (5) keep a request tracker.

**Related packs you already have:**
- PCB + firmware: [`CURSOR-PCB-HONESTY-FIXES-FOR-TERMINAL-2026-07-20.md`](./CURSOR-PCB-HONESTY-FIXES-FOR-TERMINAL-2026-07-20.md) — **Fix 9 is firmware wire**
- Scoring: [`MACRO-ENGINE-SELF-AUDIT-PLAN-2026-07-20.md`](./MACRO-ENGINE-SELF-AUDIT-PLAN-2026-07-20.md)
- Form background: [`YURI-FUNCTIONAL-FORM-COEVOLUTION-FINDINGS-2026-07-18.md`](./YURI-FUNCTIONAL-FORM-COEVOLUTION-FINDINGS-2026-07-18.md)

**Tracker lives in** [`CURSOR-HARNESS-INBOX.md`](./CURSOR-HARNESS-INBOX.md) (table T1–T7).

---

# Part A — Growing database loop

## Intended loop (Tristan)

```
need X → query right table → HIT: use from DB
                         → MISS: internet search (ingest/web systems)
                         → writeback to DB
                         → re-read from DB into the model
→ DBs get bigger over time; each table shows last-updated
```

## Reality (SIGHT 2026-07-20)

| Store | Path / table | Rows | Last activity | Loop status |
|---|---|---:|---|---|
| forge-truth | `~/.forge-truth/forge-truth.db` (3.6 GB, mtime **2026-07-20 06:00**) | — | cascade writes today | primary |
| Parts | `pretraining_extracted_parts` | 37k | discovered_at max 2026-07-19; **35k null timestamps** | **partial** |
| Specs | `pretraining_extracted_specs` | 15k | **no row timestamps**; keyed DB-first almost blind | **broken keyed path** |
| Spec docs | `pretraining_spec_documents` | 1.3k | extracted_at 2026-07-18 | works |
| Standards | `pretraining_extracted_standards` | 4.2k | via parent doc | partial (advisory consume) |
| Products | `pretraining_products` | 611 | 2026-07-17 + embeddings | **works** |
| Cascade | `distributor_cascade_cache` | 3.6k | fetched_at **2026-07-20** | **works** (ingest-only write) |
| Companies | `companies` + `supplier_embeddings` | ~29k | updated_at 2026-07-19 | **works** |
| Materials | `material_prices` | 15 | **2026-05-30 seed only** | **stale / offline** |
| Class graphs | `class_reference_graphs` + nodes/edges | 47 graphs | 2026-07-19 | partial (no web-on-miss) |
| Investor / corpus | `~/.forge-capital/*`, nightshift `corpus.db` | — | separate products | not chain growing-DB |

**No operator “last updated” surface** (no Excel/dashboard/meta table of per-table MAX(ts)).

### Smoking gun — specs keyed miss

`specs-writeback.ts` keyed lookup filters:

```sql
WHERE d.source_type IN ('datasheet','manufacturer','distributor_cascade','web_extracted')
```

Live corpus is almost all `manufacturer_datasheet` (~15,027 specs) → **keyed visibility ≈ 2 rows**. Hybrid lookup (no filter) can still find them; DB-first step-1 is Goodharted empty. Writeback writes `datasheet` / `web_extracted`, not `manufacturer_datasheet` — two naming worlds.

### What works vs Tristan’s loop

| Leg | Works? | Notes |
|---|---|---|
| Chain reads DB (not live Mouser) | **Yes** | CHAIN-AS-DB-CONSUMER |
| Hit → use | **Yes** for suppliers, cascade, products, hybrid specs | |
| Miss → web → writeback → re-read | **Yes** for lock-gate specs/standards/products when web not skipped | In-chain writeback |
| Miss → distributor → cascade | **Offline only** | Ingest jobs; weekly sweep **not** on launchd |
| Materials miss → live price | **No** | `fetchLivePriceGbpPerKg` stub returns null |
| Always updating | **Uneven** | Cascade/companies fresh; materials May; specs timestamps missing |
| Timestamps visible | **No** | Patchy columns; no UI |

Kill switches that thin the loop: `SKIP_SPECS_WEB_SEARCH`, `SKIP_LIBRARY_WRITEBACK` (**also kills cascade reads** — surprise), `CHAIN_SKIP_BACKGROUND_ENRICHMENT`, `CHAIN_BLANK_MPN_GENERATE` off (default).

---

## Part A — SOURCE fixes (specific)

### A1. P0 — Align specs `source_type` (keyed DB-first)

**File:** `src/lib/pdf-engine-v2/lib/knowledge/specs-writeback.ts` (~129–140)

```typescript
// ACCEPT BOTH corpus names and writeback names
WHERE d.source_type IN (
  'datasheet', 'manufacturer_datasheet', 'manufacturer',
  'distributor_cascade', 'web_extracted', 'stage0_harvest'
)
```

Also normalize on write in `spec-documents-writeback.ts` so new rows use one canonical name (`manufacturer_datasheet` **or** map legacy → canonical on insert).

**proveCatch:** keyed `lookupSpec` against a live `manufacturer_datasheet` Megapack/voltage fixture → HIT (not miss→web). Guard: keyed hit count ≫ 2 on selftest DB slice.

### A2. P0 — Fix price-ingest Node ABI

**Symptom:** launchd price-ingest crashes (`better-sqlite3` NODE ABI mismatch); ~116 queue stuck.

**Fix:** pin launchd to Node 22; rebuild native module under that Node; document in `scripts/ingest/README.md`.

```bash
# verify
node -v   # 22.x
cd <repo> && npm rebuild better-sqlite3
launchctl kickstart -k gui/$UID/com.forge.price-ingest  # or equivalent label
```

### A3. P1 — Weekly component sweep on a schedule

Docs claim Sunday 02:00; **no LaunchAgent** found. Add `com.forge.weekly-component-sweep` → `scripts/ingest/run-weekly-component-sweep.sh`. This is the real miss→distributor→`distributor_cascade_cache` / parts leg under CHAIN-AS-DB-CONSUMER.

### A4. P1 — Timestamp columns + operator freshness surface

1. Migration / alter: `created_at`, `updated_at` on `pretraining_extracted_specs` and `pretraining_extracted_standards` (backfill from parent `pretraining_spec_documents.extracted_at`).
2. Backfill `pretraining_extracted_parts.discovered_at` where null (use doc date or `datetime('now')` once with provenance note).
3. Emit **`state.growingDb`** after lock gate / end of chain:

```json
{
  "db_path": "~/.forge-truth/forge-truth.db",
  "db_mtime": "ISO",
  "tables": {
    "pretraining_extracted_parts": { "n": 37491, "max_ts": "...", "ts_column": "discovered_at" },
    "distributor_cascade_cache": { "n": 3615, "max_ts": "...", "hits": 1327, "expired": 635 },
    "material_prices": { "n": 15, "max_ts": "2026-05-30", "stale": true }
  }
}
```

4. Excel **Quality & Audit** or **Audit data** row: “Growing DB last activity” + per-table max age; flag materials >28d stale.

**Files:** new helper `scripts/lib/growing-db-freshness.ts` (or `.py`); call from `serial-design-chain-v2.tsx` near `0.6-db-row-counts.json` write; `build-excel-export.py` mirror.

### A5. P2 — Materials live refresh

**File:** `scripts/ingest/refresh-material-prices.ts` — implement `fetchLivePriceGbpPerKg` (currently returns `null`). Schedule every 28 days. Until then materials loop is seed-only (May 2026).

### A6. P2 — Don’t dual-purpose `SKIP_LIBRARY_WRITEBACK` as read kill

**File:** `src/lib/pdf-engine-v2/lib/distributors/db-only-cascade.ts` (~85)

Split env:
- `SKIP_LIBRARY_WRITEBACK=1` → no writes only  
- `SKIP_DISTRIBUTOR_DB_READ=1` → no reads (explicit)

Current behaviour surprises dry-runs into all-`unknown`.

### A7. P3 — Class-graph web-on-miss

**File:** `class-reference-graph-db.ts` (~747) — miss falls to baked TS. Add web discovery + writeback (same pattern as specs) for unseen archetypes.

### A8. Prove the loop end-to-end (one harness)

New selftest / script `scripts/ingest/prove-growing-db-loop.ts`:

1. Delete or ignore a canary key in cascade/specs (test DB or transactional).  
2. Force miss → web (or fixture web) → writeback.  
3. Assert re-read HIT + `updated_at` advanced.  

Wire into `verify-engine-guards.sh` or weekly CI — GATE INTENT for the grow loop.

---

# Part B — Function dictates form / covariant envelope

## Intended (Tristan)

Parts with real sizes and axes should dictate envelope and exterior shape over time. Long thin internals → long thin product — not long thin guts in a big round / cuboid box. Gold = training check that the *reasons* converge, not a mesh paste.

## Reality

| Mechanism | What it does | Packs real part AABBs into exterior? |
|---|---|---|
| `minimum_working_envelope_from_state` | Role flags (optical/UI from BoM *names*) + path length + HIG floors | **No** — role grammar only |
| `resolve_design_envelope_mm` | Contract pin → min working → brief → clamps | **No** packing |
| `instrument_form_rule_mm` / beauty grammar | Places cube/HMI on a **given** envelope | Features on box, not box from parts |
| `functional_form.py` (`derive` / `compose_geometry_plan`) | **Built**; places role volumes as **fractions of handed-in envelope** | Envelope is **input**, not output |
| Blender `COMPOSER=1` | Opt-in `_place_composed_form` | Same — needs external envelope |
| `FORM_FAMILIES` / `lab_electronics` | Style selector + bolt-ons (`_LE_SIGNATURE`) | Shared shell; vial/EWOD/leads bolted on |
| Plant `_shelf_pack` | Packs equipment into ISO/container | **Yes** — but plant-scale only |
| `form_signature_gate` R1–R5 | Identity / wrong-physics / foreign interface | Morphology presence, **not packing** |
| Yuri HARD gates A–H (role coverage, relation, openness, non-box) | Documented | **Mostly not implemented** |

**Yuri plan status:** solver exists; **contract emit of `functional_form/v1` pending**; composer opt-in; packing-driven envelope **not** landed. Doc header still says “proposed, not applied” — half-true.

**Organoid-2150 / Lego-in-a-box:** still possible. Nothing fails “long thin principals inside a near-cube shell.”

---

## Part B — SOURCE fixes (specific)

### B1. P0 — Envelope from principal part packing (universal)

**New (or extend):** `scripts/lib/minimum_working_envelope.py` → `pack_principals_envelope_mm(state) -> (W,D,H, basis)`

Algorithm sketch:
1. Collect principal parts with `resolved_dims_mm` / role volumes (optics axis, PCB, vial, heater block, pump, battery, display).  
2. Orient along `primary_working_axis` from `functional_form` / contract (optical / thermal / linear_displacement / …).  
3. Pack with clearances + HIG floors (display ≥28×18, buttons ≥7 mm).  
4. Envelope = AABB of pack; then apply brief ceiling / handheld ≤155 mm clamp (existing).  
5. Prefer this over mass→air / default landscape unless brief pins hard dims.

**Wire:** `resolve_design_envelope_mm` precedence insert **before** mass-air / after non-derived contract pin.

**proveCatch:**
- Three collinear 80×12×12 mm principals → long edge ≥ ~3×80 + margins.  
- Same parts forced into a 100³ envelope → `AXIS_ASPECT_MISMATCH` / `DOES_NOT_FIT` HARD.

### B2. P0 — `compose_geometry_plan` must not require envelope as destiny

**File:** `scripts/lib/functional_form.py`

Add `derive_envelope_mm(contract) -> envelope` from selected arrangement AABB; `compose_geometry_plan` uses that (brief ceiling after). Stop “fill the box with W*0.72 PCB.”

**Wire Blender:** default-on for `isInstrumentDevice` / device-scale (or `COMPOSER=1` default true for those classes) in `build_universal_scene.py` `_sealed_enclosure_env_mm`.

### B3. P0 — Emit `functional_form/v1` from contract

**File:** `scripts/lib/engineering-contract.ts` (class-agnostic builder path)

Emit medium / primary_axis / roles / repeated_count from quantities (`optical_path_length_mm`, `working_volume_ml`, `channel_count`, `electrode_count`, …) — never brand names.

**proveCatch:** fixture with only those signals → correct medium; empty → no silent optical box.

### B4. P1 — Split `lab_electronics` family

**File:** `scripts/lib/instrument_form_grammar.py` `FORM_FAMILIES`

Split → `teaching_vial_bioreactor` / `electrochemical_potentiostat` / `ewod_cartridge_controller` (function keys, not Pioreactor/Rodeostat/OpenDrop product names) each with `envelope_fn`, placer, checklist, glance.

**proveCatch:** registry completeness; shared `u_se_le_*` skeleton alone fails R1 GENERIC_SKELETON.

### B5. P1 — Phenotype HARD gate (Yuri B+C+D)

**New:** `scripts/lib/form_phenotype_gate.py`

Read delivered `form-meshes.json` + transforms / `form-proof.json`:
- HARD roles present  
- Relations within tol (axis alignment)  
- Openness silhouette  
- Cuboid-dominance / non-box authenticity  
- **Aspect: principal AABB aspect vs exterior aspect** (long thin guts ⇒ exterior long edge ratio within band)

**proveCatch:** organoid-2150-shaped cuboid internals in cube shell → FAIL; frozen good colorimeter / syringe → PASS.

Wire into Excel Renders / ship card (same binding philosophy as Pillar 1).

### B6. P1 — Placers use absolute role mm, not shell fractions

**File:** `build_universal_scene.py` `_place_lab_electronics_interior_layout` and composer placements — place TMP/PCB/vial at absolute sizes from contract/BoM; if they don’t fit → grow envelope or HARD fail (don’t scale guts to fit a wrong box).

### B7. P2 — Vision adversarial for Lego-in-a-box

Already in scoring advice; pair with B5 so vision + phenotype both refuse 2150-style heroes.

---

# Sequencing recommendation for Terminal

```
Now (scoring Pillars 2–3)     — oem ceiling, Brief/OOS, ship card
Parallel (PCB Fixes 1–6)      — FAB honesty, USB/LED, fitness wire
Then PCB Fix 9                — firmware Tier-0 (needs fitness first)
Parallel P0 DB                — A1 source_type + A2 price-ingest ABI
Parallel P0 form              — B1 pack envelope + B3 contract emit
Then A3–A4                    — weekly sweep + growingDb freshness UI
Then B2/B4/B5                 — composer default + family split + phenotype gate
Fresh bake                    — only after refuse-on-2150 scoring + PCB honesty land
```

---

# Acceptance snippets

**DB:** keyed specs hit count on corpus ≫ 2; `state.growingDb.material_prices.stale` true until refresh; weekly sweep LaunchAgent exists; prove-growing-db-loop selftest green.

**Form:** proveCatch long-thin principals → long envelope; phenotype gate fails 2150 blockout; `functional_form/v1` on contract for device-scale runs; composer not opt-in-only for instruments.

---

# Request tracker (mirror)

| ID | Ask | Cursor deliverable |
|---|---|---|
| T1 | SIGHT 2150 | Done |
| T2 | Scoring bind | Advice + your Pillar 1 |
| T3 | PCB honesty 1–8 | This series / PCB doc |
| T4 | Firmware wire | PCB doc Fix 9 |
| T5 | DB grow-loop audit | **This doc Part A** |
| T6 | Function→form audit | **This doc Part B** |
| T7 | Keep tracking | Inbox table |

Reply in inbox under **Terminal reply** when you accept/adapt; set Status `IN_PROGRESS` or `WAITING_ON_CURSOR` if you need a follow-up diff review.
