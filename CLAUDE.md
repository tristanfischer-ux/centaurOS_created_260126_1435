# ForgeOS (CentaurOS) — Agent Directives

> **Architecture:** See [ARCHITECTURE.md](./ARCHITECTURE.md).
> **Lessons learned:** See [tasks/lessons.md](./tasks/lessons.md) — read at session start, update after every correction.
> **Sub-agent model selection:** See `~/.claude/CLAUDE.md` for auto-toggle rules. Re-grep `src/lib/agents/specialists-config.ts` if uncertain.

---

## Reference Documents — Read When Relevant

| When the task involves... | Read |
|---|---|
| Debugging autopilot / pipeline / production failures | `~/.claude/docs/forgeos/forgeos-debugging.md` |
| Implementation, autonomous execution, iteration loops, database security | `~/.claude/docs/forgeos/forgeos-execution-standards.md` |
| Dispatching sub-agents, parallel work, briefing templates | `~/.claude/docs/forgeos/forgeos-subagent-rules.md` |
| UI components, layout, colours, spacing, forms, design philosophy | `~/.claude/docs/forgeos/forgeos-design-system.md` |
| TypeScript patterns, imports, error handling, documentation | `~/.claude/docs/forgeos/forgeos-code-standards.md` |
| Specialist configs, model swaps, benchmarking, live mapping table | `~/.claude/docs/forgeos/forgeos-specialist-protocol.md` |
| Architecture decisions, schema changes, security review | `~/.claude/docs/forgeos/forgeos-red-team.md` |
| Building or porting from a static HTML mockup | `~/.claude/docs/mockups.md` |

---

## Company Identity

- **CORRECT:** "Fractional Forge" (company), "ForgeOS" (product), "Forge teams" (users)
- **WRONG:** Centaur Dynamics, CentaurOS, Centaur teams
- Apply to: page titles, UI copy, meta tags, documentation
- Do NOT change: git repo URLs, migration files, foundry IDs, font/image filenames, Sentry project, Docker names
<!-- autoskills:start -->
<!-- autoskills:end -->
