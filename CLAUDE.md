# Agent Workflow Directives

This file contains meta-agent behavior directives that influence HOW work is approached, not code standards.

## 1. Plan Mode Default

- **Enter plan mode for ANY non-trivial task** (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

## 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

## 3. Verification Before Done

- **Never mark a task complete without proving it works**
- **Test it yourself. Don't ask the user to test things you can test.** Write scripts, hit endpoints, use the browser — whatever it takes. Only involve the user if there's a genuine blocker (e.g., needs their physical device, requires their credentials interactively, or needs a judgment call on UX).
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness
- For UI changes: visually verify the change looks correct
- For API changes: test the endpoint manually
- For database changes: verify data integrity

## 4. Bug Fixing Strategy

1. **First attempt:** Analyze the bug and try a direct fix
2. **If user says "still doesn't work":** STOP IMMEDIATELY.
   - **Switch to Plan Mode** - Do NOT try another fix
   - Re-analyze: What assumptions might be wrong?
   - Think through: What other root causes are possible?
   - Create explicit debugging plan before any more code changes
   - Write a test that reproduces the bug
   - Spawn subagent(s) to fix it if needed
   - Prove fix works via passing test

**Key: Only ONE attempt before escalating to plan mode. No shotgun debugging.**

Why plan mode? If your first fix didn't work, your mental model of the problem is likely wrong. More attempts with the same wrong model will keep failing. Plan mode forces you to step back, re-evaluate assumptions, and approach the problem fresh.

- Zero context switching required from the user
- Go fix failing CI tests without being told how
- If you can read the error, you can fix the error

## 4b. Supabase Is Your Job

**ALL Supabase operations are the agent's responsibility. Never ask. Never offer. Just do it.**

When you create or modify a migration:
1. Push it: `npx supabase db push`
2. Regenerate types: `npx supabase gen types typescript --linked > src/types/database.types.ts`
3. Clean up any temporary type workarounds
4. Verify the build: `npx tsc --noEmit`

This applies in ALL contexts — during feature work, during deploys, during bug fixes. The user should never have to think about Supabase.

## 5. Session Start

At the start of each session on this project:
1. **Read `~/.memory/master-preferences.md`** for working style, preferences, and things to avoid
2. Check `~/.memory/carry-forward.md` for pending items across all projects
3. Check `tasks/lessons.md` for project-specific patterns to avoid
4. Check `tasks/todo.md` for any in-progress work
5. Check `AGENT_HANDOVER.md` if continuing from another session

The master preferences document is the most important read -- it tells you how Tristan likes to work, what he values, and what to avoid. Internalize it before starting any work.

## 6. Session End / Memory Logging

When completing significant work:
1. Log entries to `~/.memory/daily/YYYY-MM-DD.md` with appropriate tags (#ForgeOS)
2. **Include Preference Signals** in log entries when corrections or preferences were expressed
3. **Run distillation:** Analyze today's log entries, extract preference signals, update `~/.memory/master-preferences.md`
4. For incomplete work, update carry-forward with clear next steps
5. See skill: `~/.cursor/skills/project-memory/SKILL.md` for logging protocol
6. See skill: `~/.cursor/skills/preference-distill/SKILL.md` for distillation protocol
