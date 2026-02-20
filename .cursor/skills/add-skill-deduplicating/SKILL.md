---
name: add-skill-deduplicating
description: When the user asks to add, put in, or create a new skill: inventory existing skills, avoid duplication, then add the skill efficiently and without bloat. Use when the user says add skill, put in a skill, create a skill, install a skill, or new skill.
---

# Add Skill (Deduplicating)

Follow this workflow whenever the user asks to **add**, **put in**, or **create** a new skill. It ensures no duplication, correct placement, and minimal bloat.

## Workflow

### Step 1: Clarify intent

What should the new skill do? Get one sentence: **purpose** + **when to use it**. If the user was vague, ask once: "What should this skill do, and when should the agent use it?"

### Step 2: Inventory existing skills

- List all skills in **project**: `.cursor/skills/**/SKILL.md` (use glob or list_dir).
- List all skills in **global** (if available): `~/.cursor/skills/**/SKILL.md`.
- For each skill, read the **name** and **description** from the frontmatter (and optionally the first 2–3 lines of the body) to understand scope.

### Step 3: Check for overlap

Compare the requested purpose to existing names and descriptions.

- If an existing skill **already covers** the same scope → do **not** create a new skill. Tell the user which skill covers it and stop.
- If an existing skill **could be extended** with a small addition to cover the request → do **not** create a new skill. Propose extending that skill instead and show the user the option (e.g. "Skill X already exists; I can add a section for Y. Proceed?")
- Only if **no overlap** → continue to Step 4.

### Step 4: Decide location

- **Project-only / repo-specific** → `.cursor/skills/<skill-name>/`
- **Cross-project / personal** → `~/.cursor/skills/<skill-name>/`

Do **not** create the same logical skill in both places. Choose one based on scope.

### Step 5: Create minimally

Create **one** `SKILL.md` with:

- Frontmatter: `name` (lowercase, hyphens), `description` (when to use it).
- Short role or mission only if it helps (1–2 sentences).
- Clear steps or workflow.
- 1–2 anti-patterns for the skill’s domain.

Do **not** add `references/` or extra files unless the user explicitly asks or the skill is genuinely complex (e.g. 300+ lines). Keep length and redundancy low. For structure and quality, follow **skill-builder** (`.cursor/skills/skill-builder/SKILL.md`); for file layout and metadata, follow **create-skill** (`~/.cursor/skills-cursor/create-skill/SKILL.md`).

### Step 6: Confirm

Tell the user:

- What was **created** (path and one-line summary), or
- What was **skipped** and why (e.g. duplicate, extended existing instead), and where the skill lives.

## Rules

- Never create a new skill without first listing and checking existing skills in both project and global directories.
- If an existing skill’s description or name clearly covers the requested behavior, do not create a duplicate; offer to extend that skill instead.
- One primary `SKILL.md` per skill; add `references/` or extra files only if the user asks or the skill is genuinely complex (e.g. 300+ lines).
- Do not create the same logical skill in both project and global; choose one location based on scope.

## Anti-patterns

- **BAD:** Creating a new skill without checking existing skills. **WHY:** Causes duplicate or overlapping skills and bloat.
- **BAD:** Adding a second skill that does "almost the same" as an existing one. **WHY:** Prefer one extended skill over two similar ones.
- **BAD:** Long prose, multiple reference files, or repeated content from other skills. **WHY:** Bloat makes skills harder to maintain and load.
- **BAD:** Creating in both `.cursor/skills/` and `~/.cursor/skills/` for the same purpose. **WHY:** Duplication and ambiguity about which one runs.

## Related skills

- **skill-builder** — Use for structure and quality (role, mission, method, anti-patterns).
- **create-skill** — Use for file layout, directory structure, and metadata.

This skill adds the **inventory → dedupe → place → create minimal** flow on top of those.
