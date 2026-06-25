# CI fix — needs your hand (workflow token scope)

CI is red on every push because `.github/workflows/ci.yml` runs raw `npx tsc --noEmit`
against 341 long-standing type errors (the app deploys via Next.js `ignoreBuildErrors`).
The intended gate is `npm run typecheck:baseline` (already used by the pre-push hook),
which accepts the captured baseline and fails only on NEW regressions.

I CANNOT push this — the PAT has only `repo` scope, not `workflow` (GitHub refuses to let
a PAT update files under `.github/workflows/` without it), and there is no SSH key configured.

## The one-line change (in `.github/workflows/ci.yml`, the "Type check" step)
```diff
-      - name: Type check
-        run: npx tsc --noEmit
+      - name: Type check (baseline)
+        run: npm run typecheck:baseline
         env:
           NODE_OPTIONS: "--max-old-space-size=6144"
```

## To apply (pick one)
1. Edit ci.yml in the GitHub web UI (the web editor has workflow scope) — paste the change above.
2. OR grant the PAT `workflow` scope (GitHub → Settings → Developer settings → the token) and tell me — I'll push it.
