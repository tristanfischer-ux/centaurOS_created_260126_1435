# Jarvis Onshape MCP Integration — Plan

> Created 2026-04-21 in response to Reshef's demo — x.com/reshef_/status/2046298277268934852: *"Claude can actually do CAD now in Onshape. Here it worked for an hour and built a 4-part monitor arm, starting only from a sketch and description. The trick was to give it the tools to look at its own work. Introducing: Jarvis Onshape MCP"*.

## What Jarvis is

**Jarvis Onshape MCP** is a Model Context Protocol server that exposes Onshape's API (+ a screenshot tool so Claude can see what it just built) to Claude. The demo: 1 hour of autonomous work → a 4-part parametric monitor arm with a full feature tree.

This is different from everything we do today. Current ForgeOS outputs images and cost estimates. Jarvis enables **real parametric CAD** — sketches, extrudes, mates, feature trees, STEP export — the deliverable engineers actually want.

## Why this matters for ForgeOS

Founders currently get:
- Illustrations (Gemini) — not engineering drawings
- BOMs with specs (Opus) — numbers, not geometry
- Cost estimates (DeepSeek) — pounds, not parts

What they cannot do today:
- Hand a supplier a STEP file
- Run FEA on a module
- Drop a part into an assembly to check fit
- Request a quote with the actual geometry attached

Jarvis closes that gap for "make" parts where geometry matters. Not every part — fasteners and off-the-shelf components stay in the BOM as catalogue refs. But for the 10–30% of parts that are custom-machined, custom-moulded, or custom-welded, real CAD is the unlock.

## Scope of V1 integration

**In scope:**
1. Add Jarvis Onshape MCP as a new specialist role: **"Jax — CAD Engineer (AI specialist)"**. Runs after Max's decomposition + BOM, before Finn's cost estimate (so Finn has real geometry to price against).
2. Per-module "Generate CAD" trigger on the `/modules/[moduleId]` page — founder opts each module in rather than auto-running on every module (cost + time control).
3. Jarvis operates in a founder-linked Onshape document. Output: a URL to the Onshape document + STEP file download + a rendered screenshot for the PDF.
4. Hero "make" parts in the BOM get a **"Generate CAD"** action too, scoped to the single part rather than the whole module.
5. Results persist on `cad_lab_projects.modules[].onshape_doc_url` + `cad_lab_projects.parts[].onshape_doc_url`. PDF export adds a new "Geometry" section that embeds the rendered screenshots + lists Onshape + STEP links.

**Out of scope for V1:**
- Multi-part assemblies (mates across modules). Each module is its own document in V1.
- FEA / simulation triggers. Surface Onshape's built-in FEA in V2.
- Manufacturing prep (DFM checks, tool-path generation). Separate specialist.
- Multi-foundry Onshape workspace sharing. Each foundry connects one account.

## Prerequisites founders must meet

1. **Onshape account.** Free personal tier works for public documents; paid Professional (~£1,100/user/year) needed for private documents. Tell founders up-front in the onboarding flow. Offer a "Use our sandbox Onshape account" fallback for founders who don't want to sign up — their documents live in a ForgeOS-owned public Onshape team and are readable by anyone with the link.
2. **OAuth link.** ForgeOS stores an Onshape OAuth refresh token per foundry (new `foundry_onshape_accounts` table). Link flow on `/settings/integrations/onshape`.
3. **Credit budget.** Each Jax run consumes ~£1–3 of Claude Opus tokens. Founders see the estimated cost before triggering, same pattern as the existing `ai_credits_used` meter.

## Architecture

### Specialist definition

Add Jax to the specialist registry (wherever Max/Fang/Jian/Chase are defined — likely `src/lib/specialists/registry.ts` or similar):

```ts
{
  id: "cad-engineer",
  name: "Jax",
  role: "CAD Engineer",
  model: "claude-opus-4-7",
  description: "Builds parametric CAD geometry in Onshape for make parts. Outputs Onshape document URL + STEP file + rendered hero shot.",
  signatureVoice: "engineering-drawing precise; 'sketch first, extrude second, dimension once' discipline",
}
```

### Data model changes

Three additive migrations (minimal):

1. **`foundry_onshape_accounts`** — stores OAuth refresh tokens + Onshape user metadata per foundry.
   ```sql
   create table foundry_onshape_accounts (
     foundry_id text primary key references foundries(id),
     onshape_user_id text not null,
     onshape_email text,
     oauth_refresh_token_encrypted text not null,
     oauth_refresh_token_expires_at timestamptz not null,
     linked_at timestamptz not null default now(),
     linked_by uuid references auth.users(id),
     usage_tier text check (usage_tier in ('founder-owned', 'sandbox-shared')),
     updated_at timestamptz not null default now()
   );
   ```
   RLS: foundry-scoped SELECT; INSERT/UPDATE only by foundry admins; tokens encrypted at rest with a foundry-specific key via pgsodium (already used elsewhere for Stripe tokens).

