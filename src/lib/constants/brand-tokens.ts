/**
 * @file brand-tokens.ts — Central brand token registry for report exporters.
 *
 * @description Single source of truth for colors, typography, and layout
 * spacing used across docx, pdf (@react-pdf/renderer), pptx, and print-HTML
 * report exports. Values match the in-product Tailwind semantic tokens so
 * exports stay visually consistent with the platform UI.
 *
 * Consumers MUST import from here rather than redeclaring hex values locally.
 *
 * @related
 * - src/app/layout.tsx — next/font/google registrations for Outfit, Playfair Display, Inter, JetBrains Mono
 * - src/lib/reports/markdown-to-docx.ts — legacy re-exports retained for back-compat
 */

// ─── Colors — hex (no leading #, for docx/pptx compatibility) ────────

export const BRAND_COLORS_HEX = {
  orange: 'FF4500',        // International Orange — primary brand
  orangeDark: 'CC3700',    // Hover / pressed
  orangeLight: 'FFE4D6',   // Subtle wash background
  electricBlue: '3B82F6',  // Secondary brand / CTA
  teal: '14B8A6',          // Accent — used sparingly for success/positive
  darkText: '1E293B',      // slate-900
  midText: '64748B',       // slate-500
  lightText: '94A3B8',     // slate-400
  lightBg: 'F8FAFC',       // slate-50
  white: 'FFFFFF',
  black: '000000',
  cardBorder: 'E2E8F0',    // slate-200
  divider: 'CBD5E1',       // slate-300
  // Semantic
  successBg: 'ECFDF5',
  successText: '166534',
  warningBg: 'FFF7ED',
  warningText: '9A3412',
  destructiveBg: 'FEE2E2',
  destructiveText: '991B1B',
  infoBg: 'EFF6FF',
  infoText: '1D4ED8',
} as const

/** CSS form — with leading '#', for HTML/CSS and @react-pdf/renderer. */
export const BRAND_COLORS_CSS = Object.fromEntries(
  Object.entries(BRAND_COLORS_HEX).map(([k, v]) => [k, `#${v}`]),
) as Record<keyof typeof BRAND_COLORS_HEX, string>

// ─── Typography ─────────────────────────────────────────────────────

/** Font families available to exporters. docx/pptx use the raw face name;
 *  @react-pdf/renderer requires font registration at runtime (see
 *  register-fonts.ts in the pdf exporter). */
export const FONT_FACES = {
  /** Primary UI sans — used for body copy and UI labels. */
  sans: 'Outfit',
  /** Display serif — used for editorial headlines (investor / marketing). */
  serif: 'Playfair Display',
  /** Alternate sans — fallback and body in engineer/supplier variants. */
  sansAlt: 'Inter',
  /** Monospace — part numbers, codes, CAD metrics. */
  mono: 'JetBrains Mono',
  /** System fallback — used by docx (Calibri is its default on Windows/Mac). */
  systemSans: 'Calibri',
  systemSerif: 'Georgia',
} as const

/** Google Fonts TTF URLs for @react-pdf/renderer Font.register(). */
export const FONT_URLS = {
  outfitRegular: 'https://fonts.gstatic.com/s/outfit/v11/QGYvz_MVcBeNP4NJtEtq.ttf',
  outfitMedium: 'https://fonts.gstatic.com/s/outfit/v11/QGYvz_MVcBeNP4NJtEtqQA.ttf',
  outfitBold: 'https://fonts.gstatic.com/s/outfit/v11/QGYvz_MVcBeNP4NJtEtqTA.ttf',
  playfairRegular: 'https://fonts.gstatic.com/s/playfairdisplay/v37/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvUDQ.ttf',
  playfairBold: 'https://fonts.gstatic.com/s/playfairdisplay/v37/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKd1vUDQ.ttf',
  interRegular: 'https://fonts.gstatic.com/s/inter/v19/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAQ.ttf',
  interSemibold: 'https://fonts.gstatic.com/s/inter/v19/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYAQ.ttf',
  jetbrainsRegular: 'https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4xD-IQ-PuZJJXxfpAO7Gww.ttf',
} as const

// ─── Spacing scale (in points, for pdf/docx; in inches for pptx) ────

export const SPACING_PT = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const

export const PAGE_PT = {
  marginTop: 48,
  marginBottom: 48,
  marginLeft: 56,
  marginRight: 56,
} as const

/** pptxgenjs uses LAYOUT_16x9 = 10" × 5.625". */
export const PPTX_LAYOUT = {
  width: 10,
  height: 5.625,
  margin: 0.5,
  contentWidth: 9.0,
  footerY: 5.2,
} as const
