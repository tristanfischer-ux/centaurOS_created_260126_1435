# Agent Lightning–Style Training Scripts

Minimal out-of-band pipeline for reading agent rollouts/spans and running prompt optimization (APO) or RL. The Next.js app records rollouts and spans; this script reads them and can write improved prompts back.

## Setup

```bash
cd scripts/agent-lightning
pip install -r requirements.txt
cp .env.example .env   # then set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
```

## Environment

- `SUPABASE_URL` – Project URL (e.g. `https://xxx.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` – Service role key (bypasses RLS; keep secret)

Use the service role so the script can read all `agent_rollouts` and `agent_spans` regardless of user.

## Run APO Stub

```bash
python run_apo_stub.py
```

This script:

1. Fetches recent rollouts with reward and their spans from Supabase.
2. Runs an **APO stub** (no real optimization yet): aggregates (prompt, response, reward) per agent and prints a summary.
3. Documents where to **write results**: improved prompt text can be written to `agent_custom_prompts.default_prompt` (or a future `prompt_versions` table) for the app to use.

To integrate a real APO algorithm (e.g. Agent Lightning’s APO or a custom search over prompt variants), replace the stub in `run_apo_stub.py` with your implementation and add the write step to Supabase.

## Writing Prompts Back

- **Option A:** Update `agent_custom_prompts.default_prompt` for a given prompt row (by id or by foundry + title). Use the Supabase client with the service role; RLS allows the app to read prompts by foundry.
- **Option B:** Add a `prompt_versions` table (e.g. `prompt_id`, `version`, `body`, `trained_at`, `metric`) and have the app resolve “latest trained” vs “baseline” for A/B or gradual rollout.

## Data Shape

- **agent_rollouts:** `id`, `foundry_id`, `user_id`, `agent_id`, `status`, `reward`, `reward_source`, `rewarded_at`, `created_at`, `metadata`
- **agent_spans:** `rollout_id`, `kind`, `prompt_snapshot`, `response_snapshot`, `prompt_tokens`, `completion_tokens`, `metadata`, `created_at`

Training jobs typically use (prompt_snapshot, response_snapshot, reward) as (input, output, signal) for APO or RL.
