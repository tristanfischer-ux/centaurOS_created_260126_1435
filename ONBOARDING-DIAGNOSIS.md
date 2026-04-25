# Signup P0 — Onboarding Diagnosis (2026-04-25)

## Evidence collected

- **Vercel logs** (`vercel logs --since 24h --level error -x` and `-q "signup"`): zero `λ POST /join` and zero server-action invocations matching `signup` in the last 24 h. Errors present in the same window are unrelated (`/investors`, `/today`, `/api/agents/execute`, OpenAI `max_tokens` warnings).
- **Supabase auth logs** (`mcp__claude_ai_Supabase__get_logs(jyarhvinengfyrwgtskq, "auth")`): only routine `GET /user` polls. Zero `POST /signup`, `POST /token`, zero `POST /admin/users` for the test window or anywhere in the 24 h sample.
- **Rate limits table** (`SELECT … FROM rate_limits WHERE key LIKE '%signup%'`): empty. The IP rate limiter has not been reached because no signup ever entered the action.
- **Vercel BotID / firewall**: no `@vercel/firewall`, no `@vercel/botid`, no `protect()`, no Turnstile / hCaptcha / reCAPTCHA in the repo. `next.config.ts` has CSP but `form-action 'self'` permits same-origin server-action POSTs. `middleware.ts` only handles ops-subdomain isolation, legacy redirects, plan-route flag, Supabase session refresh — nothing blocks `/join` POST.
- **Sentry**: enabled via `next.config.ts` + `instrumentation.ts` `onRequestError`. Tristan can check Sentry for the project named in `SENTRY_PROJECT` for client-side `TypeError`s on `/join` between his test timestamps.

**Conclusion: the click never reaches the server. The block is in the browser.**

## Root cause hypothesis (ranked)

### 1. The `passwordValue` `onChange` is wired to the **password** input only, not used for any disabled-gate — but `passwordMismatch` IS in the disabled gate. `confirmPassword` is a fully controlled input. (likelihood: HIGH)

`src/app/join/page.tsx:141` defines `passwordMismatch = confirmPassword.length > 0 && passwordValue !== confirmPassword`. Submit button at line 671 (and 327 for supplier flow) uses `disabled={isPending || passwordMismatch}`.

If the user types into Password, then into Confirm Password, both fields populate state correctly via React. **But** the Password input at line 273-287 / 534-548 has `defaultValue=""` (uncontrolled write) and `onChange={(e) => setPasswordValue(e.target.value)}` — that wiring is fine for keyboard input.

Where this bites: **password-manager autofill** (1Password, Chrome's built-in, Bitwarden) often sets `.value` directly without firing a synthetic React `onChange`. Result: the visible Password field shows a value, but `passwordValue` state stays `""`. The user types matching values into Confirm Password, `confirmPassword.length > 0`, `passwordValue === ""` is not equal to `confirmPassword`, so `passwordMismatch === true`, button is `disabled`, click does nothing. **No "Passwords do not match" message renders below Confirm Password if the user typed the same string into both, because they did — but the comparison fails because Password's React state is stale.**

This matches the symptoms exactly: silent click, no toast, no error, no spinner, no network request. And it would silently kill any user who autofills credentials, which is most of them.

### 2. A JS error inside `JoinPageInner` short-circuits before the form binds (likelihood: MEDIUM)

`useSearchParams`, `lookupReferrer`, `getDemoAccountData`, `framer-motion` `<motion.div>` wrappers, `<AnimatePresence>` are all in the same render tree. A throw inside `lookupReferrer(refCode).then(...)` would be unhandled-promise (no impact on form). But a render error in `<PasswordStrength>` (line 27 import) or framer-motion would unmount the form. Sentry should already have captured this — first place Tristan can verify.

### 3. Suspense boundary swallow (likelihood: LOW)

The page wraps everything in `<Suspense fallback={<div className="min-h-screen bg-background" />}>`. If `useSearchParams` suspends and never resolves (it shouldn't, App Router resolves on initial render), the user would see a blank page rather than a working form. Tristan reports the form renders, so this is not it.

### 4. CSP/form-action (likelihood: VERY LOW)

CSP includes `form-action 'self'`. Same-origin form submission is allowed. Ruled out.

### 5. Vercel BotID (likelihood: ZERO)

Not installed.

## ONE recommended next step (definitive)

**Tristan opens https://fractionalforge.app/join in Chrome with DevTools Console + Network tab open, and:**
1. Pastes a real-looking email + a strong password into Password using a password manager autofill (the way real users sign up).
2. Types the same password into Confirm Password manually.
3. Clicks CREATE ACCOUNT.

**Then he tells me one thing:** is the CREATE ACCOUNT button greyed-out (`opacity-70`) or normal? If greyed-out, it's hypothesis 1 (autofill state desync) — confirmed. If not greyed-out and there's still no Network entry on click, screenshot Console for any red error, that's hypothesis 2.

If we can't get him to a desktop browser fast, an equally-fast verification is: temporarily comment out `passwordMismatch` from the `disabled` prop and ship to a preview deploy. If signup starts working there, hypothesis 1 confirmed.

## Proposed patch (do not apply yet — confirm first)

`src/app/join/page.tsx` — make Password fully controlled and read confirm-mismatch from DOM as fallback so password-manager autofill can't desync state:

Before (lines 273-287 and 534-548, both blocks):
```tsx
<Input
  id="password"
  name="password"
  type="password"
  placeholder="Create a strong password"
  defaultValue=""
  onChange={(e) => setPasswordValue(e.target.value)}
  ...
/>
```

After:
```tsx
<Input
  id="password"
  name="password"
  type="password"
  placeholder="Create a strong password"
  value={passwordValue}
  onChange={(e) => setPasswordValue(e.target.value)}
  onBlur={(e) => setPasswordValue(e.currentTarget.value)} // catch autofill
  ...
/>
```

And replace the disabled gate so a stale state never blocks a real submit. Lines 327 and 671:
```tsx
disabled={isPending}
```
…and move the mismatch check into the action layer (already covered: server action will reject mismatched passwords if needed, but currently there's no confirm field in `formData` since the Confirm Password input has no `name`). Add `name="password_confirm"` to the confirm input and have `signup.ts` reject when it's set and not equal — this is the **defensive, not-trust-the-client** version Tristan would want.

## Risk callouts

- **Don't simply remove `passwordMismatch` from the disabled gate without adding server-side check.** Users who genuinely typed mismatched passwords will silently create accounts with whatever was in Password — which is usually fine (Confirm is UX, not security) but it'll surprise a user who thinks they typed "MyDog123!" and actually created an account with "MyDog123" because of a missed character.
- **Making Password a controlled input requires an `onBlur` setter** to catch password-manager autofill that bypasses React synthetic events. Without that, hypothesis 1 just moves to a different failure mode.
- **`PasswordStrength` already reads `passwordValue`** — if it shows zero strength when the user has clearly typed a password, that's an immediate visual confirmation of state desync, and it's been hiding in plain sight on the form. Tristan should look for this in his next test.
- **Sentry first** before patching. If hypothesis 2 (a render error) is the real cause, the patch above does nothing. The 60-second Sentry check is free and rules it out.
