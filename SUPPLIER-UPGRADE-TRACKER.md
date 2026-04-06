# Supplier Page Upgrade Tracker

## Context
Replicate the same investor page upgrade for the marketplace/supplier system. The Nightshift Supplier Dashboard (`~/Developer/Forge-Capital/Nightshift-Supplier-Dashboard.html`) is the reference, just as the Forge Capital Dashboard was for investors.

**Source data:** 11,297 suppliers in Nightshift SQLite DB, 10,117 pushed to ForgeOS
**Push script:** `~/Developer/Forge-Capital/research/35-nightshift-push-updates.py`
**Dashboard:** `~/Developer/Forge-Capital/Nightshift-Supplier-Dashboard.html`
**ForgeOS pages:** `/marketplace`, `/marketplace-v2/components/`

## Red Team Round 1 — Current State Assessment

### What the Nightshift Dashboard has:
- [ ] Overview tab with KPI cards (total suppliers, verified, enriched, contacts, etc.)
- [ ] Charts: Category breakdown, country distribution, quality distribution
- [ ] Suppliers tab: Dense table with name, category, location, specialties, quality, contact info
- [ ] Click supplier → modal with: description, synthesis, process capabilities, contact info, certifications, key equipment
- [ ] Contacts tab: searchable contact directory
- [ ] Map view (if applicable)

### What ForgeOS marketplace currently has:
- [ ] Card grid with category filters (Products, Services, etc.)
- [ ] MarketplaceDetailDialog for individual listing details
- [ ] MarketplaceStatsSection with Recharts
- [ ] MarketplacePageTabs (For You, Browse, Saved)
- [ ] Search + filters
- [ ] Compare view

### Gaps to Fix:
- [ ] Table view as default (like investors)
- [ ] Modal detail matching Nightshift dashboard sections
- [ ] Dense table columns matching Nightshift: Name, Category, Location, Specialties, Quality, Contacts
- [ ] Synthesis data visible (description, process capabilities, certifications)
- [ ] Cross-linking between suppliers and their contacts

## Phase 1: Audit ForgeOS Marketplace Current State
- [ ] Read MarketplaceBrowse.tsx — understand current view modes
- [ ] Read MarketplaceDetailDialog.tsx — what detail is shown
- [ ] Read MarketplacePageTabs.tsx — current tab structure
- [ ] Read marketplace actions — what data is fetched
- [ ] Compare against Nightshift Dashboard HTML sections

## Phase 2: Add Table View to Marketplace
- [ ] Add 'table' to view mode in MarketplaceBrowse
- [ ] Create MarketplaceTableView.tsx (matching investor table pattern)
- [ ] Default to table view

## Phase 3: Enhance Detail Dialog
- [ ] Ensure all synthesis fields are shown
- [ ] Add process capabilities section
- [ ] Add certifications section
- [ ] Add key equipment section
- [ ] Drill-down navigation if applicable

## Phase 4: Verify Data Parity
- [ ] Check supplier counts match (11,297 in Nightshift vs ForgeOS)
- [ ] Verify all enriched fields are pushed
- [ ] Check for missing push fields (synthesis, process capabilities)

## Phase 5: Deploy + Red Team Round 2
- [ ] `npx tsc --noEmit` — clean
- [ ] `git push` — deploys to Vercel
- [ ] Visual comparison against Nightshift Dashboard
- [ ] Fix any gaps found

## Verification
- `npx tsc --noEmit` + `npx next lint`
- `git push` → Vercel deploy
- Compare ForgeOS marketplace visually against Nightshift-Supplier-Dashboard.html