2. **Additive columns on `cad_lab_projects.modules[]` JSONB** (no migration — just a type update in `src/lib/cad-lab-types.ts`):
   ```ts
   onshape_doc_url?: string
   onshape_doc_id?: string
   onshape_step_url?: string
   onshape_hero_render_url?: string
   onshape_last_built_at?: string
   onshape_build_status?: "pending" | "building" | "complete" | "failed"
   onshape_build_error?: string
   ```

3. **Same pattern on `parts` table** — new columns `onshape_doc_url`, `onshape_doc_id`, `onshape_step_url`, `onshape_hero_render_url`, `onshape_build_status`, `onshape_last_built_at`.

### Server actions

| File | Purpose |
|---|---|
| `src/actions/forge-v2-jax-generate-module.ts` | Public: `generateCadForModule(projectId, moduleId)`. Fires a Jarvis MCP session and persists results to the module's JSONB slot. |
| `src/actions/forge-v2-jax-generate-part.ts` | Public: `generateCadForPart(projectId, partNumber)`. Same but scoped to one part row. |
| `src/actions/forge-v2-jax-status.ts` | Read-only: returns current build state for UI polling. |
| `src/lib/jax/mcp-client.ts` | Thin wrapper over the MCP connection to Jarvis Onshape MCP. Handles OAuth refresh, tool invocation, session lifecycle. |
| `src/lib/jax/prompts.ts` | Prompt templates for module-scope vs part-scope generation. Includes the "look at your own work" screenshot-feedback pattern Reshef emphasised. |
| `src/lib/jax/upload-artifacts.ts` | Posts the STEP file + hero render to Supabase storage (`forge-cad-artifacts` bucket, new) and returns public URLs. |
| `src/app/(platform)/settings/integrations/onshape/page.tsx` + OAuth callback route | The founder-facing link flow. |

### Vercel-cap problem

**This is the hard part.** Reshef's demo was a full hour. Vercel function maxDuration caps at 300s. We cannot run Jarvis inline in a server action.

**Solution:** run Jax in a queued background job via Supabase Realtime + a dedicated worker container. Three options, in order of preference:

1. **Vercel Sandbox** (GA Jan 2026 per the Vercel knowledge hook). Kick off a sandbox that runs the Jarvis client + Claude loop for as long as needed. Sandbox emits progress events back to Supabase Realtime which the browser subscribes to. **Recommended.**
2. **Dedicated Fly.io / Railway container** with a Supabase-triggered webhook. Same structure, different hosting.
3. **Modal.com function** with a 60-minute timeout. ForgeOS already uses Modal for GenCAD today — incremental setup.

All three require a queue — `jax_build_jobs` table with status machine: `queued → in_progress → complete | failed | abandoned`. A worker polls or subscribes to Realtime. Once complete, writes back to `cad_lab_projects.modules[].onshape_*` and emits an event to the browser to refresh.

### MCP wiring

Jarvis Onshape MCP is a stdio server. The Jax worker launches it as a subprocess + connects via the MCP client library. Claude Opus calls the MCP tools in a loop — sketch → extrude → screenshot → sketch again — until it judges the build complete OR the retry budget is exhausted.

Key safety: **tool-call budget**. Cap at 200 tool calls per job. Reshef's demo was ~120 calls; 200 gives headroom without letting a runaway loop burn hours of compute.

## UI / UX

### Module detail page

Add a "Geometry" card next to the existing Fang review card:

```
GEOMETRY
──────────────────────────────────
○ No CAD yet. Jax hasn't been run on this module.

[ Generate CAD with Jax ]
Estimated cost: £1.50–3.00 · ETA 30-60 min
```

Once running:

```
GEOMETRY
──────────────────────────────────
● Jax is building…
Sketched base plate · Extruded 12mm · Added 4 mounting holes
[ View in Onshape ] (opens current in-progress doc)
```

Once complete:

```
GEOMETRY
──────────────────────────────────
● Built · 12 features · 4 parts in assembly

[Preview image]

[ Open in Onshape ] [ Download STEP ] [ Re-build ]
```

### PDF export

New section 4.5 "Geometry" — one sub-section per module that has Onshape output. Embeds hero render + prints Onshape doc URL + STEP URL + feature count + build timestamp.

### Suppliers page

When a supplier quote lands for a part that has Onshape geometry, the RFQ payload to the supplier includes the STEP download link automatically. Supplier quote form UI adds a "Download geometry" button.

## Cost model + pitfalls

