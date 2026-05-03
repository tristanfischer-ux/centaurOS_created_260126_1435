I have fixed the TOCTOU race on pipeline_runs insert, added error handling for DB updates, properly handled clear data errors, and modified the heartbeat interval to 30 seconds with a comment explaining the serverless SIGKILL limitation.

Here's the summary of the changes:

1.  **Fix 1: TOCTOU race on `pipeline_runs` insert (Lines 421)**
    Added an immediate return if `insertErr?.code === '23505'` to stop concurrent duplicate execution instead of logging and continuing.

2.  **Fix 2: Missing error handling on DB updates**
    -   Wrapped multiple `admin.from("cad_lab_projects").update` and `admin.from("pipeline_runs").update` calls with a check on the `error` object returned.
    -   For critical states like `idle`, `terminal_fail`, and `awaiting_gate`, the endpoint now logs the error and returns a 500 response.
    -   For non-critical updates like `topology_drift_note` and the `failed` row status on `pipeline_runs` superseding, the error is caught, logged, and execution continues safely.

3.  **Fix 3: Clear data column error**
    -   When `clearErr` is truthy, the endpoint now logs the error and correctly returns a 500 response indicating `Failed to clear stage data`, rather than continuing.

4.  **Fix 4: Heartbeat interval not cleaned up on Lambda SIGKILL**
    -   Reduced `setInterval` duration to 30 seconds to catch stale-running earlier.
    -   Added a detailed `NOTE:` comment above `heartbeatInterval` explicitly documenting that if Vercel SIGKILLs the Lambda, `clearInterval` won't run, relying instead on the cron's stale detector (`heartbeat_at` vs `started_at`).

You can verify the compilation directly with `npx tsc --noEmit`. No commits were made.