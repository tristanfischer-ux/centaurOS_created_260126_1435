---
name: changelog-generator
description: Generate user-facing changelogs from git commits. Use when preparing release notes, creating product updates, documenting changes for users, writing changelog entries, or when the user mentions changelog, release notes, what changed, update summary, or version notes. Transforms technical commits into customer-friendly release notes.
---

# Changelog Generator

Transform technical git commits into polished, user-friendly changelogs.

## When to Use

- Preparing release notes for a new version or deployment
- Creating weekly or monthly product update summaries
- Documenting changes before a Vercel deployment
- Writing update notifications for users
- Maintaining a public changelog / product updates page

## Process

### Step 1: Determine Scope

Ask or infer the time range:

```bash
# Since last tag
git log $(git describe --tags --abbrev=0)..HEAD --oneline

# Since a specific date
git log --since="2026-01-01" --oneline

# Last N commits
git log -20 --oneline

# Between two commits/branches
git log main..HEAD --oneline
```

### Step 2: Analyse Commits

Read all commits in range and categorise each:

| Category | Icon | Includes |
|----------|------|----------|
| New Features | New | New user-facing functionality |
| Improvements | Improved | Enhancements to existing features |
| Bug Fixes | Fixed | Fixes to broken behaviour |
| Security | Security | Security patches, vulnerability fixes |
| Breaking Changes | Breaking | Changes requiring user action |
| Performance | Performance | Speed/efficiency improvements |

**Filter out** (don't include in user changelog):
- Refactoring (no user-visible change)
- Test additions/fixes
- CI/CD changes
- Dependency updates (unless security-related)
- Code style/linting fixes
- Internal tooling changes

### Step 3: Translate to User Language

Transform developer-speak into customer-speak:

| Git Commit (Technical) | Changelog Entry (User-Friendly) |
|------------------------|--------------------------------|
| `fix: null check on task assignee query` | Fixed issue where unassigned tasks wouldn't load |
| `feat: add review_gates table with RLS` | Added review gates - expert review checkpoints on tasks |
| `refactor: extract HireExpertCTA component` | *(Skip - internal refactor, no user-visible change)* |
| `feat: seed manufacturing objective packs` | New manufacturing objective packs: DFM Review, Quality Systems, Production Readiness |
| `fix: marketplace search returns 0 for mfg` | Fixed marketplace search for manufacturing listings |
| `perf: batch task queries in home page` | Home page now loads significantly faster |

### Step 4: Format

Use this standard format:

```markdown
# [Version or Date] - [Optional Title]

## New Features

- **[Feature Name]**: [1-2 sentence description of what users can now do]

## Improvements

- **[Area]**: [What got better and why users should care]

## Bug Fixes

- Fixed [description of what was broken and that it now works]

## Security

- [Description of security improvement]

## Breaking Changes

- **[What changed]**: [What users need to do differently]
```

### Step 5: Output

Write the changelog to one of:
- `CHANGELOG.md` (append at top, below header)
- Console output (for review before committing)
- A specific file the user requests

## Example Output

```markdown
# February 6, 2026 - Manufacturing & Review Gates

## New Features

- **Review Gates**: Add human review checkpoints to any task or objective.
  Experts, peers, or quality reviewers must approve work before it proceeds.
  Find reviewers on the Marketplace if you don't have one on your team.

- **Manufacturing Objective Packs**: Five new objective packs focused on
  manufacturing readiness - DFM Review, ISO 9001 Quality System, Production
  Readiness Review, Supply Chain Qualification, and First Article Inspection.

- **RFQ Templates**: Quick-start your Requests for Quote from sector-specific
  templates. Manufacturing templates prominently featured with cross-sector
  options for CNC, 3D printing, PCB assembly, and more.

- **Sector Skills**: Skills mapped to all 8 industry sectors (Robotics,
  Rockets, Satellites, Consumer Electronics, Pharmaceuticals, AI Data Centres,
  SaaS, Mobile) for better expert matching and task routing.

## Improvements

- **Marketplace**: New "Hire an Expert" and "Hire an Apprentice" call-to-action
  cards when browsing the People category. Manufacturing services section added.

- **Inspiration Page**: New Manufacturing & Expert Resources section with
  quick links to DFM Review, Quality Systems, Supply Chain, and RFQ creation.

- **Task Detail**: Review gates now visible directly on task pages with
  approve/reject/waive actions for assigned reviewers.

- **Home Dashboard**: Review Gate widget shows pending reviews requiring
  your attention, grouped by gate type.
```

## Tips

- **Run from the repository root** so git commands work correctly
- **Review before publishing** - AI-generated changelogs need human eyes
- **Be specific about user impact** - "Fixed a bug" is useless; "Fixed issue where large images wouldn't upload" is helpful
- **Group related changes** - If 5 commits all relate to one feature, combine into one entry
- **Skip internal changes** - Users don't care about refactors, test fixes, or CI changes
- **Use active voice** - "Added review gates" not "Review gates were added"
- **Lead with the benefit** - "Tasks now load 2x faster" not "Optimised database queries"

## Integration with Deploy Workflow

When using the `vercel-deploy` skill, generate a changelog as part of the deployment process:

1. Generate changelog from commits since last deployment tag
2. Review with user
3. Commit changelog update
4. Deploy to Vercel
5. Tag the deployment commit
