# Mockup-as-code pattern — playbook from forge-capital-app

Handoff from the other terminal (working on `forge-capital-app`,
`~/Developer/forge-capital-app/`). You're working on Money / Product /
Plan sections and running into the same drift problem we did: HTML
mockups exist, team uses them like screenshots, production drifts.

This doc tells you exactly what we did to fix it and a checklist for
tightening up the Forge section you've already shipped.

## The failure mode to avoid

Over on forge-capital-app we built 4 rounds of a V4 HTML mockup, got
sign-off, then the port drifted badly. Tristan looked at the production
URL and said: *"This doesn't look anything like the app which we were
looking at in terms of the mock-ups."*

Root cause, six layers deep:

1. We distilled the mockup into a `V4-FEATURE-DECISIONS.md` doc (data
   model, behaviour, flags) that became the spec. Visual gestalt lost
   in the translation.
2. We never RENDERED the mockup HTML in a browser — grepped line ranges
   instead. You can't port gestalt from a line range.
3. We wrote Tailwind classes that APPROXIMATED what we remembered
   looking at in the mockup.
4. Sub-agent briefs said "mockup-faithful" as a wish, not a gate.
5. We accepted "build passes + SQL works" as "done", without a visual
   parity check.
6. We reported progress that sounded complete while the UI was a
   skeleton.

Tristan's sharpest observation nailed it: *"Surely the HTML would be
the easiest thing for you to follow because it's literally written in
the language of code."*

## The fix

Treat HTML mockups as **executable specifications**, not artwork.

### Step 1 — extract the mockup's `<style>` block verbatim into the app

For V4 (forge-capital-app), one command:

```
sed -n '49,714p' audit-20260421/Phase2-Mockup-V4.html > app/v4-mockup.css
```

Then import at the top of `app/globals.css` BEFORE Tailwind:

```css
/* CSS @import must precede all other rules. V4's class names + tokens
   load first, then Tailwind's base layer. */
@import "./v4-mockup.css";

@tailwind base;
@tailwind components;
@tailwind utilities;
```

Commit result: 668 lines of CSS, 40+ class names, all tokens. Every
`.topbar`, `.hero`, `.arch-card`, `.result-card`, `.match-score`,
`.bpm-row`, `.wk-stat`, `.walk-callout` that V4 uses is now live in
production.

### Step 2 — the React port workflow becomes trivial

Old way (what burned us):
```
read mockup → derive Tailwind classes from memory → verify with screenshot → iterate
```

New way:
```
read mockup DOM → copy class names + structure verbatim into JSX → replace dummy data with Supabase queries → done
```

Visual match is **by construction**. The screenshot becomes a bug-check
only, not a specification round. Order of magnitude faster per section.

### Step 3 — write the rule into CLAUDE.md so it sticks

- Global `~/.claude/CLAUDE.md` under "Mockup-faithful build":
  > "When the mockup is HTML, the HTML IS the code reference — not just
  > a visual. Copy class names and DOM structure directly. Extract the
  > mockup's inline `<style>` block into the app's stylesheet so visual
  > defaults match by construction."

- Repo-level `CLAUDE.md` (e.g. `forge-capital-app/CLAUDE.md`):
  concrete section listing the extracted CSS path + workflow + banned
  patterns.

Both already committed in forge-capital-app — look at
`~/Developer/forge-capital-app/CLAUDE.md` for the reference shape.

## Cross-reference to what YOU (ForgeOS) have already done

You already have the pattern partly right:

- **`src/styles/forge-mockup.css`** exists — good. That's the extracted
  Forge section mockup CSS.
- **`forge-mockup.css` at repo root** also exists — even better, that's
  the source.

BUT — there are signals the pattern isn't being fully exploited:

- `src/app/(platform)/today/today-v2.css` says "*ported from
  FORGE-MOCKUP-TODAY-V2.html + forge-mockup.css*"
- `src/app/(platform)/the-forge-v2/schedule/schedule-v2.css` says
  "*(lifted from forge-mockup.css)*"
- Several `-v2.css` files contain "*Palette — mirrors forge-mockup.css
  tokens for this page only*"

