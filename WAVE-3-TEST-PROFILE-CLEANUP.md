# Wave 3 — Red-Team Test Profile Cleanup

**Date:** 2026-04-25
**Branch:** feat/forge-v2-cutover
**Executed via:** Supabase MCP against project `jyarhvinengfyrwgtskq` (production ForgeOS)

## Profiles deleted

| auth.users.id | email | profile | foundry |
|---|---|---|---|
| `e60b8a76-29dc-416f-9866-6686aaef51ba` | redteam-iter1-1777117373@example.com | none (incomplete signup) | none |
| `6776d5a1-e6cd-4b1f-bc55-cf0d02566bda` | redteam-iter1c-1777118012@example.com | none (incomplete signup) | none |
| `84770f0e-feb7-4218-a339-9c109da1f6e2` | redteam-iter1d-1777118221@example.com | full profile | sandbox-84770f0e |
| `e6dfe15e-e4e0-4b5b-9a54-5b57d3d9b02e` | redteam-iter4-1777119559@example.com | full profile | sandbox-e6dfe15e |

## Deletion order

1. `foundry_memberships` — 2 rows removed (the two users with full profiles)
2. `xray_scans` — 6 rows removed (sandbox scans created during red-team walks)
3. `profiles` — 2 rows removed
4. `foundries` — 2 rows removed (sandbox-84770f0e, sandbox-e6dfe15e, both is_sandbox=true)
5. `auth.users` — 4 rows removed (all four test accounts fully purged)

## Verification

```sql
SELECT count(*) FROM auth.users WHERE email LIKE 'redteam%' OR email LIKE '%@example.com';
-- Returns: 0
```
