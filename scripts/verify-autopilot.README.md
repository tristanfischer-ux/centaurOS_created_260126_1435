# verify-autopilot.sh — end-to-end autopilot verification harness

A single command that proves the ForgeOS autopilot pipeline works end-to-end
on a Vercel preview:

1. Logs into the preview via `~/.claude/scripts/forgeos-login.sh` (isolated
   agent-browser session).
2. Fills the canonical BESS brief at `/the-forge-v2/start`.
3. Clicks `Start + Autopilot →`.
4. Captures the new project UUID from the redirect URL.
5. Polls the Supabase PostgREST API every 20 seconds, asserting per-stage
   success criteria before advancing to the next timeout budget:
   - Chase research (`cad_lab_projects.research.report >= 1500 chars`)
   - Brief lock (`cad_lab_projects.brief_locked_at` populated)
   - Max decomposition (`cad_lab_projects.modules` >= 5)
   - Sizing (`dimension_sheet` populated or advancement past the stage)
   - Layout (`spatial_plan.placements` >= 1 or advancement)
   - BOM generation (every module has `keyParts`)
   - Finn cost (`ai_cost_estimates` has entries)
   - System illustration rendered (`system_illustration_url` set)
   - Module renders >= 75% complete (`image_render_state.finished_at` +
     `completed_ids >= 0.75 * total`)
   - Suppliers matched (`forge_supplier_shortlist` has >= 1 row OR autopilot
     advanced past the stage)
   - Fang reviews populated (`cad_lab_projects.reviews` >= 1 entry)
   - Autopilot `stage == done` OR `finished_at` set
6. Curls `/the-forge-v2/projects/<id>/export/pdf` with the agent-browser's
   cookies.
7. Validates the PDF: file size > 500KB, magic bytes `%PDF-1.`, page count
   >= 5, embedded text contains `Spatial plan`, `Sizing optimisation`, and
   `BOM master`.
8. Exits 0 with a summary; non-zero with a clear diagnostic.

## Usage

```bash
scripts/verify-autopilot.sh https://centaur-os-created-260126-1435-<sha>.vercel.app
scripts/verify-autopilot.sh --help
```

## Environment

Supabase credentials are auto-discovered from `.env.local` at the repo root
if not set in the shell:

- `SUPABASE_URL` — e.g. `https://jyarhvinengfyrwgtskq.supabase.co`
  (defaults to `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`).
- `SUPABASE_SERVICE_ROLE_KEY` — service-role JWT used for PostgREST reads
  (defaults to `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`).

Login credentials live in `~/.claude/secrets/forgeos-test.env` (chmod 600,
never committed). The script calls `~/.claude/scripts/forgeos-login.sh`
which reads them.

## Tools required on PATH

`agent-browser` (>= 0.25.3 for `--session` support), `curl`, `jq`,
`pdfinfo`, `pdftotext` (poppler).

## Timeouts

| Stage | Budget |
| --- | --- |
| Chase research | 6 min |
| Brief lock | 2 min |
| Max decomposition | 6 min |
| Sizing | 6 min (may skip) |
| Layout | 6 min (may skip) |
| BOM generation | 8 min |
| Finn cost | 6 min |
| Illustrations | 12 min (hero + modules) |
| Supplier match | 3 min |
| Fang reviews | 6 min |
| PDF finalise | 3 min |
| PDF curl download | 2 min |
| **Total wall clock** | **30 min (cap)** |

Polling interval: 20 seconds.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Autopilot finished, PDF validated. |
| `10` | Precondition failure (missing creds, tool, preview 404, missing env vars). |
| `20` | Autopilot kickoff failed (project never created, textarea never rendered, or submit didn't redirect). |
| `30` | Stage stalled — a per-stage timeout elapsed without the success predicate passing. |
| `40` | Autopilot recorded an explicit failure in `autopilot_state.error` or `autopilot_state.failed_stages`. |
| `50` | PDF route returned non-200 or couldn't be fetched. |
| `51` | PDF content invalid (size, magic, pages, or missing section strings). |
| `60` | 30-minute total wall-clock budget exceeded. |

## Side effects

- Log file: `/tmp/verify-autopilot-<timestamp>.log` (everything printed, plus
  diagnostic dumps on failure).
- Cookie jar: `/tmp/verify-autopilot-<timestamp>-cookies.txt` (chmod 600,
  Netscape format).
- PDF on success: `/tmp/verify-autopilot-<projectId>.pdf`.
- Isolated agent-browser session: `forgeos-verify-<timestamp>` (torn down
  on success and on failure).

## Example exit (green)

```
verify-autopilot OK project=dc8c1def-... pdf=/tmp/verify-autopilot-dc8c1def-....pdf size=812934B pages=14 elapsed=18m42s
```

## Example exit (red — stage stall)

Exit code `30`, with a diagnostic dump in the log that includes:

- Current `autopilot_state` object.
- Current `image_render_state` object.
- Latest 20 `pipeline_runs` rows (stage, status, timestamps, error_message).
- Invocation of `scripts/pull-autopilot-logs.sh` if present (so Vercel logs
  survive the 1-hour retention window).

## Known pairings

- Run `scripts/pull-autopilot-logs.sh <projectId> <preview-url>` after any
  failure to snapshot Vercel logs permanently (Vercel only keeps ~1h).
- CI smoke-test usage: invoke from a GitHub Actions job after waiting for
  the preview to go Ready. See `AUTOPILOT-RELIABILITY-SYNTHESIS.md` §P3.10.

## What this script does NOT do

- It does not start a dev server. It runs against a deployed preview URL.
- It does not fix failures it detects — it surfaces them clearly, that's the
  point.
- It does not re-trigger stalled stages via direct action calls. Keeping the
  walk faithful to a real user's path is the whole value.
