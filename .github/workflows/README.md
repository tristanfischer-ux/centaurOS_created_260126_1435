# GitHub Actions Workflows

Reference for the workflows under `.github/workflows/`. This document focuses on the workflows that require ongoing operational attention (secrets, cost, manual runs). Routine workflows (`ci.yml`, `deploy-security-migrations.yml`, `docker-build.yml`, `dependabot`) are self-documenting in their own files.

## `autopilot-smoke.yml` — Autopilot end-to-end smoke test

This workflow runs `scripts/verify-autopilot.sh` against the Vercel preview deploy for every push to `feat/forge-v2-cutover` and every pull request targeting `main`. It is the P3.10 gate from `AUTOPILOT-RELIABILITY-SYNTHESIS.md` and exists to catch autopilot regressions within minutes of a push, rather than days later during a founder demo.

### What it does

1. Waits for the Vercel preview for the current commit SHA to reach `Ready` (up to 10 minutes). If Vercel never finishes building, the workflow fails with a clear error.
2. Installs Node.js 22, agent-browser, and `poppler-utils` (for `pdfinfo` and `pdftotext`).
3. Writes the test account credentials into `~/.claude/secrets/forgeos-test.env` so `verify-autopilot.sh` finds them in the same location it uses locally.
4. Runs `bash scripts/verify-autopilot.sh "$SUBJECT"` against the resolved preview URL. The default subject is a known-good battery storage brief; override it via `workflow_dispatch` when needed.
5. Uploads `/tmp/verify-autopilot-*.log` and `~/Developer/forgeos-autopilot-logs/**` as a workflow artifact named `autopilot-smoke-logs-<run_id>`, retained for 14 days, so Vercel's 1-hour log retention is no longer load-bearing.

### Triggers

