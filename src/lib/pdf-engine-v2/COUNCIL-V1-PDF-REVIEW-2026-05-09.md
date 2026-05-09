# 3-LLM Multimodal Council Review — v1 Two-Tier BOM PDF

**Date:** 2026-05-09  
**PDF:** `output-1778343800036.pdf` (110.9 KB, 32 pages)  
**Brief:** Containerised 3.5 MWh Battery Energy Storage System (BESS)  
**Commit under review:** `09ed35ab` (two-tier BOM architecture)  
**Council scope:** Pages 7–17 (Bill of Materials section) + cover page  
**Conducted by:** ForgeOS automated multimodal council  

---

## Council Composition

| Seat | Model | Lineage | Call status |
|---|---|---|---|
| 1 | `x-ai/grok-4.3` | xAI | ✓ Multimodal (12 pages) |
| 2 | `google/gemini-3.1-pro-preview` | Google | ✓ Multimodal (12 pages) |
| 3 | `anthropic/claude-opus-4.7` | Anthropic | ✓ Multimodal (12 pages) |

All three seats received: cover page (p1) + all BOM section pages (p7–p17) as base64 PNG images in a single multimodal prompt. No text-only fallbacks used.

---

## Per-Question Synthesis

### Q1 — Visual Credibility: Does the verified-vs-estimated distinction read clearly?

**Verdict: YES with one specific flaw**

All three models agreed the green VERIFIED / amber ~ ESTIMATE colour distinction is effective and reads immediately at a glance. The dual encoding (colour + tilde prefix + badge label) was praised for surviving B&W printing (Opus). The leftmost placement of the status badge was noted as correct UX (Opus).

**Unanimous flaw — VERIFIED rows with no MPN (em-dash):** Gemini flagged this as a credibility killer: "You cannot have a 'Verified' API part without a manufacturer part number." Opus confirmed several VERIFIED rows carry `—` in the MPN column rather than a real part number, combined with £0 prices. Grok noted this as a "minor visual weakness" but still flagged the £0 price issue.

**Additional layout flaw (Opus):** Page 10 is a near-empty page with only a module total footer floating in whitespace — looks like a pagination/layout bug.

---

### Q2 — Engineering Credibility: Would a procurement team act on this?

**Verdict: NO — the economics are wrong by an order of magnitude**

The module taxonomy was unanimously praised. All three models confirmed the subsystem decomposition (ISO Container → Battery Racks → DC Distribution/MBMS → PCS/AC → auxiliaries) is correct for a containerised BESS and the lead-time estimates (20–24 weeks for racks and PCS) are realistic.

**The cell quantity/price is the dominant failure:**
- Opus: Battery Rack Assemblies BOM shows **1× cell at £0**. A 3.5 MWh BESS requires approximately 6,000 LFP prismatic cells at ~£45 each = ~£270,000. The cover-page economics show £100,731 unit cost for 3.5 MWh = £29/kWh. Real containerised BESS is £150–250/kWh installed. The BOM is off by roughly an order of magnitude on its core energy component.
- Gemini: "Qty is listed as '1', when the text above it correctly notes the system needs ~4,000 cells."

**LF280K MPN is wrong:**
- Opus: `PWC0805LF280KF` is listed — this is an 0805 SMD passive component package code, not a CATL prismatic cell part number. Real CATL 280Ah cells use `LF280K` / `LF280Ka`.
- Gemini confirmed: "that's a 0805 SMD passive package code, not a 20kg lithium iron phosphate battery cell."
- Grok was more lenient (scored it as "plausible common CATL/EVE form factor") — this is the only significant seat disagreement.

**DC contactor price wrong by ~50×:**
- Opus: DC contactor listed at £41 for a 1500A/800V device. Real Gigavac GX/HX or Schaltbau C310 is £1,500–£3,000.

**Missing systems flagged by Opus:**
- HVAC/liquid chiller: £0 for "Liquid Cooling Loop" on a 1 MW PCS + 3.5 MWh system; a real chiller is £15–30k.
- No fire suppression agent (Stat-X/NOVEC/aerosol), no gas detection (H2/CO/VOC), no aspirating smoke detection — all NFPA 855/UL 9540A requirements cited in the prose.
- Mass roll-up inconsistency: 16,500 kg racks + 4,500 kg PCS + 4,500 kg container ≈ 25.5 tonnes, exceeds a 40ft HC payload.

**MasterPact MTZ:** All models agreed this is a plausible real ACB for the application but it is underspecified — a real spec would include frame+trip+breaking-capacity code (e.g. `MTZ2 16 H1 Micrologic 6.0 X`).

**Scalance switch (6GK50050BA001AB2 at £93):** Grok and Gemini confirmed this is a real, valid Siemens industrial Ethernet switch MPN at a plausible price. Unanimously the best-quality VERIFIED row in the report.

---

### Q3 — Score (1–10)

| Seat | Score | Key reasoning |
|---|---|---|
| Grok 4.3 | **8/10** | Credible structure, actionable two-tier distinction; gaps in lead-time/MOQ/roll-up |
| Gemini 3.1 Pro | **4/10** | Beautiful formatting but BOM line items are "unusable" — MPN issues, zero prices, wrong quantities |
| Claude Opus 4.7 | **6/10** | Strong structure and presentation "undermined by numbers that don't survive a procurement-engineer's first pass" |

