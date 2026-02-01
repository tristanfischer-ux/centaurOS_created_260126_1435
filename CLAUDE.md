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
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness
- For UI changes: visually verify the change looks correct
- For API changes: test the endpoint manually
- For database changes: verify data integrity

## 4. Autonomous Bug Fixing

- When given a bug report: **just fix it**. Don't ask for hand-holding
- Point at logs, errors, failing tests - then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how
- If you can read the error, you can fix the error

## 5. Session Start

At the start of each session on this project:
1. Check `tasks/lessons.md` for relevant patterns to avoid
2. Check `tasks/todo.md` for any in-progress work
3. Check `AGENT_HANDOVER.md` if continuing from another session
