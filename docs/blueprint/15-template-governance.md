# Template Governance Model

> **Step 15 Output** | Created: 2026-02-01 | Status: Complete  
> **Version:** 1.0 | **Author:** Agent Step-15

---

## Table of Contents
1. [Template Lifecycle Enum](#1-template-lifecycle-enum)
2. [Required Metadata Schema](#2-required-metadata-schema)
3. [Editing & Review Workflow](#3-editing--review-workflow)
4. [Staleness Detection & UI Surfacing](#4-staleness-detection--ui-surfacing)
5. [Forking Model](#5-forking-model)
6. [Data & RLS Implications](#6-data--rls-implications)
7. [Example Metadata Records](#7-example-metadata-records)
8. [Edge Cases](#8-edge-cases)

---

## 1. Template Lifecycle Enum

### 1.1 Canonical Values

```
template_lifecycle: 'draft' | 'active' | 'deprecated' | 'archived'
```

| Status | Description | Visibility | Instantiation | Editable |
|--------|-------------|------------|---------------|----------|
| `draft` | Template under development; not ready for production use | Creator only (or designated reviewers) | No | Yes |
| `active` | Production-ready template available for use | All users | Yes | Limited (via review) |
| `deprecated` | Template marked for phase-out; existing uses continue | Hidden from new selection; visible if already used | No | No (fork instead) |
| `archived` | Retired template; preserved for historical reference | Hidden from all except admins | No | No |

### 1.2 Storage Strategy

**Use `metadata` JSONB** on `blueprint_templates` rather than a new column. This maintains backward compatibility and allows flexible extension.

```sql
-- No schema migration required; leverage existing metadata JSONB
-- Default lifecycle for existing templates without metadata.lifecycle:
--   is_system_template = true → 'active'
--   is_system_template = false → 'draft'
```

**Query pattern:**
```sql
SELECT * FROM blueprint_templates
WHERE (metadata->>'lifecycle')::TEXT = 'active'
   OR (metadata->>'lifecycle' IS NULL AND is_system_template = true);
```

### 1.3 Lifecycle Transitions

```
┌─────────┐     publish     ┌─────────┐
│  draft  │ ───────────────→│  active │
└─────────┘                 └─────────┘
                                  │
                                  │ deprecate
                                  ↓
                            ┌─────────────┐
                            │ deprecated  │
                            └─────────────┘
                                  │
                                  │ archive (admin only)
                                  ↓
                            ┌─────────────┐
                            │  archived   │
                            └─────────────┘
```

**Transition Rules:**

| From | To | Allowed By | Conditions |
|------|----|------------|------------|
| `draft` | `active` | Template owner + admin approval (for system) | All required metadata present; at least 5 domains |
| `active` | `deprecated` | Template owner + admin approval (for system) | Deprecation reason provided; `deprecated_at` set |
| `deprecated` | `archived` | Admin only | 90 days since deprecation; no new instantiations in 30 days |
| `archived` | - | - | Terminal state; cannot be reactivated |
| Any | `draft` | - | Not allowed; create new version instead |

---

## 2. Required Metadata Schema

### 2.1 Governance Metadata Fields

The `metadata` JSONB column on `blueprint_templates` MUST include these governance fields for any template intended for production use:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `lifecycle` | `string` | Yes | One of: `draft`, `active`, `deprecated`, `archived` |
| `owner` | `object` | Yes | Owner identification (see 2.2) |
| `last_verified_at` | `ISO8601` | For `active` | Last date template content was reviewed for accuracy |
| `review_interval_days` | `integer` | For `active` | Days between required reviews (default: 180) |
| `sources` | `array<Source>` | Recommended | Authoritative sources for template content |
| `changelog` | `array<ChangeEntry>` | Yes | Version history of changes |
| `known_caveats` | `array<string>` | Recommended | Known limitations or edge cases |
| `deprecated_at` | `ISO8601` | For `deprecated` | When deprecation began |
| `deprecation_reason` | `string` | For `deprecated` | Why template was deprecated |
| `replacement_template_id` | `UUID` | Optional | Suggested replacement for deprecated templates |
| `version` | `string` | Yes | Semantic version (e.g., "1.2.0") |
| `min_domains` | `integer` | Optional | Minimum domains expected for this template type |

### 2.2 Owner Object Schema

```typescript
interface TemplateOwner {
  type: 'system' | 'profile' | 'foundry'
  
  // For type: 'system'
  team?: string  // e.g., "CentaurOS Product Team"
  
  // For type: 'profile'
  profile_id?: string  // UUID of owning profile
  
  // For type: 'foundry'
  foundry_id?: string  // Foundry ID for org-owned templates
  
  // Contact for issues/updates
  contact_email?: string
}
```

**System templates** (`is_system_template = true`):
- `owner.type` = `'system'`
- `owner.team` identifies the responsible internal team
- `owner.contact_email` for escalations

**Custom templates** (`is_system_template = false`):
- `owner.type` = `'profile'` or `'foundry'`
- Linked to specific user or organization

### 2.3 Source Object Schema

```typescript
interface Source {
  name: string          // e.g., "FCC Part 15 Regulations"
  url?: string          // Authoritative URL
  last_checked: string  // ISO8601 date
  reliability: 'authoritative' | 'trusted' | 'community'
}
```

### 2.4 Changelog Entry Schema

```typescript
interface ChangeEntry {
  version: string       // e.g., "1.2.0"
  date: string          // ISO8601 date
  author_id?: string    // UUID of person who made changes
  author_name: string   // Display name (for system changes)
  changes: string[]     // List of changes made
  domains_added?: string[]    // Domain names added
  domains_removed?: string[]  // Domain names removed
  domains_modified?: string[] // Domain names modified
}
```

---

## 3. Editing & Review Workflow

### 3.1 Role-Based Permissions

| Role | System Templates | Custom Templates (Own) | Custom Templates (Other) |
|------|------------------|------------------------|--------------------------|
| **Founder** | View only | Full edit | View only |
| **Executive** | View only | Full edit | View only |
| **Apprentice** | View only | Propose changes | View only |
| **AI_Agent** | View only | View only | View only |
| **Admin** | Full edit + publish | Full edit + publish | View + moderate |

### 3.2 System Template Review Gates

System templates (`is_system_template = true`) require additional review before changes become active:

**Review Process:**

```
┌─────────────────┐     submit      ┌─────────────────┐
│  Draft Changes  │ ───────────────→│  Pending Review │
└─────────────────┘                 └─────────────────┘
        │                                   │
        │ save draft                        │ approve / reject
        ↓                                   ↓
  (stays in draft)              ┌─────────────────────────┐
                                │ Approved: Apply Changes │
                                │ Rejected: Return to Draft│
                                └─────────────────────────┘
```

**Review Requirements:**

| Change Type | Minimum Reviewers | Auto-Review Criteria |
|-------------|-------------------|---------------------|
| Add domain | 1 admin | N/A - always manual |
| Remove domain | 2 admins | N/A - always manual |
| Modify `key_questions` | 1 admin | < 20% of questions changed |
| Update metadata only | 0 (auto-approved) | Non-breaking changes |
| Update `criticality` | 1 admin | N/A - always manual |

**Storage of Pending Changes:**

Store pending changes in `metadata.pending_changes` until approved:

```json
{
  "pending_changes": {
    "submitted_at": "2026-02-01T10:00:00Z",
    "submitted_by": "uuid-of-submitter",
    "change_type": "domain_modification",
    "diff": {
      "domains_modified": [
        {
          "domain_id": "uuid",
          "field": "key_questions",
          "old_value": [...],
          "new_value": [...]
        }
      ]
    },
    "review_status": "pending",
    "reviewers": []
  }
}
```

### 3.3 Custom Template Editing

Custom templates (`is_system_template = false`) have simpler governance:

| Lifecycle | Editable By | Review Required |
|-----------|-------------|-----------------|
| `draft` | Owner, Executives in foundry | No |
| `active` | Owner, Executives in foundry | No (but changelog entry required) |
| `deprecated` | No one | N/A |
| `archived` | No one | N/A |

**Changelog Enforcement:**

Any edit to an `active` custom template MUST include a changelog entry:

```typescript
async function updateTemplate(templateId: string, changes: TemplateChanges) {
  const template = await getTemplate(templateId)
  
  if (template.metadata.lifecycle === 'active') {
    if (!changes.changelog_entry) {
      throw new Error('Changelog entry required for active templates')
    }
    
    // Append to changelog
    template.metadata.changelog.push(changes.changelog_entry)
  }
  
  // Apply changes...
}
```

---

## 4. Staleness Detection & UI Surfacing

### 4.1 Staleness Calculation

A template is **stale** when:

```typescript
function isTemplateStale(template: BlueprintTemplate): boolean {
  const metadata = template.metadata as TemplateMetadata
  
  // Only active templates can be stale
  if (metadata.lifecycle !== 'active') return false
  
  // No verification date = stale
  if (!metadata.last_verified_at) return true
  
  const lastVerified = new Date(metadata.last_verified_at)
  const reviewInterval = metadata.review_interval_days || 180
  const daysSinceVerification = daysBetween(lastVerified, new Date())
  
  return daysSinceVerification > reviewInterval
}
```

### 4.2 Staleness Levels

| Days Since Verification | Level | Visual Indicator |
|------------------------|-------|------------------|
| 0 - 150 | Fresh | Green badge: "Verified" |
| 151 - 180 | Approaching Review | Yellow badge: "Review Due Soon" |
| 181 - 270 | Stale | Orange badge: "Needs Review" |
| 271+ | Very Stale | Red badge: "Overdue Review" |

### 4.3 UI Surfacing Rules

**Template Selection Screen:**

```tsx
function TemplateCard({ template }: { template: BlueprintTemplate }) {
  const staleness = getStalenessLevel(template)
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{template.name}</CardTitle>
        {staleness === 'stale' && (
          <StatusBadge status="warning">
            Needs Review ({daysSinceVerification(template)} days)
          </StatusBadge>
        )}
        {staleness === 'very_stale' && (
          <StatusBadge status="error">
            Overdue Review
          </StatusBadge>
        )}
      </CardHeader>
      {/* ... */}
    </Card>
  )
}
```

**Blueprint Detail View:**

When a blueprint uses a stale template, show an advisory banner:

```tsx
{isTemplateStale(blueprint.template) && (
  <Alert variant="warning">
    <AlertTitle>Template May Be Outdated</AlertTitle>
    <AlertDescription>
      This blueprint uses a template last verified {daysSince} days ago.
      Some domain questions or guidance may be outdated.
    </AlertDescription>
  </Alert>
)}
```

**Admin Dashboard:**

Surface stale templates requiring attention:

```typescript
// Query for templates needing review
const staleTemplates = await supabase
  .from('blueprint_templates')
  .select('*')
  .eq('is_system_template', true)
  .filter('metadata->lifecycle', 'eq', 'active')
  .order('metadata->last_verified_at', { ascending: true })
  .limit(10)
```

### 4.4 Automatic Staleness Notifications

**Weekly digest** (for template owners):
- Templates approaching review (> 150 days)
- Templates overdue for review (> 180 days)

**Immediate notification** (for admins):
- Template crosses 270-day threshold (very stale)

---

## 5. Forking Model

### 5.1 Fork Types

| Fork Type | Source | Result | Use Case |
|-----------|--------|--------|----------|
| **System → Custom** | `is_system_template = true` | `is_system_template = false`, new owner | Foundry customizes system template |
| **Custom → Custom** | `is_system_template = false` | New custom template, new owner | User copies another user's template |
| **Template → Blueprint** | Any template | New blueprint instance | Standard instantiation (not a fork) |

### 5.2 Fork Behavior

**Critical Decision: Upstream Updates Do NOT Propagate**

When a foundry forks a system template:
1. A complete copy is created with the foundry as owner
2. Changes to the source template do NOT affect the fork
3. The fork is an independent entity

**Rationale:**
- Predictability: Users expect their customizations to persist
- Safety: Upstream changes could break domain-specific customizations
- Simplicity: No merge conflicts, no sync complexity
- Control: Users explicitly choose when to incorporate updates

### 5.3 Fork Workflow

```typescript
interface ForkTemplateInput {
  source_template_id: string
  new_name: string
  foundry_id: string
  modifications?: {
    domains_to_remove?: string[]     // Domain IDs to exclude
    domains_to_add?: KnowledgeDomain[] // New domains to add
    metadata_overrides?: Partial<TemplateMetadata>
  }
}

async function forkTemplate(input: ForkTemplateInput): Promise<string> {
  const source = await getTemplateWithDomains(input.source_template_id)
  
  // 1. Create new template record
  const newTemplate = await supabase.from('blueprint_templates').insert({
    name: input.new_name,
    description: source.description,
    product_category: source.product_category,
    icon: source.icon,
    is_system_template: false, // Forks are never system templates
    created_by: getCurrentUserId(),
    metadata: {
      ...source.metadata,
      lifecycle: 'draft', // Forks start as drafts
      owner: {
        type: 'foundry',
        foundry_id: input.foundry_id
      },
      version: '1.0.0',
      changelog: [{
        version: '1.0.0',
        date: new Date().toISOString(),
        author_name: 'System',
        changes: [`Forked from ${source.name} (v${source.metadata.version})`]
      }],
      forked_from: {
        template_id: source.id,
        template_name: source.name,
        version: source.metadata.version,
        forked_at: new Date().toISOString()
      }
    }
  }).select('id').single()
  
  // 2. Copy domains (excluding removed ones)
  const domainsToFork = source.domains.filter(
    d => !input.modifications?.domains_to_remove?.includes(d.id)
  )
  
  // 3. Generate new IDs for domains (important for referential integrity)
  const domainIdMap = new Map<string, string>() // old_id → new_id
  
  for (const domain of domainsToFork) {
    const newDomainId = crypto.randomUUID()
    domainIdMap.set(domain.id, newDomainId)
  }
  
  // 4. Insert domains with updated references
  for (const domain of domainsToFork) {
    await supabase.from('knowledge_domains').insert({
      id: domainIdMap.get(domain.id),
      template_id: newTemplate.id,
      parent_id: domain.parent_id ? domainIdMap.get(domain.parent_id) : null,
      name: domain.name,
      description: domain.description,
      category: domain.category,
      depth: domain.depth,
      display_order: domain.display_order,
      key_questions: domain.key_questions,
      typical_roles: domain.typical_roles,
      criticality: domain.criticality,
      // ... other fields
    })
  }
  
  // 5. Increment fork_count on source
  await supabase.from('blueprint_templates')
    .update({ fork_count: source.fork_count + 1 })
    .eq('id', source.id)
  
  return newTemplate.id
}
```

### 5.4 Upstream Update Awareness (Opt-In)

While updates don't auto-propagate, users can opt to be **notified** of upstream changes:

```json
{
  "forked_from": {
    "template_id": "source-uuid",
    "template_name": "Consumer Electronics",
    "version": "1.2.0",
    "forked_at": "2026-01-15T10:00:00Z",
    "notify_on_updates": true
  }
}
```

**Notification content:**
- Source template was updated
- Summary of changes (domains added/removed/modified)
- Link to view diff
- Option to manually incorporate changes

### 5.5 Manual Update Incorporation

For users who want to incorporate upstream changes:

```typescript
async function showUpstreamDiff(forkId: string): Promise<TemplateDiff> {
  const fork = await getTemplateWithDomains(forkId)
  const sourceId = fork.metadata.forked_from?.template_id
  
  if (!sourceId) throw new Error('Not a forked template')
  
  const source = await getTemplateWithDomains(sourceId)
  
  return {
    domains_added_upstream: source.domains.filter(
      d => !fork.domains.find(fd => fd.name === d.name)
    ),
    domains_removed_upstream: fork.domains.filter(
      d => d.metadata?.from_fork && !source.domains.find(sd => sd.name === d.name)
    ),
    domains_modified_upstream: // Compare key_questions, criticality, etc.
  }
}
```

Users manually select which upstream changes to incorporate via UI.

---

## 6. Data & RLS Implications

### 6.1 RLS Policy Updates

**No new tables required.** Governance uses existing `blueprint_templates` and `knowledge_domains` tables with RLS adjustments.

#### Template Visibility

```sql
-- Existing policy adjustment
CREATE POLICY "templates_select_policy" ON blueprint_templates FOR SELECT USING (
  -- System templates: visible based on lifecycle
  (is_system_template = true AND (
    (metadata->>'lifecycle')::TEXT = 'active'
    OR (metadata->>'lifecycle')::TEXT IS NULL -- Legacy templates
    OR get_my_role() = 'Admin'
  ))
  OR
  -- Custom templates: visible to own foundry only
  (is_system_template = false AND (
    created_by IN (SELECT id FROM profiles WHERE foundry_id = get_my_foundry_id())
    OR get_my_role() = 'Admin'
  ))
);
```

#### Template Modification

```sql
-- Only owners can modify their templates
CREATE POLICY "templates_update_policy" ON blueprint_templates FOR UPDATE USING (
  -- System templates: admin only
  (is_system_template = true AND get_my_role() = 'Admin')
  OR
  -- Custom templates: creator or same-foundry executives
  (is_system_template = false AND (
    created_by = auth.uid()
    OR (
      get_my_foundry_id() = (
        SELECT foundry_id FROM profiles WHERE id = blueprint_templates.created_by
      )
      AND get_my_role() IN ('Founder', 'Executive')
    )
  ))
);
```

### 6.2 Foundry Isolation

**Critical Rule:** Custom templates are foundry-scoped.

```sql
-- Custom templates must have foundry-linked creator
CREATE POLICY "templates_insert_policy" ON blueprint_templates FOR INSERT 
WITH CHECK (
  -- System templates: admin only
  (is_system_template = true AND get_my_role() = 'Admin')
  OR
  -- Custom templates: must be in a foundry
  (is_system_template = false AND (
    get_my_foundry_id() IS NOT NULL
    AND created_by = auth.uid()
  ))
);
```

### 6.3 Knowledge Domains RLS

Knowledge domains inherit visibility from their parent template:

```sql
CREATE POLICY "domains_select_policy" ON knowledge_domains FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM blueprint_templates bt
    WHERE bt.id = knowledge_domains.template_id
    -- Relies on template's SELECT policy
  )
);

CREATE POLICY "domains_modify_policy" ON knowledge_domains FOR ALL USING (
  EXISTS (
    SELECT 1 FROM blueprint_templates bt
    WHERE bt.id = knowledge_domains.template_id
    AND (
      (bt.is_system_template = true AND get_my_role() = 'Admin')
      OR
      (bt.is_system_template = false AND (
        bt.created_by = auth.uid()
        OR (
          get_my_foundry_id() = (
            SELECT foundry_id FROM profiles WHERE id = bt.created_by
          )
          AND get_my_role() IN ('Founder', 'Executive')
        )
      ))
    )
  )
);
```

### 6.4 No New Tables Required

Governance is implemented entirely through:
1. **`metadata` JSONB** on `blueprint_templates` (existing column)
2. **RLS policy refinements** (existing table)
3. **Application-level validation** in server actions

This avoids migration complexity while providing full governance capability.

---

## 7. Example Metadata Records

### 7.1 System Template (Active)

```json
{
  "lifecycle": "active",
  "version": "2.3.1",
  "owner": {
    "type": "system",
    "team": "CentaurOS Product Team",
    "contact_email": "templates@centauros.com"
  },
  "last_verified_at": "2026-01-15T10:30:00Z",
  "review_interval_days": 180,
  "sources": [
    {
      "name": "FCC Part 15 Regulations",
      "url": "https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-15",
      "last_checked": "2026-01-10T00:00:00Z",
      "reliability": "authoritative"
    },
    {
      "name": "IEC 62368-1 Safety Standard",
      "url": "https://webstore.iec.ch/publication/62367",
      "last_checked": "2025-12-01T00:00:00Z",
      "reliability": "authoritative"
    }
  ],
  "changelog": [
    {
      "version": "2.3.1",
      "date": "2026-01-15T10:30:00Z",
      "author_name": "Jane Smith",
      "changes": [
        "Updated FCC certification questions for new Part 15B rules",
        "Added UL 62368-1 as replacement for UL 60950"
      ],
      "domains_modified": ["FCC Certification", "Safety Certification"]
    },
    {
      "version": "2.3.0",
      "date": "2025-11-01T14:00:00Z",
      "author_name": "Product Team",
      "changes": [
        "Added Matter/Thread connectivity domain",
        "Deprecated Zigbee-only domain"
      ],
      "domains_added": ["Matter/Thread Integration"],
      "domains_removed": ["Zigbee (Legacy)"]
    },
    {
      "version": "2.2.0",
      "date": "2025-08-15T09:00:00Z",
      "author_name": "Product Team",
      "changes": ["Initial release of Consumer Electronics v2"]
    }
  ],
  "known_caveats": [
    "Medical device electronics require additional FDA domains (not included)",
    "Automotive-grade electronics require AEC-Q qualification (separate template)",
    "Questions assume US market; EU/UK may require CE marking additions"
  ],
  "tags": ["hardware", "iot", "consumer"],
  "difficulty": "advanced",
  "min_domains": 30
}
```

### 7.2 System Template (Deprecated)

```json
{
  "lifecycle": "deprecated",
  "version": "1.5.0",
  "deprecated_at": "2025-10-01T00:00:00Z",
  "deprecation_reason": "Superseded by Consumer Electronics v2 with updated safety standards",
  "replacement_template_id": "00000001-0000-4000-8000-000000000001",
  "owner": {
    "type": "system",
    "team": "CentaurOS Product Team"
  },
  "last_verified_at": "2025-06-15T10:00:00Z",
  "changelog": [
    {
      "version": "1.5.0",
      "date": "2025-06-15T10:00:00Z",
      "author_name": "Product Team",
      "changes": ["Final update before deprecation"]
    }
  ],
  "tags": ["hardware", "iot", "consumer", "legacy"]
}
```

### 7.3 Custom Template (Draft)

```json
{
  "lifecycle": "draft",
  "version": "0.1.0",
  "owner": {
    "type": "foundry",
    "foundry_id": "fd-acme-robotics",
    "contact_email": "cto@acmerobotics.com"
  },
  "forked_from": {
    "template_id": "00000003-0000-4000-8000-000000000001",
    "template_name": "Robotics & Automation",
    "version": "1.0.0",
    "forked_at": "2026-01-20T15:00:00Z",
    "notify_on_updates": true
  },
  "changelog": [
    {
      "version": "0.1.0",
      "date": "2026-01-20T15:00:00Z",
      "author_id": "uuid-of-cto",
      "author_name": "Sarah Chen",
      "changes": [
        "Forked from Robotics & Automation v1.0.0",
        "Removed industrial safety domains (consumer focus)",
        "Added child safety compliance domain"
      ],
      "domains_removed": ["Industrial Safety Guards", "Machine Safety ISO 13849"],
      "domains_added": ["Child Safety Compliance (CPSC)"]
    }
  ],
  "known_caveats": [
    "Customized for consumer robotics only",
    "Not suitable for industrial applications"
  ],
  "tags": ["robotics", "consumer", "custom"]
}
```

### 7.4 Custom Template (Active, Forked)

```json
{
  "lifecycle": "active",
  "version": "1.2.0",
  "owner": {
    "type": "profile",
    "profile_id": "uuid-of-founder",
    "contact_email": "founder@startup.com"
  },
  "last_verified_at": "2026-01-28T09:00:00Z",
  "review_interval_days": 90,
  "forked_from": {
    "template_id": "00000001-0000-4000-8000-000000000001",
    "template_name": "Consumer Electronics",
    "version": "2.2.0",
    "forked_at": "2025-09-01T10:00:00Z",
    "notify_on_updates": true
  },
  "sources": [
    {
      "name": "Internal Engineering Standards",
      "url": null,
      "last_checked": "2026-01-28T09:00:00Z",
      "reliability": "trusted"
    }
  ],
  "changelog": [
    {
      "version": "1.2.0",
      "date": "2026-01-28T09:00:00Z",
      "author_id": "uuid-of-founder",
      "author_name": "Alex Kim",
      "changes": [
        "Added IP68 waterproofing domain",
        "Updated battery questions for LFP chemistry"
      ],
      "domains_added": ["IP68 Waterproofing"],
      "domains_modified": ["Battery Management"]
    },
    {
      "version": "1.1.0",
      "date": "2025-11-15T14:00:00Z",
      "author_id": "uuid-of-founder",
      "author_name": "Alex Kim",
      "changes": ["Added outdoor enclosure domain"]
    },
    {
      "version": "1.0.0",
      "date": "2025-09-01T10:00:00Z",
      "author_name": "System",
      "changes": ["Forked from Consumer Electronics v2.2.0"]
    }
  ],
  "known_caveats": [
    "Specific to outdoor wearables",
    "Assumes IP68 rating requirement"
  ]
}
```

---

## 8. Edge Cases

### EC-01: Template Deleted While Blueprint Active

**Scenario:** Admin deletes/archives a system template while blueprints reference it.

**Handling:**
- `blueprint.template_id` uses `ON DELETE SET NULL`
- Blueprint continues to function with existing `knowledge_domains` copies
- UI shows "Template no longer available" indicator
- Domain data preserved in `blueprint_domain_coverage`

### EC-02: Concurrent Template Edits

**Scenario:** Two admins edit the same system template simultaneously.

**Handling:**
- Use optimistic locking via `updated_at` timestamp
- Second save shows conflict toast
- Losing editor must refresh and reapply changes
- `pending_changes` cleared on successful save

### EC-03: Fork of a Fork

**Scenario:** User forks a custom template that was itself forked from a system template.

**Handling:**
- Only immediate parent tracked in `forked_from`
- Full lineage available via recursive lookup if needed
- Fork inherits parent's `known_caveats`
- Notifications only for direct parent (not grandparent)

### EC-04: Stale Template Used for New Blueprint

**Scenario:** User creates blueprint from a template overdue for review.

**Handling:**
- Allow creation (blocking would be too disruptive)
- Show warning banner during creation: "This template may be outdated"
- Log analytics event `blueprint_created_from_stale_template`
- Trigger notification to template owner

### EC-05: Domain Added to System Template After Blueprints Created

**Scenario:** New regulatory domain added to "Consumer Electronics" template; existing blueprints don't have it.

**Handling:**
- **No auto-propagation** (explicit design decision)
- Option A: Users manually check for template updates
- Option B: Admin can trigger "suggest new domain" notification to blueprint owners
- Blueprint owners add domain manually if desired

### EC-06: Circular Fork References

**Scenario:** Template A forked to B, B modified, attempt to "merge back" to A.

**Handling:**
- System templates cannot be forked-into (only forked-from)
- Custom templates: owner must manually copy changes
- No automatic merge capability (too complex for MVP)

### EC-07: Template Owner Leaves Foundry

**Scenario:** Profile who owns custom template is removed from foundry.

**Handling:**
- Template ownership transfers to foundry (auto-migration)
- `owner.type` changes from `profile` to `foundry`
- Previous owner's profile_id preserved in changelog
- Executives in foundry gain edit access

### EC-08: Empty Template (No Domains)

**Scenario:** User creates custom template, removes all domains.

**Handling:**
- Prevent lifecycle transition to `active` if domain count < 1
- `min_domains` metadata field enforced on publish
- Draft templates can be empty (work in progress)

### EC-09: Very Large Template (500+ Domains)

**Scenario:** User creates exhaustive template with hundreds of domains.

**Handling:**
- No hard limit, but performance warnings at 200+ domains
- Pagination in domain editor
- Recommend breaking into multiple templates
- `estimated_domains` accuracy warning if > 100

### EC-10: Template with Broken Domain References

**Scenario:** Domain `parent_id` references non-existent domain (data corruption).

**Handling:**
- Database constraint (`REFERENCES ON DELETE CASCADE`) prevents this
- If orphaned (SET NULL case), domain becomes root-level
- Admin cleanup script for data integrity checks

### EC-11: Deprecated Template Still in High Use

**Scenario:** Template deprecated but 50+ active blueprints still use it.

**Handling:**
- Deprecation does not affect existing blueprints
- Usage tracked via analytics
- If use_count high, extend deprecation period before archiving
- Notify active blueprint owners of recommended migration

### EC-12: Conflicting Metadata Migrations

**Scenario:** Old template has `metadata: {"tags": [...]}`, new governance adds required fields.

**Handling:**
- Backward compatibility: missing governance fields use defaults
- Migration script to backfill existing templates:
  ```sql
  UPDATE blueprint_templates
  SET metadata = metadata || jsonb_build_object(
    'lifecycle', CASE WHEN is_system_template THEN 'active' ELSE 'draft' END,
    'version', '1.0.0',
    'owner', jsonb_build_object('type', CASE WHEN is_system_template THEN 'system' ELSE 'profile' END),
    'changelog', '[]'::jsonb
  )
  WHERE metadata->>'lifecycle' IS NULL;
  ```

### EC-13: Template Archived While Review Pending

**Scenario:** Template has pending changes in review when admin archives it.

**Handling:**
- Archive takes precedence
- Pending changes discarded
- Changelog entry: "Archived with pending changes discarded"
- Submitter notified

### EC-14: Forked Template Source Archived

**Scenario:** User forks template A; later template A is archived.

**Handling:**
- Fork continues to function independently
- `forked_from.template_id` reference preserved (historical)
- "View source template" link shows "Template archived" message
- Upstream notifications disabled

---

## Changes Made

| File | Action |
|------|--------|
| `docs/blueprint/15-template-governance.md` | Created |
| `docs/blueprint/INDEX.md` | Updated (Step 15 marked complete, lifecycle enum added) |
| `docs/blueprint/ORCHESTRATION.md` | Updated (Step 15 marked complete with timestamp) |
