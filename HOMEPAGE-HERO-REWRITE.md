# Homepage hero rewrite — intelligence-embedded hardware thesis

**Date:** 2026-04-25
**Files touched:**
- `src/app/page.tsx` (hero block, How-It-Works pillars, JSON-LD descriptions)
- `src/app/layout.tsx` (title, meta description, Open Graph, Twitter card)

**Files explicitly NOT touched** (per brief):
- "From Tristan" letter section (unchanged)
- Image alts, src URLs, layout markup, animations, analytics hooks
- Investor-intelligence section / 8.3K+ INVESTORS stats
- Forms / signup CTAs / pricing tier text / FAQ copy
- Tristan intro section (the "26 years" line below the hero)

---

## Hero block

### Eyebrow pill
- **Before:** `For Hardware Startup Founders` (37 chars)
- **After:** `Built for the intelligence-embedded hardware wave` (50 chars)

Time-bound; signals the macro shift in the first three words a visitor reads.

### Headline (h1)
- **Before:** `Everything a hardware startup needs, in one platform.` (54 chars)
- **After:** `Make every product smart.` (25 chars)

Shorter, more declarative, Tristan-voice (he uses imperative openers in his LinkedIn posts). The full thesis is unpacked in the sub-headline.

### Sub-headline
- **Before:** `Design your product. Find your investors. Connect with your manufacturers. Supported by 13 specialist AI agents and a marketplace of experienced fractional executives — ForgeOS is the operating system for building hardware businesses.` (240 chars)
- **After:** `Cheap intelligence is making every commodity hardware product re-imaginable — air-quality monitors, kettles, drills, dialysis devices. ForgeOS helps hardware founders ship the smart version: find the spec, the suppliers, and the investors who fund it. From a paragraph to a bill of materials to a manufacturer shortlist in twenty minutes.` (340 chars)

Three jobs:
1. State the macro thesis verbatim from the locked frame.
2. Anchor it with four specific product examples founders can picture.
3. Land a concrete founder-pain promise (paragraph → bill of materials → shortlist in twenty minutes).

"Bill of materials" written in full per the no-acronyms rule. "Twenty minutes" written in full to match Tristan's prose style in the founder letter.

### Primary CTA
- **Unchanged:** `Start Free`

### Secondary CTA
- **Before:** `See How It Works` → linked to `#how-it-works`
- **After:** `Read the Story` → linked to `#why-i-built` (the existing letter section)

Routes the curious visitor straight to Tristan's voice rather than to an explainer slab — the letter is the strongest asset on the page and was being skipped.

---

## How-It-Works section

### Section sub-header copy
- **Before:** `Hardware founders end up reinventing the same wheels — finding engineers, finding manufacturers, finding investors, sorting out IP. Fractional Forge brings it all together.`
- **After:** `Cheap intelligence is making every commodity hardware product re-imaginable. Fractional Forge pulls the design, supply, and capital cycle for the smart version into one place — so you stop reinventing wheels.`

Threads the thesis through the section header without losing the "stop reinventing wheels" line that lives in Tristan's letter.

### Pillar 1 — NEW (added at the top of the list)

```
Label:    The Smart-Product Wave
Title:    Designed for what hardware is becoming.
Body:     Most hardware categories are about to be re-imagined for
          intelligence — air-quality monitors, kettles, drills,
          dialysis devices. ForgeOS coordinates the design, supply,
          and capital cycle for the smart version of whatever you
          are building, so you skip the eighteen months of
          reinventing wheels.
Image:    /images/marketing/ecosystem-os.png (reused; copy-only update)
```

This is the new card the brief asked for. Sits first because it's the differentiator the rest of the page now has to support.

### Pillar 2 — Fractional Expertise — UNCHANGED

### Pillar 3 — Specialists (was: Specialist AI Agents)
- Label: `Specialist AI Agents` → `Specialists`
- Title: `13 Specialist AI Agents. Your Judgement.` → `13 Specialists. Your Judgement.`
- Body: `13 specialist AI agents support every decision...` → `13 specialists support every decision...`
- Highlights unchanged.

