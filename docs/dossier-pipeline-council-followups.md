# Dossier Pipeline — council follow-ups (deferred, 2026-08-15)

The 2026-08-15 adversarial council confirmed 20 findings; the high/medium ones
are fixed (commit `a9277cc00`). These lower-value items are deliberately
deferred — recorded so they aren't lost. None is an open cross-client leak.

## Small, worth doing next

- **Attachment MIME trust** — the brief attachment allow-list trusts the
  client-declared `Content-Type`. Add content sniffing (magic bytes) before
  accepting, or restrict to a smaller set. Low risk today (files are only ever
  downloaded by Tristan, never executed or served).
- **Runner filename `..`** — `safeFileName` collapses `..` to `_` for most
  cases but a bare `..` token survives; combined with `Date.now()` prefix the
  path stays inside the project dir, but harden the sanitiser anyway.
- **Rate-limit buckets** — `submitDossierBrief` and `unlockWorkbook` share the
  `contactForm` bucket. Give each its own bucket + limit. Verify `getClientIP`
  reads the platform-trusted header and the store is durable.
- **Studio error UX (#12)** — admin actions `throw` on failure, which renders
  Next's generic error page. Convert to typed `{ ok } | { error }` results with
  `useActionState`/`useFormStatus` for inline errors + a pending spinner on
  upload. Admin-only, so cosmetic, not a correctness risk.
- **Confirm-on-decline (#19)** — decline/hold email the customer instantly with
  no confirm step. Add a two-step confirm.

## Deliberate design choices (not bugs)

- **Token is a permanent bearer credential (#13)** — acceptable for a
  concierge tool with a 244-bit token, `no-referrer`, `no-store`, and noindex.
  If we later want revocation/expiry, add an `expires_at` column + a regenerate
  action and mint the download behind a per-click route handler.
- **Download URL minted at render (#17)** — a 1-hour signed URL; a stale tab
  gets a Supabase error on click. A `/project/[token]/download` route handler
  that re-mints per click is the tidy fix if it becomes a support issue.
- **`PLATFORM_SUPER_ADMIN_EMAIL` break-glass** — email-equality admin grant.
  Fine as a documented break-glass; the primary path is the `admin_users` table.

## Verified clean by the council (informational)

Against the live database + repo (project `jyarhvinengfyrwgtskq`): the customer
token path returns only the one project; child rows are always `project_id`
scoped; storage paths are `project.id`-prefixed; the token is unguessable; no
SSRF in the web code; the Anvil chain only calls OpenRouter (no tool-fetching of
model-chosen URLs), so brief text is not an injection carrier.
