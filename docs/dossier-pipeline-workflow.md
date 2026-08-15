# The Dossier Pipeline — Tristan's Operating Manual

*The full loop from a founder's brief landing on the website to the finished
Design Dossier going back out. Updated 2026-08-15.*

## The shape of it

```
FOUNDER                    WEBSITE (Vercel + Supabase)                 YOUR MAC
  │                                 │                                     │
  │ 1. submits /brief ─────────────▶│ row in dossier_projects             │
  │    (+ NDA box, + attachment)    │ status: submitted                   │
  │                                 │ → email to you                      │
  │◀── tracking link by email ──────│ → email to founder                  │
  │    /project/<token>             │                                     │
  │                                 │  1a. YOU click Validate in /studio  │
  │                                 │ status: validated                   │
  │                                 │       2. anvil-runner polls ◀───────│ (launchd, every 10 min)
  │                                 │          claims VALIDATED briefs     │
  │                                 │ status: in_progress ◀───────────────│
  │                                 │                                     │ 3. downloads brief +
  │                                 │                                     │    attachments to
  │                                 │                                     │    ~/FF-dossier-queue/<id>/
  │                                 │                                     │ 4. runs one_engine.py
  │                                 │                                     │    (expand brief → chain
  │                                 │                                     │     → dossier + quote + zip)
  │                                 │ status: in_review ◀─────────────────│ 5. stages workbook in
  │◀── "in engineering review" ─────│ → email to founder                  │    …/<id>/review/
  │    (tracker updates)            │ → email to YOU: "ready for review"  │
  │                                 │                                     │
  │                                 │      6. YOU review the workbook ◀───│ (open it, check it,
  │                                 │                                     │  fix or re-run if needed)
  │                                 │ 7. upload in /studio/<id> ◀─────────│
  │                                 │ status: ready                       │
  │◀── "your Dossier is ready" ─────│ → email to founder with             │
  │    downloads via signed link    │   download link                     │
  │                                 │ 8. (optional) Mark delivered        │
```

## What happens automatically

- **Intake** — the form writes `dossier_projects`, emails you (with a
  /studio link), and emails the founder their private tracker link.
- **First pass** — the launchd job `com.fractionalforge.anvil-runner` polls
  every 10 minutes and claims **validated** briefs only (so a raw anonymous
  submission never auto-runs — your Validate click is the execution gate; this
  also caps spend and closes the attachment-upload race). For each it: claims
  it (status → `in_progress`), pulls the brief + attachments to
  `~/FF-dossier-queue/<project-id>/brief/`, runs
  `serial-design-chain-v2.tsx`, stages the newest `.xlsx` into
  `…/<project-id>/review/`, flips the project to `in_review`, and emails you.
  A rolling **daily cap** (`FF_MAX_RUNS_PER_DAY`, default 20) is a runaway
  backstop.
- **Customer emails** — sent automatically on validated, needs-info, hold,
  decline, ready, and when you mark an NDA sent.

**The NDA rule:** a brief with the NDA box ticked is NOT auto-run, and /studio
will not let you advance it past `validated` either, until you mark the NDA
**signed**. Then the runner picks it up on its next poll.

**Deleting a project (erasure requests):** the "Delete project and all data"
button at the bottom of `/studio/<id>` removes the brief, every attachment and
the dossier from storage plus the row and its history. Also delete the local
`~/FF-dossier-queue/<id>/` folder on this Mac to complete the erasure.

## What is deliberately manual (your judgement)

1. **Review** — open the staged workbook in `~/FF-dossier-queue/<id>/review/`.
   If it's not right, fix and re-run Anvil by hand
   (`npx tsx scripts/serial-design-chain-v2.tsx <brief.md> <out-dir>` — the
   brief is already at `…/<id>/brief/brief.md`).
2. **Deliver** — upload the approved workbook at
   `https://fractionalforge.app/studio/<id>`. That single action flips the
   project to Ready, writes the audit event, and emails the founder their
   signed download link. There is no other delivery path — the upload IS the
   sign-off.
3. **Side states** — needs-info / hold / decline buttons in /studio, each with
   an optional note the customer sees in their email.

## If something goes wrong

- **Chain fails** → project stays `in_progress`, you get a "[Anvil] FAILED"
  email with the log path. Fix, re-run manually, upload in /studio as normal.
- **Runner logs** → per-project `~/FF-dossier-queue/<id>/runner.log` +
  `chain-stdout.log` / `chain-stderr.log`; launchd log `/tmp/ff-anvil-runner.log`.
- **Pause the automation** →
  `launchctl unload ~/Library/LaunchAgents/com.fractionalforge.anvil-runner.plist`
  — everything still works, you just run Anvil by hand.

## Install / config (one-time)

```
cp ops/launchd/com.fractionalforge.anvil-runner.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.fractionalforge.anvil-runner.plist
```

Env (read from the repo's `.env.local` automatically): `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`. Optional overrides:
`FF_QUEUE_DIR`, `FF_NOTIFY_TO`, `ANVIL_CMD` (`{brief}`/`{out}` placeholders),
`FF_CHAIN_TIMEOUT_MS`, `DRY_RUN=1`.

## Privacy invariants (do not weaken)

- Customer files live ONLY in the private `briefs` / `project-dossiers`
  buckets — never in the public `dossiers` bucket (that one serves the
  marketing example).
- All pipeline tables are RLS-deny-all; the only reads are service-role
  server actions. The customer's tracker is keyed by their unguessable token;
  /studio is behind your admin login.
- Downloads are short-lived signed URLs, minted per request.
- One project's data never renders on another project's page: every query is
  keyed by the single project id or token — there are no cross-project lists
  outside /studio.
