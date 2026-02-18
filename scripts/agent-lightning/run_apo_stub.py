#!/usr/bin/env python3
"""
Minimal script: read agent_rollouts + agent_spans from Supabase, run an APO stub,
and document where to write improved prompts.

Run from repo root or scripts/agent-lightning with:
  python run_apo_stub.py

Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in env or .env.
"""

import os
import sys
from decimal import Decimal

try:
    from supabase import create_client, Client
except ImportError:
    print("Run: pip install -r requirements.txt", file=sys.stderr)
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def get_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env)", file=sys.stderr)
        sys.exit(1)
    return create_client(url, key)


def fetch_rollouts_with_spans(supabase: Client, limit: int = 500):
    """Fetch recent finished rollouts and their spans. Uses service role so RLS is bypassed."""
    r = supabase.table("agent_rollouts").select(
        "id, foundry_id, user_id, agent_id, status, reward, reward_source, rewarded_at, created_at, metadata"
    ).eq("status", "finished").order("created_at", desc=True).limit(limit).execute()

    rollouts = r.data or []
    if not rollouts:
        return []

    rollout_ids = [x["id"] for x in rollouts]
    s = supabase.table("agent_spans").select(
        "rollout_id, kind, prompt_snapshot, response_snapshot, prompt_tokens, completion_tokens, metadata, created_at"
    ).in_("rollout_id", rollout_ids).execute()

    spans_by_rollout: dict = {}
    for row in (s.data or []):
        rid = row["rollout_id"]
        if rid not in spans_by_rollout:
            spans_by_rollout[rid] = []
        spans_by_rollout[rid].append(row)

    for ro in rollouts:
        ro["spans"] = spans_by_rollout.get(ro["id"], [])
    return rollouts


def apo_stub(rollouts: list) -> dict:
    """
    Stub: aggregate (prompt, response, reward) per agent_id and return a minimal
    summary. Replace this with a real APO implementation (e.g. Agent Lightning APO
    or custom prompt search) that outputs improved prompt text per agent/template.
    """
    by_agent: dict = {}
    for ro in rollouts:
        agent_id = ro.get("agent_id") or "unknown"
        if agent_id not in by_agent:
            by_agent[agent_id] = {"count": 0, "reward_sum": Decimal("0"), "reward_count": 0}
        by_agent[agent_id]["count"] += 1
        reward = ro.get("reward")
        if reward is not None:
            by_agent[agent_id]["reward_sum"] += Decimal(str(reward))
            by_agent[agent_id]["reward_count"] += 1

    summary = {}
    for agent_id, agg in by_agent.items():
        avg = float(agg["reward_sum"] / agg["reward_count"]) if agg["reward_count"] else None
        summary[agent_id] = {"rollouts": agg["count"], "rewarded": agg["reward_count"], "avg_reward": avg}
    return summary


def main():
    supabase = get_supabase()
    rollouts = fetch_rollouts_with_spans(supabase, limit=200)
    print(f"Fetched {len(rollouts)} rollouts (finished).")
    if not rollouts:
        print("No data yet. Run some agent flows (e.g. specialist execute, voice-to-task) then re-run.")
        return

    summary = apo_stub(rollouts)
    print("\nAPO stub summary by agent_id:")
    for agent_id, s in sorted(summary.items()):
        print(f"  {agent_id}: rollouts={s['rollouts']}, rewarded={s['rewarded']}, avg_reward={s['avg_reward']}")

    print("\nNext steps:")
    print("  - Replace apo_stub() with a real APO algorithm that produces improved prompt text.")
    print("  - Write results to agent_custom_prompts.default_prompt (or prompt_versions table).")


if __name__ == "__main__":
    main()