- **Per-module cost:** ~£1.50–3 in Claude Opus tokens (200 tool calls × avg prompt size). Onshape compute is free on the personal tier.
- **Per-part cost:** ~£0.50–1 (single-part models are smaller).
- **Monthly ceiling per founder:** configurable, default 50 module-runs + 200 part-runs. Costs land in the existing `ai_credits_used` meter under a new `jax_cad_generation` category.
- **Failure mode — Jax gets stuck in a loop.** Mitigation: 200-tool-call cap + 60-minute wall-clock timeout. Whichever hits first.
- **Failure mode — Onshape API rate limits.** Mitigation: exponential backoff in the MCP client. Don't let one founder's runaway job block others.
- **Failure mode — the generated CAD is wrong.** Mitigation: Jax writes a self-review note ("what I built, what I'm uncertain about") into the module's JSONB; founders see it before trusting the output for a quote. Frame the UI as *"AI-generated — founder review required before sending to supplier"*.
- **Safety model choice:** Jax should never run tools other than Onshape — don't give it internet fetch, shell, or filesystem access in the worker. MCP client whitelists Jarvis tools only.

## Pilot path — don't build the full stack upfront

Week 1:
- Link Onshape OAuth flow on `/settings/integrations/onshape`
- `foundry_onshape_accounts` migration + encryption
- Manual CLI test of Jarvis MCP + Claude Opus on one real CF-40 module (HVAC system), outside ForgeOS. Goal: prove the build works for a genuinely complex module, not just Reshef's monitor arm.

Week 2:
- Modal function wrapper (fastest since Modal is already in the stack)
- `jax_build_jobs` queue
- Module-scope trigger + polling UI on one module page
- Demo to Tristan before going wider

Week 3:
- Part-scope trigger
- PDF Geometry section
- Supplier RFQ STEP attachment
- Founder UI polish + error recovery states

Ship as experimental behind a flag `jax_cad_generation` (default OFF). Flip for Tristan, then a small beta, then general.

## Red team — known risks before committing

1. **"It worked for a monitor arm" does not mean "it works for a cubesat reaction wheel."** Reshef's demo was a simple assembly with well-known geometry. Industrial modules with non-standard mechanisms may stall the tool-call loop. Pilot on 3–5 real CF-40 modules before signing off on rollout.
2. **MCP server stability.** Jarvis Onshape MCP is a new third-party tool. No SLA. If Reshef takes it down, ForgeOS geometry stops working. Mitigation: fork or vendor the MCP server source into `packages/jarvis-onshape-mcp` when it stabilises.
3. **Onshape TOS on automated account usage.** Need legal read on whether API-driven account activity violates their ToS. If so, negotiate an enterprise plan.
4. **Cost shock.** A founder who runs Jax on 20 modules hits £40–60 in Claude tokens in one afternoon. Surface the estimate PROMINENTLY before each trigger.
5. **Illustrated-vs-real mismatch.** Today's Gemini illustrations are conceptual. Real CAD may look dramatically different. Founders may be confused when the illustration shows a different design than the CAD. Fix: once Jax runs, replace the module illustration with the Onshape hero render, not generate a fresh Gemini one.

## What to decide before starting

1. **Onshape account model:** founder-owned vs sandbox-shared default? (Recommendation: sandbox-shared default, founder-owned upgrade available.)
2. **Queue infra choice:** Vercel Sandbox vs Modal vs Fly.io? (Recommendation: Modal because it's already in the stack.)
3. **Per-founder pricing:** included in Enterprise tier? Pay-as-you-go for lower tiers? (Recommendation: include in Pro + Enterprise; Explorer + Starter see the feature gated behind an upgrade CTA.)
4. **Name:** "Jax" as proposed, or something else? (Current specialists are Max / Fang / Jian / Chase / Finn / Priya / Mia / Sal / Cal / Harper / Leo / Sage / Fiona — Jax fits the short-name pattern.)

---

## Short version

**What:** add a "CAD Engineer" AI specialist (Jax) that uses Jarvis Onshape MCP to build real parametric CAD per module.  
**Why:** current ForgeOS outputs are illustrations + numbers; founders can't give a supplier a STEP file. This closes the gap for make-parts.  
**How:** Modal-worker-based queue runs Claude Opus + Jarvis MCP for 30–60 min per module, persists Onshape doc URL + STEP to project JSONB.  
**When:** 3-week pilot — Week 1 CLI test + OAuth, Week 2 queue + one module, Week 3 UI polish + PDF + RFQ integration.  
**Cost:** ~£1.50–3 per module-run + Modal compute.  
**Risks:** MCP-server stability, complex-geometry failure modes, Onshape TOS, cost shock.

Nothing to build today. Plan exists. Next step is the Week-1 CLI spike to prove the core works on a real ForgeOS module, not a monitor arm.
