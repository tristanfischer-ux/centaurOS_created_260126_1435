# Agent Handover Document

**Date:** February 2, 2026
**Task:** Fix UI Transparency Issues - Phase 2
**Status:** ✅ COMPLETE

---

## Context

User reported dark overlay backgrounds on dialogs, sheets, and modals causing a dreary UI that violates the "bright, airy, optimistic" design philosophy. The previous fix session missed the core issue: the Shadcn UI primitives themselves were using `bg-black/80` and `bg-black/50` for overlays.

## Root Cause

The overlay components (`DialogOverlay`, `SheetOverlay`, `DrawerOverlay`, `AlertDialogOverlay`) in `src/components/ui/` were using **dark transparent backgrounds** (`bg-black/80`, `bg-black/50`) which created the dreary, dark overlay effect seen in screenshots.

## Fixes Applied

### 1. Core UI Component Overlays (CRITICAL)

Changed from dark to light overlays:

| Component | Old Pattern | New Pattern |
|-----------|-------------|-------------|
| `dialog.tsx` | `bg-black/80` | `bg-muted/60` |
| `sheet.tsx` | `bg-black/50` | `bg-muted/60` |
| `drawer.tsx` | `bg-black/50` | `bg-muted/60` |
| `alert-dialog.tsx` | `bg-black/80` | `bg-muted/60` |

### 2. Custom Modal Overlays

| File | Old Pattern | New Pattern |
|------|-------------|-------------|
| `gdpr/PrivacySettings.tsx` | `bg-black/80` | `bg-muted/60` |
| `buyer/buyer-dashboard-view.tsx` | `bg-black/50` | `bg-muted/60` |
| `provider/AvailabilityCalendar.tsx` | `bg-background/80` | `bg-muted` |

### 3. Other Transparency Fixes

| File | Old Pattern | New Pattern |
|------|-------------|-------------|
| `team/team-comparison-view.tsx` | `bg-status-success/10 backdrop-blur-[1px]` | `bg-status-success-light` |
| `team/team-comparison-view.tsx` | `bg-muted0/10 backdrop-blur-[1px]` | `bg-muted` |
| `apprenticeship/skills-gap-chart.tsx` | `bg-background/30` | `bg-muted` |
| `provider/PortfolioGrid.tsx` | `bg-white/50 hover:bg-white/75` | `bg-muted hover:bg-background` |
| `booking/BookingConfirmation.tsx` | `bg-white/80` | `bg-background` |
| `smart-airlock/RubberStampModal.tsx` | `bg-background/10 backdrop-blur-[2px]` | `bg-background` |

### 4. Updated Design Rules

- Updated `.cursor/rules/no-transparency.mdc` to specify that modal overlays should use `bg-muted/60` (light), NOT `bg-black/80` (dark)

## Intentional Exceptions (Do NOT Fix)

These use transparency intentionally:

1. **Marketing Navbar** (`src/components/marketing/MarketingNavbar.tsx`)
   - `bg-background/90 backdrop-blur-md` - Glass effect for marketing site

2. **LivePulse Terminal** (`src/components/smart-airlock/LivePulse.tsx`)
   - `bg-black/40 backdrop-blur-sm` - Intentional terminal/HUD aesthetic

3. **Marketing Trust Section** (`src/components/marketing/TrustSafetySection.tsx`)
   - `bg-white/10 backdrop-blur-md` - Marketing visual effect

4. **Subtle Hover States** (various files)
   - `hover:bg-orange-50/50`, `bg-orange-50/30` - Light tints for selection/unread indicators

## Verification

- ✅ `npm run build` succeeds
- ✅ All dialog, sheet, drawer, alert-dialog overlays now use `bg-muted/60`
- ✅ No dark `bg-black/XX` overlays in platform components
- ✅ Remaining transparency uses are documented intentional exceptions

## Key Lessons

1. **The previous fix session only verified that content panels used `bg-background`/`bg-card`, but missed that the OVERLAY components still used dark transparent backgrounds.** Always check both the content AND the overlay styling in modal components.

2. **CRITICAL BUG FOUND: `tailwind.config.ts` had invalid color definitions.**
   - `background: 'var(--background)'` outputs invalid CSS: `background-color: 0 0% 100%`
   - FIXED to: `background: 'hsl(var(--background))'` which outputs valid: `background-color: hsl(0 0% 100%)`
   - This caused `bg-background` to be transparent because the browser couldn't parse the invalid color!

## Next Agent Actions

1. Run `./scripts/check-design-tokens.sh` before commits
2. If user reports "dark UI", check the OVERLAY styling, not just content
3. Never use `bg-black/XX` for modal overlays - use `bg-muted/60` for light theme
4. **ALWAYS use `hsl(var(--variable))` format in tailwind.config.ts for CSS variable colors**
