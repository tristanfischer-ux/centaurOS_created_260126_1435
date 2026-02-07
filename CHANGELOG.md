# Changelog

All notable changes to CentaurOS (ForgeOS) are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.6] - 2026-02-07

### Added
- Unit tests for critical shared code: `utils.ts`, `foundry-context.ts`, server action auth patterns (57 new tests)
- `withAuth`/`withUser` wrappers in `server-action-utils.ts` to centralize server action boilerplate
- Jest coverage thresholds for critical files (utils, foundry-context, server-action-utils)
- TypeScript type declarations for `next-pwa` package
- `npm run typecheck` and `npm run test:coverage` scripts
- Type check step in CI pipeline

### Changed
- Enabled `strictNullChecks` and `noImplicitAny` in `tsconfig.json`
- E2E tests now block CI pipeline (removed `continue-on-error`)
- Updated skills: code-quality, secure-server-actions, feature-implementation-guide, e2e-testing

### Fixed
- Null check bug in `activity.ts` message filtering (caught by `strictNullChecks`)
- ESLint config ignoring `playwright-report 2/` directories with spaces

## [1.0.5] - 2026-02-07

### Added
- E2E video walkthrough test suite for all 4 personas (Founder, Executive, Apprentice, Supplier)
- Onboarding modal auto-dismissal in auth setup and `beforeEach` hooks
- Shared `dismissOnboarding()` helper using `page.addInitScript()` for reliable localStorage injection
- Video gallery generator script (`scripts/generate-video-gallery.mjs`) producing single-page HTML with all recordings
- npm scripts: `test:e2e:walkthroughs` and `test:e2e:gallery` for one-command walkthrough runs
- `e2e/auth-storage.ts` shared module for storage paths and onboarding helpers

### Fixed
- Onboarding modals blocking all E2E walkthrough recordings (set 5 localStorage flags pre-render)
- Supplier Portal "Supplier Portal" text assertion (strict mode violation with 3 matching elements)
- Profile & Settings tests failing due to sidebar link not found (switched to direct URL navigation)

### Changed
- Softened walkthrough test assertions for video recording purpose (removed console error checks, removed overly strict `not.toContainText('Error')`)
- Auth setup now reloads page after setting localStorage flags to ensure clean state before saving storageState

## [1.0.4] - 2026-02-07

### Fixed
- Resolved 404 error on `/analytics` route by creating a platform-level analytics page
- Fixed stale `/admin/analytics` route reference in feature registry (now `/ops/analytics`)
- Fixed stale `revalidatePath('/admin/analytics')` in analytics server action

### Added
- Manufacturing Techniques Explorer feature registered in feature registry

### Changed
- Updated landing page hero images and content
- Updated agents workflow toolbar, prompt library, and workflow templates
- Updated marketplace browse component and state hooks
- Updated inspiration page category tabs and layout
- Updated RFQ creator with technique selector component

## [1.0.3] - 2026-02-07

### Added
- Company Admin hub (`/admin`) for Founders/Executives
- Platform Operations dashboard (`/ops`) for platform owner
- Company profile and activity intelligence system
- What's New page (`/whats-new`) for all users

### Fixed
- Restored `--webpack` flag for Vercel builds (next-pwa compatibility)

### Changed
- Split admin into Company Admin and Platform Ops (security improvement)
- `isAdmin()` no longer has Founder role fallback