Removes the AI-agent emphasis on the marketing site to align with the in-product voice (Maya's complaint in `RED-TEAM-FOUNDER-EXPERIENCE.html`).

### Pillar 4 — Manufacturing Network (enhanced)
- Body: kept; added closing clause `— including suppliers experienced in sensor and edge-compute integration for smart products.`
- Highlight 2: `Prototype-ready: identify the materials, equipment, and suppliers for your design` → `Find suppliers experienced in sensor, electronics, and edge-compute integration`

The smart-product wave isn't just a separate pillar — it now reaches into the supplier search promise too.

### Pillar 5 — Team Coordination
- Body unchanged.
- Highlight 2: `Assign work to teammates or directly to the 13 specialist AI agents` → `Assign work to teammates or directly to the 13 specialists`

Same de-emphasis pass.

---

## Metadata / SEO

### `src/app/layout.tsx`

| Field | Before | After |
|---|---|---|
| `metadata.title.default` | `ForgeOS — The Operating System for Hardware Startups` | `ForgeOS — Ship the smart version of every hardware product` |
| `metadata.description` | `Expert knowledge, smart tools, investor intelligence, and manufacturing connections — everything a hardware startup needs, in one platform. Free to start.` | `Cheap intelligence is making every commodity hardware product re-imaginable. ForgeOS helps founders ship the smart version — find the spec, the suppliers, and the investors who fund it. Free to start.` |
| `openGraph.title` | same as above | same as above |
| `openGraph.description` | same | same |
| `twitter.title` | same | same |
| `twitter.description` | same | same |

### `src/app/page.tsx` — JSON-LD structured data

Updated `description` strings on `Organization` and `SoftwareApplication` JSON-LD blocks to match the new framing.

---

## Voice notes — what was preserved vs replaced

### Preserved (Tristan's real voice)
- Tristan letter (`why-i-built` section) — entirely unchanged
- "26 years" intro line — unchanged
- "reinventing the same wheels" — kept as a phrase Tristan owns
- British spelling throughout (`re-imaginable`, no Americanisms)
- First-person, declarative, no marketing-superlatives ("revolutionary", "world-class", "cutting-edge")
- Specific numbers preserved: 13 specialists, 13,700+ manufacturers, 8,300+ investors, eighteen months, twenty minutes
- Numbers under 100 written out in prose ("twenty minutes", "eighteen months") to match Tristan's letter cadence

### Replaced (corporate / category-soft language)
- `Operating System for Hardware Startups` (positions ForgeOS as a category alongside generic SaaS) → time-bound macro thesis
- `Everything a hardware startup needs, in one platform` (everything-for-everyone) → `Make every product smart` (one specific shift)
- `Specialist AI Agents` × 4 occurrences → `Specialists` (alignment with in-product voice; stops the dissonance Maya called out)
- `Expert knowledge, smart tools, investor intelligence, and manufacturing connections` (feature pile) → `find the spec, the suppliers, and the investors who fund it` (verbs + concrete nouns)
- `See How It Works` (generic SaaS button) → `Read the Story` (routes to a human voice asset)

### Acronyms

Per CLAUDE.md no-acronyms rule:
- `BOM` (which existed only in the brief's prompt, not in the live copy) is rendered as `bill of materials` in the new sub-headline
- `IP` already appears in the FAQ block (untouched per brief; that's Tristan's existing copy)
- `AWS` and `UK` survive (proper nouns / country codes within the CLAUDE.md exception list)

---

## Verification

- `NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit` — no new errors in `src/app/page.tsx` or `src/app/layout.tsx`. Pre-existing errors elsewhere (billing types, BatchApprovalSheet) are unrelated to this change.
- `npx jest --testPathPatterns="src/app/page"` — no homepage tests exist (no regressions possible).
- No layout, image, animation, or data-attribute changes — diff is entirely string literals plus one new pillar in the `HOW_IT_WORKS_PILLARS` array.

---

## Open questions for the main thread

1. **Image for the new pillar.** "The Smart-Product Wave" reuses `/images/marketing/ecosystem-os.png` (which was previously on Team Coordination). Team Coordination kept the same path, so the same image now appears twice in the pillar list. Worth swapping one of them — the current image library doesn't have anything obviously labelled "smart products" or "intelligence-embedded". Quick options: commission a new image, swap Team Coordination to a different existing asset, or swap the new card to `factory-partner.png` and leave Manufacturing on a different asset. Flagging rather than picking — image curation is a judgement call.
2. **Pricing card copy.** `PRICING_TIERS` still has `50 AI assists, all 13 specialist AI agents` and the FAQ still says `13 specialist AI agents`. The brief said don't touch pricing/FAQ, so left alone. If the in-product alignment is meant to be total, those need a follow-up pass.
3. **`/case-study`, `/about`, `/preview-landing`, `/sample-package`** — also marketing-surface pages with the old framing. Out of scope for this rewrite per the brief's "homepage hero" framing, but they will read inconsistently now. Flagging for a follow-up.
