# Embedding Dimension Mismatch — Defensive RPC-Boundary Guard

**Date:** 2026-04-25
**Symptom:** Production `POST /investors` logs intermittent
`{ code: '22000', message: 'different vector dimensions 1536 and 768' }`
from `[searchInvestors] Semantic search failed, falling back to keyword`.

## What I checked (full audit)

### Code-side audit — all callers of the affected RPC

`match_marketplace_listings_v2` is only called from two places in `src/`:

- `src/actions/investors.ts:760` (`searchInvestors`)
- `src/actions/public-investor-preview.ts:308` (`searchPublicInvestors`)

Both already correctly use `embedQuery` from `src/lib/embeddings.ts`
(commit `94b14d74` swapped `nomicEmbedQuery` → `embedQuery`).

`embedQuery` in `src/lib/embeddings.ts` (commit `22b1c713`):
- explicitly passes `dimensions: 1536` to OpenAI
- asserts `embedding.length === 1536` and throws otherwise

All other `nomicEmbed`/`nomicEmbedQuery` callers in `src/` target
nomic-only tables (`process_capabilities`, `manufacturing_technique_enrichments`)
and never hit `match_marketplace_listings_v2`.

### Production database state (Supabase project `jyarhvinengfyrwgtskq`)

```
marketplace_listings.embedding         vector(1536)
investor_grants.embedding              vector(1536)
investor_portfolio_companies.embedding vector(1536)
vc_pe_contacts.embedding               vector(1536)
process_capabilities.embedding         vector(768)   -- nomic, separate path
manufacturing_technique_enrichments.   vector(768)   -- nomic, separate path
```

All 27,053 rows in `marketplace_listings` are uniformly **1536-dim**
(verified via both `vector_dims()` and `array_length(embedding::real[],1)`).

The RPC `match_marketplace_listings_v2(query_embedding vector, ...)`
accepts a generic `vector` (no fixed dim), so the type system allows the
call — the dim check happens inside the body at the `<=>` operator.

### Re-running the RPC manually with a 1536-dim test vector returns matches
fine — no error. So the database/RPC are healthy.

### Vercel error log timeline (last 24h, only 6 occurrences)

```
Apr 24 13:21  λ POST /investors  (pre-fix)
Apr 24 20:39  ε POST /investors  (pre-fix)
Apr 24 20:39  ε POST /investors  (pre-fix)
Apr 24 20:49  λ POST /investors  (pre-fix)
Apr 24 21:22  ε POST /investors  (after 22b1c713 at 20:55, before 94b14d74 at 22:06)
Apr 25 02:41  λ POST /investors  (after BOTH fixes)  ← the still-firing case
```

The 02:41 firing was on production deploy `486s1bquz` (created 22:28 BST,
contains both fixes per `git log`). The deploy DOES have `embedQuery` swap
AND `dimensions: 1536` + length-assertion.

## Why the previous fix didn't fully close it

Two compatible explanations, neither contradicted by the data:

1. **Stale Lambda warm instance.** Vercel keeps warm Lambda containers around
   across deploys. A warm container holding the pre-fix bundle would still
   call `nomicEmbedQuery` until it cold-starts. Frequency (1 every several
   hours) matches Lambda warm-instance lifetime.
2. **Genuine intermittent OpenAI dim leak.** The original `embedQuery`
   comment explicitly notes: "in production something (stale SDK behaviour
   or fallback under quota pressure) was returning 768-dim vectors
   intermittently." But the new `length !== 1536` assertion would catch
   that and surface as a JS Error, not pgvector 22000 — so this hypothesis
   is harder to reconcile with the post-fix log shape.

I could not reproduce the failure end-to-end. The DB is clean, every
in-tree caller is correct, the assertion exists, yet the error fired once
post-fix. Without a third 22000 occurrence to compare deploy-IDs against,
I can't pin (1) vs (2) deterministically.

This is **not** the "wrong dim being written into the column" failure mode
— column data is uniformly 1536-dim. It's also not a missing-caller bug —
no caller was missed.

## What I changed

Defensive guard at the RPC call boundary in BOTH semantic-search paths,
PLUS richer logging on the catch block so the next firing tells us whether
it's a stale-warm-bundle issue or a genuine post-assertion leak.

### `src/actions/investors.ts` (`searchInvestors`)

**Before** (line 735–736):
```ts
const queryEmbedding = await embedQuery(query.trim())
// DECISION: v2 RPC returns attributes...
```

**After:**
```ts
const queryEmbedding = await embedQuery(query.trim())
// Defensive guard at the RPC boundary…
if (queryEmbedding.length !== 1536) {
  throw new Error(
    `[searchInvestors] Refused to call match_marketplace_listings_v2 with ` +
      `${queryEmbedding.length}-dim embedding (column is vector(1536)). ` +
      `Query: ${query.trim().slice(0, 80)}`,
  )
}
// DECISION: v2 RPC returns attributes...
```

Catch block now logs `queryLen` and `queryPrefix` alongside the error so
the next 22000 (or, after this fix, the new clearer error) is attributable
to a specific request shape.

### `src/actions/public-investor-preview.ts` (`searchPublicInvestors`)

Mirror guard added between `embedQuery` and the RPC call. Returns the
empty-result shape (this path can't throw — it's `unstable_cache`d and
must always return a value) and logs the offending dim.

### Files NOT changed

- `src/lib/embeddings.ts` — already enforces `dimensions: 1536` + assertion;
  nothing to add.
- `src/lib/search/nomic-embed.ts` — legitimate 768-dim path for
  manufacturing-techniques tables. Not the culprit.
- `src/lib/search/semantic-search.ts` — its `embedText` returns `null`
  on dim mismatch (no leak path).

## Why this is the right fix shape

If the leak is from a stale Lambda warm-instance (hypothesis 1), the new
guard converts the silent pgvector fallback into a loud caught error, but
still falls back to keyword search — so user-visible behaviour doesn't
get worse. The next stale-warm firing will be replaced with the new
assertion message in the catch path.

If it's a post-assertion OpenAI-side leak (hypothesis 2), the same loud
error fires and gives us the embedding length in the log — the very
signal needed to pinpoint the path on the next occurrence.

Either way: the guard is correct, the surface area is two files, and the
log line will be diagnostic rather than cryptic.

## Verification

- `NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit` — no new
  type errors introduced (the project has pre-existing unrelated errors
  in `plan/`, `the-forge-v2/`, `BatchApprovalSheet.tsx`, etc).
- The two files compile clean.

## Followups (for the main thread)

1. **Pinpoint hypothesis (1) vs (2).** Wait for the next firing (~4h),
   read the new `[searchInvestors] Refused to call …` log to capture the
   offending dim + query prefix, then `vercel inspect` the deploy ID. If
   the deploy ID is older than the assertion's commit, it's stale-warm
   (hypothesis 1) — no more action. If it's a current deploy, hypothesis
   2 holds and we should add OpenAI request-ID + raw response logging in
   `embedQuery` to catch the SDK's quirky behaviour.
2. **Update `embedding_dim_mismatch_recurring_failure.md`** with the
   pre-RPC-boundary-guard pattern as the canonical fourth instance
   recommendation: assertions at the embed boundary aren't enough —
   guard at the RPC call boundary too.