**Consensus mean: 6.0 / 10**  
**Range: 4–8**

The 4-point spread is the largest disagreement in this council. Grok appears to have inspected the MPN `PWC0805LF280KF` less critically than Gemini and Opus. Given that Gemini and Opus both independently identified the MPN as a passive component code (not a CATL cell), and that the cell quantity/pricing error is objectively present in the BOM, the Grok score is likely too generous. Confidence-adjusted mean: approximately **5.5/10**.

---

### Q4 — Highest-Leverage Next Change

| Seat | Recommendation |
|---|---|
| Grok 4.3 | Add "Availability / Lead Time" column for all rows |
| Gemini 3.1 Pro | Add strict validation: if Qty=1 for bulk item, OR Price=£0, OR MPN blank → force "~ ESTIMATE" or flag "DATA ERROR" badge |
| Claude Opus 4.7 | Fix battery cell quantity from 1 to ~6,000 and propagate cost to cover-page economics |

Gemini and Opus are addressing the same underlying issue from different angles: the VERIFIED badge is being granted to placeholder data. Opus targets the most visible instance (cell quantity/price). Gemini targets the validation logic that would prevent all such instances.

---

## Top 3 Changes Ranked by Council Consensus

1. **Fix cell quantity and price** (Opus Q4, Gemini Q3, all seats flagging): Change `280Ah LFP Prismatic Cell` from `Qty 1 / £0` to approximately `Qty 6,000 / Unit £45 / Total £270,000`. This single fix: repairs the most obvious engineering error, brings cover-page £/kWh into a defensible range, and demonstrates the cost roll-up machinery works end-to-end. **Impact: critical** — a procurement engineer stops reading at "£0 cells".

2. **Fix the LF280K MPN** (Gemini + Opus, confirmed independently): Replace `PWC0805LF280KF` with `LF280K` or `LF280Ka` (CATL's real part reference for the 280Ah prismatic). The current MPN is an 0805 passive component package code and will fail any distributor lookup. **Impact: high** — destroys VERIFIED badge credibility for the highest-value line item.

3. **Enforce VERIFIED badge validation rules** (Gemini Q4): A VERIFIED row must have: non-blank MPN, non-zero unit price (or explicit £0-justification), and realistic quantity. Any row failing these checks must demote to `~ ESTIMATE` or show a `DATA ERROR` badge. Right now, 5+ VERIFIED rows violate at least one of these conditions. **Impact: high** — the value proposition of the two-tier BOM collapses if the green badge doesn't reliably mean "real API data".

---

## Disagreements Worth Flagging

**LF280K MPN validity:** Grok rated the cell MPN as "plausible" and scored 8/10 overall. Gemini and Opus both identified `PWC0805LF280KF` as a passive component part code, not a CATL cell MPN. Given that Gemini and Opus provide independent corroboration on a verifiable factual claim (what a CATL cell MPN looks like), their assessment is more reliable here. Grok's 8/10 should be treated as an outlier.

**Scope of the problem:** Grok focused on gaps that are additive (lead-time column, MOQ). Gemini and Opus focused on data that is actively wrong (wrong MPN, wrong quantity, wrong price). The distinction matters for prioritisation: wrong data must be fixed before missing data is added.

---

## Surprising Council Finding

**The Scalance switch is the best-quality row in the BOM** — unanimously confirmed across seats. MPN `6GK50050BA001AB2` is a real, valid Siemens part at a plausible £93. This is exactly what the VERIFIED tier should look like across the board. The irony noted by Gemini: "This is what the whole BOM should look like."

The second surprise (Opus): **The mass roll-up doesn't work** — the declared module masses sum to approximately 25.5 tonnes, which exceeds the stated 40ft HC container payload of 27,230 kg available payload mass. It's within tolerance but worth flagging before a customer runs the numbers themselves.

---

## Verdict

**REVISIONS NEEDED**

The two-tier BOM architecture is structurally sound and the visual language is effective. The Scalance switch demonstrates what the system can produce when it works correctly. However, the highest-value line item (the CATL battery cell) has a wrong MPN, wrong quantity (1 instead of ~6,000), and wrong price (£0 instead of ~£270,000). These are not cosmetic issues — they make the cover-page unit economics indefensible (£29/kWh vs. real-world £150–250/kWh) and will immediately disqualify the report in front of any engineer or procurement team.

The path to SHIP-READY requires fixing items 1 and 2 from the ranked list above. Item 3 (validation logic) is the structural fix that prevents regression.

---

## Cost

| Seat | Input tokens | Output tokens | Cost (USD) |
|---|---|---|---|
| Grok 4.3 | 17,683 | 1,151 | $0.0248 |
| Gemini 3.1 Pro | 13,504 | 2,980 | $0.0628 |
| Claude Opus 4.7 | 23,380 | 2,241 | $0.1729 |
| **Total** | **54,567** | **6,372** | **$0.2605** |

Approximate GBP at 0.79 rate: **~£0.21** for the full 3-seat multimodal council.