- **`push`** on `feat/forge-v2-cutover`, with `paths-ignore` filters that skip the run on documentation-only changes (`**/*.md`, `docs/**`, the autopilot planning docs, `CLAUDE.md`, `MEMORY.md`, etc.).
- **`pull_request`** targeting `main`, with the same `paths-ignore` filter.
- **`workflow_dispatch`** for manual runs. Two optional inputs:
  - `preview_url_override` — run against a specific Vercel preview URL instead of auto-detecting from the SHA.
  - `subject_override` — use a different brief subject line (useful when testing the fix for a specific domain's regression).

A `concurrency` group per ref ensures that a new push cancels any in-flight smoke run on the same branch. This keeps spend predictable (never more than one active run per branch).

### Required GitHub Secrets

Add these under **Settings → Secrets and variables → Actions → Repository secrets** before the workflow can run green. Every one is validated by a "fail fast" step at the top of the job.

| Secret | Purpose | Notes |
| --- | --- | --- |
| `VERCEL_TOKEN` | Auth for `npx vercel list` / `vercel ls` during preview-URL resolution. | Scope: read-only on the ForgeOS Vercel project is sufficient. |
| `SUPABASE_SERVICE_ROLE_KEY` | Lets `verify-autopilot.sh` poll `pipeline_runs`, `autopilot_state`, and `cad_lab_projects` tables directly. | Never expose this outside CI / local dev — it bypasses RLS. |
| `SUPABASE_URL` | Base URL for the ForgeOS Supabase project (`https://<ref>.supabase.co`). | Matches the `NEXT_PUBLIC_SUPABASE_URL` used by the app. |
| `SUPABASE_PROJECT_REF` | The short project ref (e.g. `kgkajatjyqfetdtbzmwg`). | Used by the Supabase CLI / MCP paths inside the verify script. |
| `FORGEOS_TEST_EMAIL` | Test-account email used by the login step (`claude-test@forgeos.test`). | Sandbox foundry, drips suppressed. Never Tristan's real account. |
| `FORGEOS_TEST_PASSWORD` | Test-account password. | Credentials live only in `~/.claude/secrets/` locally and in repo secrets in CI. |

Optional secrets (only needed if / when the verify script expands):

- `GITHUB_TOKEN` — auto-provided by Actions, not required as a separate secret.

### How to interpret failures

1. **"Missing required GitHub secrets"** — a repo secret is empty. Add it in the repo settings and re-run.
2. **"Vercel preview for SHA … did not become Ready within 10 minutes"** — Vercel either failed the build or is still queuing. Open the Vercel dashboard and inspect the deployment status for the relevant SHA.
3. **"scripts/verify-autopilot.sh is missing or not executable"** — the P2.7 script hasn't landed yet on the branch under test. Land the script first, then re-run.
4. **Non-zero exit from `verify-autopilot.sh`** — open the uploaded artifact `autopilot-smoke-logs-<run_id>` and read `verify-autopilot-*.log`. The script uses stable exit codes (see `RED-TEAM-3-VERIFICATION.md` §3):
   - `10` — precondition failure (missing creds, preview 404).
   - `20` — autopilot failed to kick off (project never created, or `startAutopilot` returned `ok: false`).
   - `30` — stage stalled for 4 minutes; the log dump names the stage.
   - `40` — stage recorded an explicit failure; `autopilot_state.error` is in the log.
   - `50` — PDF route returned non-200.
   - `51` — PDF is invalid (< 50 KB, wrong magic bytes, fewer than 5 pages, missing a required section).
   - `60` — total timeout exceeded (`TIMEOUT_TOTAL_MS`).

The artifact also contains everything `pull-autopilot-logs.sh` saved into `~/Developer/forgeos-autopilot-logs/<date>/<projectId>/`: raw Vercel logs, per-specialist prefix slices, error-only slice, and a snapshot of the project row.

### Running manually

From the GitHub UI: **Actions → "Autopilot end-to-end smoke test" → Run workflow**. Pick the branch, optionally override the preview URL or subject, and click run.

From the CLI:

```bash
gh workflow run autopilot-smoke.yml --ref feat/forge-v2-cutover
# with overrides:
gh workflow run autopilot-smoke.yml \
  --ref feat/forge-v2-cutover \
  -f preview_url_override="https://fractionalforge-xyz.vercel.app" \
  -f subject_override="Autonomous mobile robot for warehouse pick-and-place"
```

### Status badge

Embed the live status of the smoke test in any markdown file with:

```markdown
[![Autopilot smoke](https://github.com/tristanfischer-ux/centaurOS_created_260126_1435/actions/workflows/autopilot-smoke.yml/badge.svg?branch=feat%2Fforge-v2-cutover)](https://github.com/tristanfischer-ux/centaurOS_created_260126_1435/actions/workflows/autopilot-smoke.yml)
```

The root `README.md` is outside this workflow's scope; adding the badge there is a one-line follow-up when the main branch starts exercising it.

### Cost awareness

Each end-to-end run consumes:

- Chase research (~£0.30 against DeepSeek V3.2)
- Max decomposition, Fang sizing + layout, BOM fan-out, Finn cost, Fang reviews (total ~£0.80–1.20 against the mixed model fleet)
- Image renders (cover + per-module through gpt-image / fallback) — £0.60–1.20 depending on module count
- PDF render + supplier match — negligible

**Estimated £2–3 per successful run, £1–2 per failed-early run.** The `concurrency: cancel-in-progress` group caps runs at one per branch; the `paths-ignore` filter keeps docs-only pushes off the workflow entirely; the timeout (30 min) caps the worst-case spend. Expected budget is £10–25/day during active autopilot work, which is cheap compared to a single afternoon of reactive whack-a-mole debugging.

If cost ever becomes a problem, the three levers are: (a) raise the `paths-ignore` scope so fewer pushes qualify; (b) shorten the smoke brief to 2-3 modules instead of the current 4; (c) cache Chase research between runs with the same subject so the first run pays the £0.30, subsequent runs reuse the report.

### Known limitations

- `npx vercel` is installed on-demand each run; if the Vercel CLI breaks its `--json` contract again we fall back to parsing `vercel ls`. Both paths are in the workflow.
- Agent-browser is installed globally (`npm install -g agent-browser`). If a future agent-browser release tightens its install requirements, swap it for a Playwright-based runner by editing the `Install agent-browser` step.
- The workflow does not post PR comments on failure; it relies on GitHub's native "failed checks" UI + the uploaded artifact. If PR comments become valuable, add a `gh pr comment` step gated on `if: failure() && github.event_name == 'pull_request'`.

---

## Other workflows in this directory

- `ci.yml` — type-check + lint on pushes to `main` and PRs to `main`. Fast, cheap, always on.
- `dependabot.yml` (in `.github/` one level up) — automated dependency PRs.
- `check-model-versions.yml` — detects drift in pinned LLM model identifiers.
- `backfill-stl.yml` — manual CAD STL backfill job.
- `deploy-security-migrations.yml` — security-migration deploys on `main`.
- `docker-build.yml` — container builds on tagged releases.
- `forge-rfq-release-operations.yml` — scheduled marketplace RFQ release ops.
- `qa-day-in-life.yml` — weekly + on-demand Playwright persona tests against staging/production.

Each has its own inline comments. Add a section here only when a workflow acquires operational surface area (secrets, costs, manual runs) that contributors need to know about.