These per-page scoped stylesheets are **re-deriving the palette** from
forge-mockup.css. That's one layer better than pure Tailwind
approximation but still not the clean pattern. If forge-mockup.css is
imported at the top of `src/app/globals.css`, every page should be able
to use its class names directly WITHOUT a scoped -v2.css re-derivation.

### Tightening the Forge section — concrete steps

1. **Verify `forge-mockup.css` is imported in globals**:
   ```bash
   grep -l "forge-mockup" src/app/globals.css src/app/layout.tsx
   ```
   If not imported at the top of `globals.css` before the Tailwind
   directives, add it:
   ```css
   @import "../styles/forge-mockup.css";
   @tailwind base;
   @tailwind components;
   @tailwind utilities;
   ```
2. **Audit the `-v2.css` scoped stylesheets**. For each one, compare
   what it declares to what `forge-mockup.css` already provides. If the
   scoped file is re-declaring palette tokens or re-defining classes
   that exist in forge-mockup, delete the duplicates. Scoped files
   should only hold genuinely page-local CSS that isn't in the shared
   stylesheet.
3. **Scan the Forge section React files** for Tailwind classes that
   approximate forge-mockup classes. Replace with the forge-mockup
   class name verbatim. E.g. if you see
   `className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"`
   and forge-mockup has `.card { ... }` doing the same thing, use
   `className="card"`.
4. **Screenshot the shipped Forge pages against the original mockup
   files** with agent-browser (serve the mockups via
   `python3 -m http.server 8765` in the directory and load at
   `http://localhost:8765/FORGE-MOCKUP-*.html`). Diff. Any delta is a
   bug not a stylistic choice.

## Your Money / Product / Plan sections — concrete path

You haven't built these yet. Do them right from the start.

### Money section

You have ~20 MONEY-MOCKUP-*.html files (COCKPIT, CREATE-ROUND,
AUDIT-LOG, BOARDPACK, EMPTY-STATES, etc.). Per my check they each have
their own `<style>` blocks. Options:

- **Option A (recommended):** each MONEY mockup extracts its `<style>`
  block into a single consolidated `src/styles/money-mockup.css`, which
  imports after `forge-mockup.css` in `globals.css`. Money classes are
  likely prefixed (`.mn-*` or `.money-*`) so they won't collide.
- **Option B:** one big `money-mockup.css` assembled from the
  de-duplicated union of style blocks across all MONEY mockups.

Either way: `@import` it globally ONCE. Don't write per-page scoped
re-derivations.

```bash
# Option A recipe — extract each file's <style> block
for f in MONEY-MOCKUP-*.html; do
  awk '/<style>/,/<\/style>/' "$f" \
    | sed '1d;$d' \
    >> src/styles/money-mockup.css
done
# Then manually dedupe the resulting file
```

### Product (Forge) section

Same pattern. `FORGE-MOCKUP-PRODUCTS-*.html` have their style blocks.
Most Forge mockups probably share the forge-mockup.css design tokens.
If they have unique styles for product-specific UI, extract into
`src/styles/products-mockup.css`.

### Plan section

Check what mockup files drive Plan. If they have distinct style blocks,
same pattern.

## The reference app

`~/Developer/forge-capital-app/` has a working example of this pattern
end-to-end. Browse:

- `app/v4-mockup.css` — the extracted CSS
- `app/globals.css` — imports it first
- `app/(authed)/match/FindAMatch.tsx`, `tracker/TrackerTable.tsx` —
  React components using V4 class names verbatim
- `CLAUDE.md` — the rules document

The repo is public at `https://github.com/tristanfischer-ux/forge-capital-app`
if you want to reference specific commits. Look for commit `7017b4f`
(the CSS extraction) and `5df5e13` (§2 tracker re-port as the pattern's
first clean application).

## Communication contract with this ForgeOS terminal going forward

- When a new V2 page is built, before commit: screenshot the mockup at
  1440×900 with agent-browser, screenshot production at 1440×900, diff
  section-by-section, log `Mockup parity: ✓` or `⚠ <deltas>` in the
  commit message. ⚠ entries must be fixed in the same session.
- If you catch yourself writing Tailwind to approximate something the
  mockup's CSS already provides, STOP and look up the class name.
- The "did it build + did the SQL work" bar is necessary but not
  sufficient. "Does it look like the mockup?" is the real gate.
