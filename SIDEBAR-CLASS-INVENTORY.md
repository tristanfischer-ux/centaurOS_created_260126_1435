# SHARED-SIDEBAR — Class Inventory & DOM Map

Source files:
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/SHARED-SIDEBAR.html` (1446 lines, 5 variant copies of the same canonical markup)
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/forge-mockup.css` (lines 706–796 = shared sidebar base; SHARED-SIDEBAR.html `<style>` block lines 229–579 = the extended variant-scoped rules that override / add on top)

Namespace: `.sidebar` (container) + `.sb-*` (children). Plan terminal's `.plan-shell / .ps-*` classes are page chrome, NOT sidebar — do not import (Decision A).

Design tokens used throughout: `--surface`, `--surface-muted`, `--surface-dim`, `--border`, `--border-strong`, `--border-soft`, `--fg`, `--fg-muted`, `--fg-subtle`, `--fg-faint`, `--brand` (#ff4500), `--brand-soft` (#fff0ea), `--brand-dim`, `--success`, `--warning`, `--warning-soft`, `--danger`, `--info`, `--teal`, `--shadow-xs`, radii `6/8/10/12/14px`.

---

## 1. CSS class inventory (all `sb-*` + container)

### 1a. Root / layout

| Class | Purpose |
|---|---|
| `.app-shell` | Grid wrapper: `grid-template-columns: 248px 1fr; min-height: 100vh` — pairs sidebar + main in production pages. (forge-mockup.css:712) |
| `.sidebar` | The `<aside>`. Sticky full-viewport (`position: sticky; top: 0; height: 100vh; overflow-y: auto`), white bg, right border, `padding: 14px 10px`, `font-size: 13px`, flex column. (forge-mockup.css:714) |
| `.variant-frame .sidebar` | Mockup-only override — non-sticky, `min-height: 760px`, `position: relative` — used inside each of the 5 variant demo cards. Only for the demo page. (SHARED-SIDEBAR.html:232) |

### 1b. Brand row (top)

| Class | Purpose |
|---|---|
| `.sb-brand` | Flex row, `font-size: 15px; font-weight: 700`, contains logo dot + wordmark + plus/search icons. Padding `4px 8px 2px`. |
| `.sb-brand .brand-dot` | 7px orange circle (brand colour swatch). |
| `.sb-brand .sb-plus` | "+ New" affordance. 18×18 flex box, muted text, hover → fg. Pushed right via `margin-left: auto`. Contains inline 14×14 SVG (plus icon). |
| `.sb-brand .sb-search` | "Search" affordance. Same 18×18 sizing as `.sb-plus`. Contains inline 14×14 SVG (magnifying-glass). |

### 1c. Foundry switcher (Decision E) — sits between brand and first section

| Class | Purpose |
|---|---|
| `.sb-foundry` | Grey/muted rounded button (`border-radius: 8px`, `background: var(--surface-muted)`). Flex row, `padding: 10px`. Click target = switch foundry. `role="button"`. |
| `.sb-foundry-icon` | 30×30 orange gradient square with 2-letter monogram (e.g. `NR`). |
| `.sb-foundry-body` | Vertical text stack (name + meta). `flex: 1; min-width: 0;` for ellipsis truncation. |
| `.sb-foundry-name` | `font-weight: 700; font-size: 12.5px`, truncates on overflow. |
| `.sb-foundry-meta` | `font-size: 10.5px`, muted, contains member count + role badge, `gap: 6px`. |
| `.sb-foundry-meta .role-badge` | Brand-coloured pill, `font-size: 9px`, uppercase. Shows user's role at this foundry (Founder / Executive / etc.). |
| `.sb-foundry-switch` | `⇅` character pushed right (`margin-left: auto`). Muted. |
| `.sb-create-company` | Dashed-border "+ Create a Company" CTA, centred, `font-size: 11.5px`, muted — turns brand-coloured on hover. Block-level, below the foundry pill. |

```html
<div class="sb-foundry" role="button" aria-label="Switch foundry">
  <div class="sb-foundry-icon">NR</div>
  <div class="sb-foundry-body">
    <div class="sb-foundry-name">Nimbus Robotics</div>
    <div class="sb-foundry-meta"><span>5 members</span><span class="role-badge">Founder</span></div>
  </div>
  <span class="sb-foundry-switch">⇅</span>
</div>
<a href="#" class="sb-create-company">+ Create a Company</a>
```

### 1d. Section headers + sub-groups

| Class | Purpose |
|---|---|
| `.sb-section` | Uppercase section label row. `font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase`, padding `14px 10px 6px`. Flex row (label on left, chevron on right). |
| `.sb-section-label` | Inner inline-flex span for label text + adjacent indicators (new-dot, V2 badge). |
| `.sb-section .sb-new-dot` | 6×6 orange dot beside a section header — signals new items inside (used on `Me` when Comms has unread). |
| `.sb-section .sb-collapse` | `⌄` chevron, right-aligned, for collapse/expand UI (non-functional in mockup, but drives future state). |
| `.sb-section .sb-dot-live` | 6×6 brand dot (alternate "live feed" indicator defined in forge-mockup.css:758 — present but not used in SHARED-SIDEBAR.html). |
| `.sb-section .sb-badge.v2` | `V2` mini-badge rendered inline in the section label (used only on `Money`). Brand-soft bg, 9px, uppercase. |
| `.sb-section.money-v2` | Applied to the Money section header so its label inherits brand colour. |
| `.sb-subgroup` | Smaller sub-label inside a section (`People` / `Supplies` under Marketplace). `font-size: 9.5px`, uppercase, `color: var(--fg-subtle)`, padding `8px 10px 3px`. |
| `.retired-heading` | Tiny "being retired" label above strikethrough links. Uses `::after` pseudo-element as a hairline rule. |

```html
<div class="sb-section">
  <span class="sb-section-label">Me <span class="sb-new-dot"></span></span>
  <span class="sb-collapse">⌄</span>
</div>
<div class="sb-section money-v2">
  <span class="sb-section-label">Money <span class="sb-badge v2">V2</span></span>
  <span class="sb-collapse">⌄</span>
</div>
```

### 1e. Nav links

| Class | Purpose |
|---|---|
| `.sb-link` | The primary nav `<a>`. Flex row, `gap: 10px`, padding `7px 10px`, radius 6. `font-size: 13px; font-weight: 500`. Contains inline SVG (15×15, `opacity: 0.8`) + `.sb-label` + optional trailing badge/count. |
| `.sb-link:hover` | `background: var(--surface-muted)`. |
| `.sb-link.active` | Active state — `background: var(--brand-soft); color: var(--brand); font-weight: 600`. Icon `opacity: 1`. Exactly ONE link has `.active` per sidebar instance. |
| `.sb-link svg` | Direct SVG child — 15×15, `flex-shrink: 0; opacity: 0.8`. Active variant = `opacity: 1`. |
| `.sb-label` | Inner text span — the link text. Needed as a separate span so `.retired` can strike it through without striking the trailing "→ Target" hint. |
| `.sb-link.retired` | Strikethrough/deprecated state (Decision B — retired Money routes). `color: var(--fg-subtle); cursor: help; font-weight: 400`. The `.sb-label` within gets `text-decoration: line-through` with faint colour. |
| `.sb-link.retired .sb-absorbed` | Italic trailing hint like `→ Cockpit`. Right-aligned via `margin-left: auto`, `font-size: 9.5px`, muted. |

```html
<a href="#" class="sb-link">
  <svg viewBox="0 0 24 24" ...>…</svg>
  <span class="sb-label">Comms</span>
  <span class="sb-unread-badge">3</span>
</a>

<a href="#" class="sb-link active">
  <svg .../>
  <span class="sb-label">Today</span>
</a>

<a href="#" class="sb-link retired" title="Absorbed into Cockpit">
  <svg .../>
  <span class="sb-label">Cash Burn</span>
  <span class="sb-absorbed">→ Cockpit</span>
</a>
```

### 1f. Link badges / counts / pills (all trailing, pushed right)

All live inside `.sb-link`, use `margin-left: auto` so only one should appear per link.

| Class | Visual | Data |
|---|---|---|
| `.sb-badge.beta` | Orange pill, 9.5px, uppercase, brand-soft bg, brand text. `BETA`. |
| `.sb-badge.soon` | Muted grey pill, `SOON`. |
| `.sb-badge.v2` | Orange, 9px, `V2`. Used both at section-header level (Money) and occasionally on individual links. |
| `.sb-count` | Rounded-10 pill with tabular numbers (`min-width: 18px`). Grey by default (muted fg + muted bg). |
| `.sb-count.brand` | Orange variant (brand fg on brand-soft bg) — e.g. supplier Orders. |
| `.sb-count.warning` | Yellow — e.g. RFQs with 2 outstanding. |
| `.sb-count.danger` | Red/white — critical counts. |
| `.sb-unread-badge` | Solid brand (orange) pill with white text + `box-shadow: 0 0 0 2px var(--surface)` ring. Used on Comms. When parent `.sb-link.active`, ring flips to `var(--brand-soft)`. |

```css
.sb-link .sb-badge       { margin-left: auto; font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 3px; }
.sb-link .sb-badge.beta  { background: var(--brand-soft); color: var(--brand); }
.sb-link .sb-badge.soon  { background: var(--surface-muted); color: var(--fg-muted); }
.sb-link .sb-count       { margin-left: auto; font-size: 10.5px; padding: 1px 7px; border-radius: 10px;
                           min-width: 18px; text-align: center; font-variant-numeric: tabular-nums; }
.sb-link .sb-unread-badge{ color: #fff; background: var(--brand); box-shadow: 0 0 0 2px var(--surface); }
```

### 1g. Conditional wrapper (Decision H — Supplier Portal)

| Class | Purpose |
|---|---|
| `.sb-conditional-wrap` | Wraps the Supplier Portal section + its links. `opacity: 0.45`, `border-left: 2px dashed var(--border-strong)`. On hover opacity rises to 0.85. |
| `.sb-conditional-wrap::after` | Absolute-positioned pedagogical tag reading `conditional · profile.is_supplier = true` — mockup-only, strip in production. |

```html
<div class="sb-conditional-wrap">
  <div class="sb-section"><span class="sb-section-label">Supplier Portal</span></div>
  <a href="#" class="sb-link">...Dashboard</a>
  <a href="#" class="sb-link">...My Listing</a>
  <a href="#" class="sb-link">...Orders <span class="sb-count brand">4</span></a>
  <a href="#" class="sb-link">...RFQs <span class="sb-count warning">2</span></a>
  <a href="#" class="sb-link">...Analytics</a>
  <a href="#" class="sb-link">...Settings</a>
</div>
```

In React: render the whole sub-tree only when `profile.is_supplier === true` and drop the wrapper + `::after` styling.

### 1h. Footer stack (Decision F)

| Class | Purpose |
|---|---|
| `.sb-footer` | Flex-column container pushed to bottom via `margin-top: auto`, top border, padding `14px 4px 4px`, `gap: 10px`. Contains 5 blocks in order. |
| `.sb-getting-started` | Card link: muted bg, bordered, radius 8. Flex row with ring + body + count. Hover → stronger border. |
| `.sb-gs-ring` | 26×26 circle using `conic-gradient(var(--brand) 0 33%, var(--surface-dim) 33% 100%)` — the % in the first stop = progress (here 2/6 = 33%). |
| `.sb-gs-ring-inner` | 18×18 white circle inside the ring, contains the current step number (e.g. `2`), brand text. |
| `.sb-gs-body` | `flex: 1; min-width: 0;`. Holds title + sub. |
| `.sb-gs-title` | "Getting Started", 12px, `font-weight: 600`. |
| `.sb-gs-sub` | "Finish setup to unlock Raise", 10.5px muted. |
| `.sb-gs-count` | Trailing "2/6", 11px muted, tabular-nums. |
| `.sb-util-row` | Flex row, `justify-content: space-between`, containing 3 `<a>` — Pricing / Settings / Sign Out. |
| `.sb-util-row a` | Small muted link with a `.u-icon` prefix (currency / gear / arrow glyph). Hover: darker text + muted bg. |
| `.sb-util-row a .u-icon` | 10px glyph (`£`, `⚙`, `↗`). |
| `.sb-bar` | Thin-progress container. Generic. Padding `2px 6px`. |
| `.sb-bar .sb-bar-label` | Flex row label: `<span class="l">` label left, `<span class="v">` value right. 10px, tabular-nums. |
| `.sb-bar .sb-bar-track` | Height 4, muted bg, radius 3. |
| `.sb-bar .sb-bar-fill` | Height 100%, `background: var(--brand)` default. Width set via inline `style="width: 35%"`. |
| `.sb-bar.time .sb-bar-fill` | Fill overridden to `var(--info)` (blue). |
| `.sb-bar.credits .sb-bar-fill` | Fill overridden to `var(--teal)`. |
| `.sb-tier` | Bottom-most strip: flex-between, muted bg, radius 6, 11px, tabular-nums. Shows tier name + numeric usage + delta. |
| `.sb-tier .tname` | Bold tier name ("Enterprise"). |
| `.sb-tier .tnum` | Muted usage fraction ("204/10000"). |
| `.sb-tier .tdelta` | Green success-coloured delta ("+1075"). |

```html
<div class="sb-footer">
  <a href="#" class="sb-getting-started">
    <div class="sb-gs-ring"><div class="sb-gs-ring-inner">2</div></div>
    <div class="sb-gs-body">
      <div class="sb-gs-title">Getting Started</div>
      <div class="sb-gs-sub">Finish setup to unlock Raise</div>
    </div>
    <div class="sb-gs-count">2/6</div>
  </a>
  <div class="sb-util-row">
    <a href="#"><span class="u-icon">£</span> Pricing</a>
    <a href="#"><span class="u-icon">⚙</span> Settings</a>
    <a href="#"><span class="u-icon">↗</span> Sign Out</a>
  </div>
  <div class="sb-bar time">
    <div class="sb-bar-label"><span class="l">This week · hours</span><span class="v">14 / 40h</span></div>
    <div class="sb-bar-track"><div class="sb-bar-fill" style="width: 35%;"></div></div>
  </div>
  <div class="sb-bar credits">
    <div class="sb-bar-label"><span class="l">Credits</span><span class="v">420 / 1000</span></div>
    <div class="sb-bar-track"><div class="sb-bar-fill" style="width: 42%;"></div></div>
  </div>
  <div class="sb-tier">
    <span><span class="tname">Enterprise</span> <span class="tnum">204/10000</span></span>
    <span class="tdelta">+1075</span>
  </div>
</div>
```

### 1i. Legacy / unused but defined

- `.sb-workspace`, `.sb-wicon`, `.sb-wname`, `.sb-wtag`, `.sb-expand` — older workspace switcher (forge-mockup.css:734–751). NOT used in SHARED-SIDEBAR.html; superseded by `.sb-foundry`. Do not implement.
- `.sb-util` (forge-mockup.css:787) — older utility row. Superseded by `.sb-util-row`. Ignore.

---

## 2. DOM tree (default / variant-1 markup)

```
<aside class="sidebar">
├── <div class="sb-brand">
│    ├── <span class="brand-dot">
│    ├── <span>ForgeOS</span>
│    ├── <span class="sb-plus" title="New">        → <svg> plus
│    └── <span class="sb-search" title="Search">   → <svg> magnifier
│
├── <div class="sb-foundry" role="button" aria-label="Switch foundry">
│    ├── <div class="sb-foundry-icon">NR</div>
│    ├── <div class="sb-foundry-body">
│    │     ├── <div class="sb-foundry-name">Nimbus Robotics</div>
│    │     └── <div class="sb-foundry-meta">
│    │           ├── <span>5 members</span>
│    │           └── <span class="role-badge">Founder</span>
│    └── <span class="sb-foundry-switch">⇅</span>
├── <a class="sb-create-company" href="#">+ Create a Company</a>
│
├── <div class="sb-section">                       ← ME section
│    ├── <span class="sb-section-label">Me <span class="sb-new-dot"></span></span>
│    └── <span class="sb-collapse">⌄</span>
├── <a class="sb-link"> <svg/> <span class="sb-label">Welcome</span> </a>
├── <a class="sb-link active"> <svg/> <span class="sb-label">Today</span> </a>
├── <a class="sb-link"> <svg/> <span class="sb-label">My Profile</span> </a>
├── <a class="sb-link"> <svg/> <span class="sb-label">Comms</span> <span class="sb-unread-badge">3</span> </a>
├── <a class="sb-link"> <svg/> <span class="sb-label">Time</span> </a>
├── <a class="sb-link"> <svg/> <span class="sb-label">Google Apps</span> </a>
│
├── <div class="sb-conditional-wrap">              ← SUPPLIER PORTAL (conditional)
│    ├── <div class="sb-section">
│    │     └── <span class="sb-section-label">Supplier Portal</span>
│    ├── <a class="sb-link"> Dashboard
│    ├── <a class="sb-link"> My Listing
│    ├── <a class="sb-link"> Orders <span class="sb-count brand">4</span>
│    ├── <a class="sb-link"> RFQs   <span class="sb-count warning">2</span>
│    ├── <a class="sb-link"> Analytics
│    └── <a class="sb-link"> Settings
│
├── <div class="sb-section">                       ← PLAN section (3 items)
│    └── <span class="sb-section-label">Plan</span> + <span class="sb-collapse">⌄</span>
├── <a class="sb-link"> Plan
├── <a class="sb-link"> Report
├── <a class="sb-link"> History
│
├── <div class="sb-section money-v2">              ← MONEY [V2] section
│    └── <span class="sb-section-label">Money <span class="sb-badge v2">V2</span></span> + collapse
├── <a class="sb-link"> Cockpit
├── <a class="sb-link"> Plan
├── <a class="sb-link"> Raise
├── <div class="retired-heading">being retired</div>
├── <a class="sb-link retired" title="Absorbed into Cockpit"> Cash Burn <span class="sb-absorbed">→ Cockpit</span>
├── <a class="sb-link retired" title="Absorbed into Plan"   > Cash Out  <span class="sb-absorbed">→ Plan</span>
├── <a class="sb-link retired" title="Absorbed into Plan"   > Cash In   <span class="sb-absorbed">→ Plan</span>
├── <a class="sb-link retired" title="Absorbed into Plan"   > P&L       <span class="sb-absorbed">→ Plan</span>
├── <a class="sb-link retired" title="Absorbed into Raise"  > Investors <span class="sb-absorbed">→ Raise</span>
├── <a class="sb-link retired" title="Absorbed into Raise"  > Fundraise <span class="sb-absorbed">→ Raise</span>
│
├── <div class="sb-section"> Workshop + ⌄          ← WORKSHOP section
├── <a class="sb-link"> The Forge  <span class="sb-badge beta">BETA</span>
├── <a class="sb-link"> Products
├── <a class="sb-link"> Team
├── <a class="sb-link"> Specialists
├── <a class="sb-link"> Outputs
├── <a class="sb-link"> Browse     <span class="sb-badge soon">SOON</span>
├── <a class="sb-link"> Inspiration
│
├── <div class="sb-section"> Marketplace + ⌄       ← MARKETPLACE section
├── <div class="sb-subgroup">People</div>
├── <a class="sb-link"> Recruits
├── <a class="sb-link"> Guild
├── <a class="sb-link"> Apprenticeship
├── <div class="sb-subgroup">Supplies</div>
├── <a class="sb-link"> Marketplace
├── <a class="sb-link"> Quotes     <span class="sb-count">5</span>
├── <a class="sb-link"> Orders
│
└── <div class="sb-footer">                        ← FOOTER (Decision F)
     ├── <a class="sb-getting-started">
     │     ├── <div class="sb-gs-ring"><div class="sb-gs-ring-inner">2</div></div>
     │     ├── <div class="sb-gs-body">
     │     │     ├── <div class="sb-gs-title">Getting Started</div>
     │     │     └── <div class="sb-gs-sub">Finish setup to unlock Raise</div>
     │     └── <div class="sb-gs-count">2/6</div>
     ├── <div class="sb-util-row">
     │     ├── <a>£ Pricing</a>
     │     ├── <a>⚙ Settings</a>
     │     └── <a>↗ Sign Out</a>
     ├── <div class="sb-bar time">
     │     ├── <div class="sb-bar-label"><span class="l">This week · hours</span><span class="v">14 / 40h</span></div>
     │     └── <div class="sb-bar-track"><div class="sb-bar-fill" style="width: 35%;"></div></div>
     ├── <div class="sb-bar credits">
     │     ├── <div class="sb-bar-label"><span class="l">Credits</span><span class="v">420 / 1000</span></div>
     │     └── <div class="sb-bar-track"><div class="sb-bar-fill" style="width: 42%;"></div></div>
     └── <div class="sb-tier">
           ├── <span><span class="tname">Enterprise</span> <span class="tnum">204/10000</span></span>
           └── <span class="tdelta">+1075</span>
</aside>
```

Section order is locked (Decision I): Brand → Foundry → ME → SUPPLIER PORTAL (conditional) → PLAN → MONEY [V2] → WORKSHOP → MARKETPLACE → FOOTER.

---

## 3. Five variants — what changes

**The markup is identical across all five.** Only the `.active` class moves. The retired/conditional/sub-group/footer blocks render the same everywhere.

| # | Variant | Active element | File range | vgroup pill colour |
|---|---|---|---|---|
| 1 | Today | `Me > Today` gets `.active` | lines 698–807 | default grey (`.vgroup` with no modifier) |
| 2 | Forge | `Workshop > The Forge` gets `.active` (keeps its trailing `.sb-badge.beta`) | lines 809–1105 | purple (`.vgroup.forge`) |
| 3 | Products | `Workshop > Products` gets `.active` | lines 1107–1216 | teal (`.vgroup.products`) |
| 4 | Plan | `Plan > Plan` gets `.active` | lines 1218–1326 | blue/info (`.vgroup.plan`) |
| 5 | Money | `Money > Cockpit` gets `.active` | lines 1328–1436 | orange/brand (`.vgroup.money`) |

Each variant is wrapped in `<section class="variant">` + `<div class="variant-head">` (metadata strip) + `<div class="variant-frame">` containing the `.sidebar` aside + `.variant-main` placeholder. The `.variant-*` chrome is demo-only and should be stripped from production; only `<aside class="sidebar">…</aside>` gets lifted into the React component.

Implementation (from `.impl-note` at SHARED-SIDEBAR.html:684): "The five active-state variants flip via a `pathname → section` map — e.g. `/today → me.today`, `/the-forge/* → workshop.forge`, `/products/* → workshop.products`, `/plan/* → plan.plan`, `/money/* → money.cockpit`."

Only ONE `.sb-link` should receive `.active` at a time; the active determination lives outside the markup (driven by `usePathname()`).

---

## 4. Footer component data contracts

Each footer block is independently data-driven. Suggested React props (each optional — hide block if absent):

### 4a. Getting Started (`.sb-getting-started`)
```ts
type OnboardingProgress = {
  completedSteps: number;     // e.g. 2
  totalSteps: number;         // e.g. 6
  nextMilestone: string;      // copy for sub-title: "Finish setup to unlock Raise"
  href: string;               // link target, e.g. /onboarding
};
```
Progress ring = `conic-gradient(var(--brand) 0 ${(completed/total)*100}%, var(--surface-dim) ...)`. Ring-inner shows `completedSteps` as a number.

### 4b. Utility row (`.sb-util-row`)
Fixed 3 links — not really data-driven, but routes may change:
```ts
type FooterUtilLinks = {
  pricingHref: string;   // e.g. /settings/billing
  settingsHref: string;  // e.g. /settings
  onSignOut: () => void; // signOut server action
};
```
Glyphs (`£`, `⚙`, `↗`) are plain text Unicode — no icon library dependency.

### 4c. Time bar (`.sb-bar.time`)
```ts
type TimeUsage = {
  hoursThisWeek: number;     // 14
  weeklyCap: number;         // 40
  // fill width = (hoursThisWeek / weeklyCap) * 100 %, capped at 100
};
```
Fill colour = `--info` (blue).

### 4d. AI Credits bar (`.sb-bar.credits`)
```ts
type CreditsUsage = {
  creditsRemaining: number;  // 420
  creditsTotal: number;      // 1000
  // fill width = (creditsRemaining / creditsTotal) * 100 %
};
```
Fill colour = `--teal`. Label reads `"Credits"`, value reads `"420 / 1000"`.

Per CLAUDE.md "No AI Emphasis" rule — label stays `"Credits"`, not `"AI Credits"`, in production UI (mockup header copy does use "AI Credits" loosely; in-product copy must not).

### 4e. Tier strip (`.sb-tier`)
```ts
type TierInfo = {
  tierName: string;         // "Enterprise"
  usage: number;            // 204
  cap: number;              // 10000
  delta: number;            // +1075 (positive = green, the .tdelta always renders success colour in mockup; if reused for decreases, add a negative variant)
};
```

### 4f. Foundry switcher (`.sb-foundry`)
```ts
type FoundryContext = {
  foundryId: string;
  foundryName: string;              // "Nimbus Robotics"
  monogram: string;                 // "NR" — 2 chars
  memberCount: number;              // 5
  userRole: 'Founder' | 'Executive' | 'Apprentice' | 'AI_Agent';
  canSwitch: boolean;               // if user has access to other foundries
  onSwitch: () => void;             // opens the switcher dropdown/dialog
  onCreateCompany: () => void;      // +  Create a Company CTA
};
```

---

## 5. Badges, counts, and states — complete matrix

### 5a. Section-level indicators
| Indicator | Class | Where it appears | Meaning |
|---|---|---|---|
| New dot | `.sb-new-dot` (inside `.sb-section-label`) | `Me` | New items inside (Comms unread). 6×6 orange dot. |
| V2 badge | `.sb-badge.v2` (inside `.sb-section-label`) | `Money` | Section being re-scoped. Small orange pill. |
| Money-v2 label colour | `.sb-section.money-v2` modifier | `Money` | Whole section label gets brand colour. |
| Collapse chevron | `.sb-collapse` | every section | `⌄` right-aligned. |

### 5b. Link-level badges (trailing, max one per link)
| Badge | Class combo | Label | Where |
|---|---|---|---|
| BETA | `.sb-badge.beta` | `BETA` | `Workshop > The Forge` |
| SOON | `.sb-badge.soon` | `SOON` | `Workshop > Browse` |
| V2 | `.sb-badge.v2` | `V2` | only used at section level in this mockup — CSS supports link-level too |
| Count (neutral) | `.sb-count` | e.g. `5` | `Marketplace > Quotes` |
| Count (brand) | `.sb-count.brand` | e.g. `4` | `Supplier > Orders` |
| Count (warning) | `.sb-count.warning` | e.g. `2` | `Supplier > RFQs` |
| Count (danger) | `.sb-count.danger` | any critical | defined in CSS, not used in mockup |
| Unread badge | `.sb-unread-badge` | e.g. `3` | `Me > Comms` — the only instance |

### 5c. Link-level states
| State | Class | Visual |
|---|---|---|
| Default | `.sb-link` | Fg colour, icon 0.8 opacity, no bg. |
| Hover | `.sb-link:hover` | `bg: var(--surface-muted)`. |
| Active | `.sb-link.active` | `bg: var(--brand-soft); color: var(--brand); font-weight: 600`. Icon opacity 1. Only ONE active per sidebar. |
| Retired | `.sb-link.retired` | Subtle fg, `cursor: help`, weight 400. Add `title="Absorbed into X"` for tooltip. `.sb-label` inside gets strikethrough. Always accompanied by trailing `<span class="sb-absorbed">→ Target</span>`. |
| Retired hover | `.sb-link.retired:hover` | Muted bg but NOT brand (distinct from normal hover). |

### 5d. Conditional wrapper state
- `.sb-conditional-wrap` applies `opacity: 0.45` + a dashed left border + an absolute `::after` tag showing `conditional · profile.is_supplier = true`.
- Pedagogical only. In production: render the subtree conditionally and drop both the wrapper class and its `::after`.

### 5e. Absorbed hint
- `.sb-absorbed` — tiny italic muted right-aligned span inside a retired link. Non-interactive. Written as `→ Cockpit`, `→ Plan`, `→ Raise` (the current target that replaced this retired route).

---

## Production-only notes (drift from mockup)

1. The `.variant-frame`-scoped overrides (non-sticky, 760px min-height) are demo-only — the production component should use `.sidebar` base rules (sticky, 100vh). Pull the CSS from `forge-mockup.css` lines 714–791, NOT from the demo `<style>` block.
2. Retired Money links (6 of them) are pedagogical. Production: render them ONLY during a migration window, behind a feature flag. The `.retired-heading` and `.sb-absorbed` elements can then be deleted.
3. `.sb-conditional-wrap::after` and the `.variant-*` / `.audit-footer` / `.annot` chrome all strip.
4. Fixed icon set: all `.sb-link svg` are inline Feather-style 24×24-viewBox SVGs rendered at 15×15. Icons used, in order: MessageCircle (Welcome), Calendar (Today), User (Profile), Mail (Comms), Clock (Time/History), Grid (Google Apps), Layout (Dashboard), Package (Listing/Products), Briefcase (Orders), FileText (RFQs/Report/Quotes), BarChart (Analytics/P&L), Settings gear (Settings), BarChart3 (Plan), Globe (Cockpit), ArrowUp (Raise), AlertCircle (Cash Burn), ArrowLeft (Cash Out), ArrowRight (Cash In), Users (Investors/Team), DollarSign (Fundraise), Tool/Wrench (The Forge), Star (Specialists), Users+check (Recruits), Award (Guild), CheckCircle (Apprenticeship), ShoppingBag (Marketplace), Search (Browse), Sparkles (Inspiration). Swap to `lucide-react` equivalents in React (see CLAUDE.md — project uses `lucide`).
5. Accessibility: the `<aside>` needs `aria-label="Primary navigation"`. `.sb-foundry` already has `role="button" aria-label="Switch foundry"`. `.sb-link.active` should also set `aria-current="page"`. `.sb-collapse` chevrons should be `<button>` with `aria-expanded` (currently non-functional spans in the mockup).

---

## TL;DR build checklist for the React component

1. Top-level `<aside class="sidebar" aria-label="Primary navigation">`.
2. Render `<SidebarBrand/>` → `<FoundrySwitcher foundry={…} onSwitch={…} onCreate={…}/>`.
3. Render a `<SidebarSection>` per group driven by an items array (`id`, `label`, `href`, `icon`, `badge?`, `count?`, `unread?`, `retired?`, `absorbed?`).
4. `<SupplierPortalSection>` wraps its own items; mount only if `profile.is_supplier === true` (drop `.sb-conditional-wrap` class in production).
5. Derive which `href` is active from `usePathname()`; pass `active` boolean into each `<SidebarLink>`. One active at any time.
6. `<SidebarFooter>` has 5 fixed slots matching §4.
7. Use semantic tokens from `forge-mockup.css` `:root` (already mirrored in the app's tailwind config as `bg-surface`, `text-foreground`, `bg-international-orange`, etc.).
8. Match existing Next.js active-link pattern: `text-international-orange font-semibold` (per CLAUDE.md navigation rule) — the mockup's `var(--brand)` / `--brand-soft` combo matches this token already.
