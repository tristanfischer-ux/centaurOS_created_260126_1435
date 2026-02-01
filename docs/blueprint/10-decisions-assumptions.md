# Decisions & Assumptions Model

> **Step 10 Output** | Created: 2026-02-01 | Status: Complete  
> **Version:** 1.0 | **Author:** Agent Step-10

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Canonical Definitions](#2-canonical-definitions)
3. [JSON Schema](#3-json-schema)
4. [Stage Freeze Rules](#4-stage-freeze-rules)
5. [UX Specification](#5-ux-specification)
6. [Normalized Table Evolution](#6-normalized-table-evolution)
7. [Analytics Events](#7-analytics-events)
8. [Edge Cases](#8-edge-cases)
9. [Implementation Checklist](#9-implementation-checklist)

---

## 1. Executive Summary

### 1.1 Purpose

Decisions and assumptions capture the irreversible choices and testable hypotheses that shape a hardware product's development trajectory. Unlike OptionSets (which compare alternatives), Decisions represent **committed choices** that constrain future options and must be tracked for impact analysis.

### 1.2 Key Principles

1. **Domain-Scoped**: Decisions attach to specific `blueprint_domain_coverage` records
2. **Irreversible**: Once made, decisions can only be superseded (not reversed)
3. **Evidence-Linked**: Decisions link to tasks, RFQs, and expert packets that validate them
4. **Stage-Aware**: Decisions become harder to change as project stage advances
5. **Audit Trail**: All decision changes logged to `blueprint_history`

### 1.3 Integration with CentaurOS

| CentaurOS Feature | Integration Point |
|-------------------|-------------------|
| **OptionSets** | Committing to an option creates a Decision entry |
| **Tasks** | Decisions can link to tasks that implement or validate them |
| **RFQs** | Decisions inform RFQ specifications (e.g., "We chose 18650 cells") |
| **Risk Scoring** | Unvalidated assumptions increase domain risk score |
| **Stage Gates** | Decisions frozen at later stages block stage regression |
| **AI Assistance** | Ghost Worker can propose decisions (T9 task type) |

---

## 2. Canonical Definitions

### 2.1 Decision

**Definition:** An **irreversible choice** that constrains future options and commits resources.

**Characteristics:**
- Has been **made** (not just considered)
- Requires **justification** (rationale, evidence, tradeoffs)
- Has **consequences** (blocks alternatives, creates dependencies)
- Becomes **harder to change** as project stage advances

**Examples:**
- "We will use 18650 Li-Ion cells for the battery pack"
- "PCB will be manufactured by Supplier X"
- "Product will target FCC Part 15 Class B certification"
- "We will use ARM Cortex-M4 microcontroller"

**Not Decisions:**
- "We're considering 18650 vs 21700 cells" → This is an OptionSet
- "Battery capacity should be > 5000 mAh" → This is a requirement/constraint
- "We need to test thermal performance" → This is a task

### 2.2 Assumption

**Definition:** A **testable hypothesis** that must be validated before it can become a decision.

**Characteristics:**
- Has **uncertainty** (not yet proven)
- Requires **validation** (tests, expert review, data)
- Can be **invalidated** (proven false)
- Should be **tracked** until validated or invalidated

**Examples:**
- "18650 cells will fit within the mechanical envelope" (assumption → validate with CAD)
- "Supplier X can deliver 10K units/month" (assumption → validate with RFQ)
- "Thermal design will meet safety margins" (assumption → validate with testing)
- "Firmware can achieve < 100ms latency" (assumption → validate with prototype)

**Lifecycle:**
```
Assumption → [Validation Task] → Decision (if validated) OR Invalidated (if disproven)
```

### 2.3 Constraint

**Definition:** An **external limit** that cannot be changed by the team.

**Characteristics:**
- **Imposed externally** (regulatory, budget, timeline, customer requirement)
- **Not a choice** (must be satisfied)
- **Immutable** (cannot be "decided" differently)
- **Informs decisions** (decisions must work within constraints)

**Examples:**
- "Product must comply with FCC Part 15" (regulatory constraint)
- "Budget: $500K for prototype stage" (budget constraint)
- "Launch date: Q2 2026" (timeline constraint)
- "Must operate in -20°C to +60°C" (customer requirement)

**Note:** Constraints are typically stored in `blueprints.metadata.constraints` rather than in domain decisions, but can be referenced by decisions.

---

## 3. JSON Schema

### 3.1 Storage Location

**Table:** `blueprint_domain_coverage.decisions` (JSONB array)

```sql
-- Existing column (no migration needed)
decisions JSONB DEFAULT '[]'
```

### 3.2 Decision Entry Schema

```typescript
// src/types/blueprints.ts

/**
 * Decision: A committed choice for a domain
 */
export interface Decision {
  id: string;                          // UUID (generated client-side or server-side)
  type: DecisionType;                 // 'decision' | 'assumption' | 'constraint'
  status: DecisionStatus;              // 'proposed' | 'approved' | 'superseded'
  
  // Content
  title: string;                       // Short summary (e.g., "18650 Li-Ion cells")
  description: string;                 // Detailed explanation
  rationale: string;                   // Why this decision was made
  tradeoffs?: string[];                // What was considered/weighed
  
  // Evidence & Validation
  evidence_task_ids?: string[];        // Tasks that validate this decision
  evidence_rfq_ids?: string[];         // RFQs that informed this decision
  evidence_expert_packet_ids?: string[]; // Expert packets that supported this
  validated_at?: string;               // ISO8601 (when assumption became decision)
  validated_by?: string;               // profile_id
  
  // Dependencies & Impact
  blocks_domains?: string[];           // domain_ids this decision makes not_needed
  requires_domains?: string[];         // domain_ids that must be covered first
  impacts_domains?: string[];         // domain_ids affected by this decision
  
  // Stage Context
  made_at_stage: ProjectStage;        // Stage when decision was made
  frozen_at_stage?: ProjectStage;     // Stage when decision became frozen (if applicable)
  
  // Supersession (for status: 'superseded')
  superseded_by?: string;             // Decision.id that replaced this
  superseded_reason?: string;          // Why this was superseded
  superseded_at?: string;              // ISO8601
  
  // Provenance
  created_by: string;                  // profile_id
  created_at: string;                  // ISO8601
  updated_at?: string;                 // ISO8601
  
  // AI Provenance (if AI-suggested)
  provenance?: {
    provenance_type: 'user_entered' | 'ai_suggested' | 'option_commit';
    source_option_set_id?: string;    // If from OptionSet commit
    source_option_id?: string;         // If from OptionSet commit
    ai_confidence?: number;            // 0-1 if AI-suggested
  };
}

export type DecisionType = 
  | 'decision'      // Irreversible choice
  | 'assumption'    // Testable hypothesis
  | 'constraint';   // External limit

export type DecisionStatus =
  | 'proposed'      // Suggested but not yet approved
  | 'approved'      // Active decision
  | 'superseded';   // Replaced by another decision
```

### 3.3 JSON Schema Validation

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "array",
  "items": {
    "type": "object",
    "required": [
      "id",
      "type",
      "status",
      "title",
      "description",
      "rationale",
      "made_at_stage",
      "created_by",
      "created_at"
    ],
    "properties": {
      "id": {
        "type": "string",
        "format": "uuid"
      },
      "type": {
        "type": "string",
        "enum": ["decision", "assumption", "constraint"]
      },
      "status": {
        "type": "string",
        "enum": ["proposed", "approved", "superseded"]
      },
      "title": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "description": {
        "type": "string",
        "minLength": 1
      },
      "rationale": {
        "type": "string",
        "minLength": 1
      },
      "tradeoffs": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "evidence_task_ids": {
        "type": "array",
        "items": {
          "type": "string",
          "format": "uuid"
        }
      },
      "evidence_rfq_ids": {
        "type": "array",
        "items": {
          "type": "string",
          "format": "uuid"
        }
      },
      "evidence_expert_packet_ids": {
        "type": "array",
        "items": {
          "type": "string",
          "format": "uuid"
        }
      },
      "validated_at": {
        "type": "string",
        "format": "date-time"
      },
      "validated_by": {
        "type": "string",
        "format": "uuid"
      },
      "blocks_domains": {
        "type": "array",
        "items": {
          "type": "string",
          "format": "uuid"
        }
      },
      "requires_domains": {
        "type": "array",
        "items": {
          "type": "string",
          "format": "uuid"
        }
      },
      "impacts_domains": {
        "type": "array",
        "items": {
          "type": "string",
          "format": "uuid"
        }
      },
      "made_at_stage": {
        "type": "string",
        "enum": ["concept", "prototype", "evt", "dvt", "production", "launched"]
      },
      "frozen_at_stage": {
        "type": "string",
        "enum": ["concept", "prototype", "evt", "dvt", "production", "launched"]
      },
      "superseded_by": {
        "type": "string",
        "format": "uuid"
      },
      "superseded_reason": {
        "type": "string"
      },
      "superseded_at": {
        "type": "string",
        "format": "date-time"
      },
      "created_by": {
        "type": "string",
        "format": "uuid"
      },
      "created_at": {
        "type": "string",
        "format": "date-time"
      },
      "updated_at": {
        "type": "string",
        "format": "date-time"
      },
      "provenance": {
        "type": "object",
        "properties": {
          "provenance_type": {
            "type": "string",
            "enum": ["user_entered", "ai_suggested", "option_commit"]
          },
          "source_option_set_id": {
            "type": "string",
            "format": "uuid"
          },
          "source_option_id": {
            "type": "string",
            "format": "uuid"
          },
          "ai_confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1
          }
        }
      }
    }
  }
}
```

### 3.4 Example Decision Entries

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "decision",
    "status": "approved",
    "title": "18650 Li-Ion cells for battery pack",
    "description": "We will use 18650 cylindrical Li-Ion cells arranged in 3S2P configuration (6 cells total) to achieve 11.1V nominal, 5000 mAh capacity.",
    "rationale": "18650 cells offer best balance of energy density, cost, and availability. 21700 cells would be better but require larger mechanical envelope. 3S2P configuration provides sufficient capacity while keeping pack size manageable.",
    "tradeoffs": [
      "Energy density: 18650 (lower) vs 21700 (higher)",
      "Cost: 18650 ($2/cell) vs 21700 ($3/cell)",
      "Availability: Both widely available",
      "Size: 18650 fits our envelope, 21700 would require redesign"
    ],
    "evidence_task_ids": ["task-uuid-1", "task-uuid-2"],
    "evidence_rfq_ids": ["rfq-uuid-1"],
    "made_at_stage": "prototype",
    "frozen_at_stage": "evt",
    "blocks_domains": [],
    "requires_domains": ["domain-uuid-mechanical"],
    "impacts_domains": ["domain-uuid-power-management", "domain-uuid-thermal"],
    "created_by": "profile-uuid-1",
    "created_at": "2026-01-15T10:00:00Z",
    "provenance": {
      "provenance_type": "option_commit",
      "source_option_set_id": "optionset-uuid-1",
      "source_option_id": "option-uuid-1"
    }
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "type": "assumption",
    "status": "proposed",
    "title": "Thermal design will meet safety margins",
    "description": "We assume that the thermal design (passive cooling via aluminum enclosure) will keep battery pack below 60°C during normal operation, meeting safety margins.",
    "rationale": "Initial thermal analysis suggests adequate heat dissipation, but this needs validation with prototype testing.",
    "evidence_task_ids": [],
    "made_at_stage": "prototype",
    "requires_domains": ["domain-uuid-thermal"],
    "impacts_domains": ["domain-uuid-battery"],
    "created_by": "profile-uuid-1",
    "created_at": "2026-01-20T14:30:00Z",
    "provenance": {
      "provenance_type": "ai_suggested",
      "ai_confidence": 0.7
    }
  }
]
```

---

## 4. Stage Freeze Rules

### 4.1 Freeze Thresholds

Decisions become progressively harder to change as the project advances through stages. The "freeze" threshold indicates when a decision requires explicit override to modify.

| Stage | Freeze Threshold | Change Difficulty | Override Required |
|-------|------------------|-------------------|-------------------|
| `concept` | None | Easy | No |
| `prototype` | None | Easy | No |
| `evt` | Decisions made at `concept` | Medium | Warning dialog |
| `dvt` | Decisions made at `prototype` or earlier | Hard | Confirmation + reason |
| `production` | Decisions made at `evt` or earlier | Very Hard | Executive approval + reason |
| `launched` | All decisions | Frozen | Cannot change (must supersede) |

### 4.2 Freeze Logic

```typescript
function isDecisionFrozen(
  decision: Decision,
  currentStage: ProjectStage
): boolean {
  // Never frozen at concept/prototype
  if (currentStage === 'concept' || currentStage === 'prototype') {
    return false;
  }
  
  // Already superseded decisions are effectively frozen
  if (decision.status === 'superseded') {
    return true;
  }
  
  // Freeze thresholds
  const freezeRules: Record<ProjectStage, ProjectStage[]> = {
    concept: [],
    prototype: [],
    evt: ['concept'],
    dvt: ['concept', 'prototype'],
    production: ['concept', 'prototype', 'evt'],
    launched: ['concept', 'prototype', 'evt', 'dvt', 'production']
  };
  
  return freezeRules[currentStage].includes(decision.made_at_stage);
}

function getChangeDifficulty(
  decision: Decision,
  currentStage: ProjectStage
): 'easy' | 'medium' | 'hard' | 'very_hard' | 'frozen' {
  if (currentStage === 'launched') {
    return 'frozen';
  }
  
  if (isDecisionFrozen(decision, currentStage)) {
    if (currentStage === 'evt') return 'medium';
    if (currentStage === 'dvt') return 'hard';
    if (currentStage === 'production') return 'very_hard';
  }
  
  return 'easy';
}
```

### 4.3 Override Workflow

When attempting to modify a frozen decision:

1. **Check freeze status** → If frozen, show override dialog
2. **Require reason** → User must provide justification
3. **Check permissions** → `production` stage requires Executive role
4. **Create supersession** → Mark old decision as `superseded`, create new decision
5. **Log to history** → Record override in `blueprint_history`
6. **Notify stakeholders** → If decision impacts other domains, create tasks

```typescript
async function supersedeDecision(
  oldDecisionId: string,
  newDecision: Omit<Decision, 'id' | 'created_at' | 'created_by'>,
  reason: string,
  userId: string
): Promise<Decision> {
  // Validate permissions
  const oldDecision = await getDecision(oldDecisionId);
  const blueprint = await getBlueprint(oldDecision.blueprint_id);
  
  if (blueprint.project_stage === 'production' || blueprint.project_stage === 'launched') {
    const user = await getUser(userId);
    if (user.role !== 'Executive' && user.role !== 'Founder') {
      throw new Error('Executive approval required to change frozen decisions');
    }
  }
  
  // Create new decision
  const newDecisionFull: Decision = {
    ...newDecision,
    id: generateUUID(),
    created_by: userId,
    created_at: new Date().toISOString(),
    status: 'approved'
  };
  
  // Mark old as superseded
  await updateDecision(oldDecisionId, {
    status: 'superseded',
    superseded_by: newDecisionFull.id,
    superseded_reason: reason,
    superseded_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  
  // Add new decision to array
  await addDecisionToDomain(newDecisionFull);
  
  // Log to history
  await logBlueprintHistory(blueprint.id, userId, 'decision_superseded', {
    old_decision_id: oldDecisionId,
    new_decision_id: newDecisionFull.id,
    reason
  });
  
  return newDecisionFull;
}
```

### 4.4 Stage Regression Impact

When regressing a blueprint stage (e.g., `dvt` → `prototype`):

1. **Decisions remain** → All decisions persist
2. **Freeze status recalculated** → Frozen decisions may become unfrozen
3. **Warning shown** → "Some decisions were made at later stages. Review them."
4. **No auto-supersession** → User must explicitly supersede if needed

---

## 5. UX Specification

### 5.1 Domain Panel: Decisions Section

**Location:** Domain detail panel, below "Expertise" section

```tsx
// DomainDetailPanel.tsx

<div className="decisions-section space-y-4">
  <div className="flex items-center justify-between">
    <h3 className="text-lg font-semibold">Decisions & Assumptions</h3>
    <Button 
      variant="outline" 
      size="sm"
      onClick={() => setShowAddDecisionDialog(true)}
    >
      <Plus className="h-4 w-4 mr-2" />
      Add Decision
    </Button>
  </div>
  
  {/* Filter tabs */}
  <Tabs defaultValue="all">
    <TabsList>
      <TabsTrigger value="all">All</TabsTrigger>
      <TabsTrigger value="decisions">Decisions</TabsTrigger>
      <TabsTrigger value="assumptions">Assumptions</TabsTrigger>
      <TabsTrigger value="constraints">Constraints</TabsTrigger>
    </TabsList>
    
    <TabsContent value="all">
      <DecisionList 
        decisions={allDecisions}
        onSupersede={handleSupersede}
        currentStage={blueprint.project_stage}
      />
    </TabsContent>
    {/* ... other tabs */}
  </Tabs>
</div>
```

### 5.2 Decision Card Component

```tsx
// DecisionCard.tsx

<Card className={cn(
  "transition-colors",
  decision.status === 'superseded' && "opacity-60",
  isFrozen && "border-warning"
)}>
  <CardHeader>
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <StatusBadge status={getDecisionStatusBadge(decision.status)}>
            {decision.status}
          </StatusBadge>
          <Badge variant="outline">{decision.type}</Badge>
          {isFrozen && (
            <Badge variant="warning" className="flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Frozen
            </Badge>
          )}
        </div>
        <CardTitle>{decision.title}</CardTitle>
      </div>
      {decision.status === 'approved' && !isFrozen && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => handleSupersede(decision.id)}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Supersede
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  </CardHeader>
  
  <CardContent className="space-y-4">
    <div>
      <p className="text-sm text-muted-foreground mb-1">Description</p>
      <p className="text-sm">{decision.description}</p>
    </div>
    
    <div>
      <p className="text-sm text-muted-foreground mb-1">Rationale</p>
      <p className="text-sm">{decision.rationale}</p>
    </div>
    
    {decision.tradeoffs && decision.tradeoffs.length > 0 && (
      <div>
        <p className="text-sm text-muted-foreground mb-2">Tradeoffs Considered</p>
        <ul className="list-disc list-inside space-y-1 text-sm">
          {decision.tradeoffs.map((tradeoff, i) => (
            <li key={i}>{tradeoff}</li>
          ))}
        </ul>
      </div>
    )}
    
    {/* Evidence links */}
    {(decision.evidence_task_ids?.length > 0 || 
      decision.evidence_rfq_ids?.length > 0) && (
      <div>
        <p className="text-sm text-muted-foreground mb-2">Evidence</p>
        <div className="flex flex-wrap gap-2">
          {decision.evidence_task_ids?.map(taskId => (
            <Link 
              key={taskId}
              href={`/tasks/${taskId}`}
              className="text-sm text-primary hover:underline"
            >
              Task #{taskId.slice(0, 8)}
            </Link>
          ))}
          {decision.evidence_rfq_ids?.map(rfqId => (
            <Link 
              key={rfqId}
              href={`/rfq/${rfqId}`}
              className="text-sm text-primary hover:underline"
            >
              RFQ #{rfqId.slice(0, 8)}
            </Link>
          ))}
        </div>
      </div>
    )}
    
    {/* Stage context */}
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span>Made at: <strong>{decision.made_at_stage}</strong></span>
      {decision.frozen_at_stage && (
        <span>Frozen at: <strong>{decision.frozen_at_stage}</strong></span>
      )}
    </div>
  </CardContent>
</Card>
```

### 5.3 Add Decision Dialog

```tsx
// AddDecisionDialog.tsx

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent size="md">
    <DialogHeader>
      <DialogTitle>Add Decision or Assumption</DialogTitle>
    </DialogHeader>
    
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type selector */}
      <div className="space-y-2">
        <Label>Type</Label>
        <RadioGroup value={formData.type} onValueChange={setFormData({...formData, type})}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="decision" id="type-decision" />
            <Label htmlFor="type-decision">Decision (irreversible choice)</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="assumption" id="type-assumption" />
            <Label htmlFor="type-assumption">Assumption (hypothesis to validate)</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="constraint" id="type-constraint" />
            <Label htmlFor="type-constraint">Constraint (external limit)</Label>
          </div>
        </RadioGroup>
      </div>
      
      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => setFormData({...formData, title: e.target.value})}
          placeholder="e.g., 18650 Li-Ion cells for battery pack"
          required
        />
      </div>
      
      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          rows={4}
          required
        />
      </div>
      
      {/* Rationale */}
      <div className="space-y-2">
        <Label htmlFor="rationale">Rationale *</Label>
        <Textarea
          id="rationale"
          value={formData.rationale}
          onChange={(e) => setFormData({...formData, rationale: e.target.value})}
          rows={3}
          placeholder="Why this decision was made or assumption is reasonable"
          required
        />
      </div>
      
      {/* Link to tasks/RFQs */}
      <div className="space-y-2">
        <Label>Link Evidence (optional)</Label>
        <div className="space-y-2">
          <Select
            value={selectedTaskId}
            onValueChange={setSelectedTaskId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Link to task..." />
            </SelectTrigger>
            <SelectContent>
              {tasks.map(task => (
                <SelectItem key={task.id} value={task.id}>
                  {task.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select
            value={selectedRfqId}
            onValueChange={setSelectedRfqId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Link to RFQ..." />
            </SelectTrigger>
            <SelectContent>
              {rfqs.map(rfq => (
                <SelectItem key={rfq.id} value={rfq.id}>
                  {rfq.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <DialogFooter>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit">
          Add {formData.type === 'decision' ? 'Decision' : formData.type === 'assumption' ? 'Assumption' : 'Constraint'}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

### 5.4 Supersede Decision Dialog

```tsx
// SupersedeDecisionDialog.tsx

<AlertDialog open={open} onOpenChange={setOpen}>
  <AlertDialogContent size="md">
    <AlertDialogHeader>
      <AlertDialogTitle>Supersede Decision</AlertDialogTitle>
      <AlertDialogDescription>
        {isFrozen ? (
          <>
            This decision is <strong>frozen</strong> because it was made at the <strong>{decision.made_at_stage}</strong> stage 
            and the blueprint is now at <strong>{currentStage}</strong>. Changing it requires explicit override.
          </>
        ) : (
          "Creating a new decision will mark the current one as superseded."
        )}
      </AlertDialogDescription>
    </AlertDialogHeader>
    
    <div className="space-y-4">
      <div className="p-4 bg-muted rounded-lg">
        <p className="text-sm font-medium mb-2">Current Decision</p>
        <p className="text-sm">{decision.title}</p>
        <p className="text-xs text-muted-foreground mt-1">{decision.description}</p>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="reason">Reason for Supersession *</Label>
        <Textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Why is this decision being superseded?"
          required
        />
      </div>
      
      {isFrozen && currentStage === 'production' && (
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Executive Approval Required</AlertTitle>
          <AlertDescription>
            Changing frozen decisions at the production stage requires Executive role.
          </AlertDescription>
        </Alert>
      )}
    </div>
    
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={handleSupersede}
        disabled={!reason.trim() || (isFrozen && needsExecutiveApproval && !isExecutive)}
      >
        Create New Decision
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### 5.5 Decision Impact Visualization

Show which domains are affected by a decision:

```tsx
// DecisionImpactView.tsx

<div className="decision-impact space-y-2">
  <p className="text-sm font-medium">Impact on Other Domains</p>
  <div className="space-y-1">
    {decision.impacts_domains?.map(domainId => {
      const domain = domains.find(d => d.id === domainId);
      return (
        <div key={domainId} className="flex items-center gap-2 text-sm">
          <Link href={`/blueprints/${blueprintId}/domains/${domainId}`}>
            {domain?.name || domainId.slice(0, 8)}
          </Link>
          <Badge variant="outline">Impacted</Badge>
        </div>
      );
    })}
    {decision.blocks_domains?.map(domainId => {
      const domain = domains.find(d => d.id === domainId);
      return (
        <div key={domainId} className="flex items-center gap-2 text-sm">
          <Link href={`/blueprints/${blueprintId}/domains/${domainId}`}>
            {domain?.name || domainId.slice(0, 8)}
          </Link>
          <Badge variant="destructive">Blocked</Badge>
        </div>
      );
    })}
  </div>
</div>
```

---

## 6. Normalized Table Evolution

### 6.1 Current State (JSONB Array)

**Pros:**
- ✅ Simple to implement (no schema changes)
- ✅ Fast reads (single column query)
- ✅ Domain-scoped (decisions live with domain coverage)

**Cons:**
- ❌ Hard to query across domains ("show all decisions made at prototype stage")
- ❌ No foreign key constraints
- ❌ Limited indexing (GIN index helps but not perfect)
- ❌ Array operations can be complex

### 6.2 Future Evolution: Normalized Table

**When to Consider:**
- Decision count > 100 per blueprint
- Need for cross-domain decision queries
- Need for decision versioning/history
- Need for decision approval workflows

**Proposed Schema:**

```sql
-- Normalized decisions table (future migration)
CREATE TABLE blueprint_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
  domain_id UUID NOT NULL REFERENCES knowledge_domains(id) ON DELETE CASCADE,
  
  -- Core fields
  type decision_type NOT NULL,
  status decision_status NOT NULL DEFAULT 'proposed',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  rationale TEXT NOT NULL,
  tradeoffs TEXT[],
  
  -- Evidence (normalized via junction tables)
  -- evidence_task_ids → blueprint_decision_tasks
  -- evidence_rfq_ids → blueprint_decision_rfqs
  
  -- Dependencies
  blocks_domains UUID[],
  requires_domains UUID[],
  impacts_domains UUID[],
  
  -- Stage context
  made_at_stage project_stage NOT NULL,
  frozen_at_stage project_stage,
  
  -- Supersession
  superseded_by UUID REFERENCES blueprint_decisions(id),
  superseded_reason TEXT,
  superseded_at TIMESTAMPTZ,
  
  -- Provenance
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Foundry isolation
  foundry_id UUID NOT NULL REFERENCES foundries(id) ON DELETE CASCADE,
  
  -- Constraints
  CONSTRAINT valid_supersession CHECK (
    (status = 'superseded' AND superseded_by IS NOT NULL) OR
    (status != 'superseded' AND superseded_by IS NULL)
  )
);

-- Enums
CREATE TYPE decision_type AS ENUM ('decision', 'assumption', 'constraint');
CREATE TYPE decision_status AS ENUM ('proposed', 'approved', 'superseded');

-- Indexes
CREATE INDEX idx_blueprint_decisions_blueprint ON blueprint_decisions(blueprint_id);
CREATE INDEX idx_blueprint_decisions_domain ON blueprint_decisions(domain_id);
CREATE INDEX idx_blueprint_decisions_status ON blueprint_decisions(status);
CREATE INDEX idx_blueprint_decisions_stage ON blueprint_decisions(made_at_stage);
CREATE INDEX idx_blueprint_decisions_type ON blueprint_decisions(type);
CREATE INDEX idx_blueprint_decisions_foundry ON blueprint_decisions(foundry_id);

-- Junction tables for evidence
CREATE TABLE blueprint_decision_tasks (
  decision_id UUID NOT NULL REFERENCES blueprint_decisions(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (decision_id, task_id)
);

CREATE TABLE blueprint_decision_rfqs (
  decision_id UUID NOT NULL REFERENCES blueprint_decisions(id) ON DELETE CASCADE,
  rfq_id UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  PRIMARY KEY (decision_id, rfq_id)
);

-- RLS policies
ALTER TABLE blueprint_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_decision_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_decision_rfqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view decisions in their foundry"
ON blueprint_decisions FOR SELECT
USING (foundry_id = get_my_foundry_id());

CREATE POLICY "Users can create decisions in their foundry"
ON blueprint_decisions FOR INSERT
WITH CHECK (foundry_id = get_my_foundry_id() AND created_by = auth.uid());

CREATE POLICY "Users can update decisions in their foundry"
ON blueprint_decisions FOR UPDATE
USING (foundry_id = get_my_foundry_id())
WITH CHECK (foundry_id = get_my_foundry_id());
```

### 6.3 Migration Strategy

**Phase 1: Dual Write (MVP)**
- Keep JSONB array in `blueprint_domain_coverage.decisions`
- Add normalized table (optional, for new features)
- Write to both locations

**Phase 2: Migration Script**
- Copy all decisions from JSONB to normalized table
- Validate data integrity
- Update application code to read from normalized table

**Phase 3: Remove JSONB**
- Drop `decisions` column from `blueprint_domain_coverage`
- Update all queries

**Recommendation:** Start with JSONB (MVP), evolve to normalized table when needed.

---

## 7. Analytics Events

### 7.1 Decision Creation

**Event:** `AR-100: decision_created`

```typescript
{
  event: 'decision_created',
  properties: {
    blueprint_id: string,
    domain_id: string,
    decision_id: string,
    decision_type: 'decision' | 'assumption' | 'constraint',
    status: 'proposed' | 'approved',
    made_at_stage: ProjectStage,
    has_evidence: boolean,
    evidence_task_count: number,
    evidence_rfq_count: number,
    provenance_type: 'user_entered' | 'ai_suggested' | 'option_commit',
    source_option_set_id?: string
  }
}
```

### 7.2 Decision Approval

**Event:** `AR-101: decision_approved`

```typescript
{
  event: 'decision_approved',
  properties: {
    blueprint_id: string,
    domain_id: string,
    decision_id: string,
    decision_type: 'decision' | 'assumption' | 'constraint',
    approved_by: string, // profile_id
    time_to_approval_hours: number // From created_at to approved_at
  }
}
```

### 7.3 Assumption Validation

**Event:** `AR-102: assumption_validated`

```typescript
{
  event: 'assumption_validated',
  properties: {
    blueprint_id: string,
    domain_id: string,
    decision_id: string,
    validated_by: string, // profile_id
    validation_method: 'task_completion' | 'rfq_response' | 'expert_review' | 'manual',
    validation_task_id?: string,
    time_to_validation_hours: number // From created_at to validated_at
  }
}
```

### 7.4 Decision Supersession

**Event:** `AR-103: decision_superseded`

```typescript
{
  event: 'decision_superseded',
  properties: {
    blueprint_id: string,
    domain_id: string,
    old_decision_id: string,
    new_decision_id: string,
    old_decision_stage: ProjectStage,
    current_stage: ProjectStage,
    was_frozen: boolean,
    required_override: boolean,
    superseded_by: string, // profile_id
    reason_provided: boolean
  }
}
```

### 7.5 Frozen Decision Override

**Event:** `AR-104: frozen_decision_overridden`

```typescript
{
  event: 'frozen_decision_overridden',
  properties: {
    blueprint_id: string,
    domain_id: string,
    decision_id: string,
    decision_stage: ProjectStage,
    current_stage: ProjectStage,
    override_reason_length: number,
    overridden_by_role: 'Founder' | 'Executive' | 'Apprentice'
  }
}
```

### 7.6 Decision Impact Analysis

**Event:** `AR-105: decision_impact_analyzed`

```typescript
{
  event: 'decision_impact_analyzed',
  properties: {
    blueprint_id: string,
    domain_id: string,
    decision_id: string,
    impacted_domains_count: number,
    blocked_domains_count: number,
    required_domains_count: number,
    analysis_method: 'manual' | 'ai_suggested'
  }
}
```

---

## 8. Edge Cases

### EC-01: Decision Made Before Domain Coverage Created

**Scenario:** User creates a decision for a domain that doesn't have a `blueprint_domain_coverage` record yet.

**Handling:**
1. Auto-create `blueprint_domain_coverage` record with `status: 'gap'`
2. Add decision to the new record's `decisions` array
3. Log creation to `blueprint_history`

```typescript
async function addDecisionToDomain(
  blueprintId: string,
  domainId: string,
  decision: Decision
): Promise<void> {
  // Ensure domain coverage exists
  let coverage = await getDomainCoverage(blueprintId, domainId);
  if (!coverage) {
    coverage = await createDomainCoverage(blueprintId, domainId, {
      status: 'gap',
      decisions: []
    });
  }
  
  // Add decision
  const updatedDecisions = [...(coverage.decisions || []), decision];
  await updateDomainCoverage(coverage.id, {
    decisions: updatedDecisions
  });
}
```

### EC-02: Circular Decision Dependencies

**Scenario:** Decision A requires domain X, Decision B (in domain X) requires domain Y, Decision C (in domain Y) requires domain A's domain.

**Handling:**
1. Detect cycles during decision creation
2. Show warning: "This creates a circular dependency"
3. Allow creation but flag for review
4. Surface in domain panel: "Circular dependency detected"

```typescript
function detectCircularDependency(
  blueprintId: string,
  domainId: string,
  requiresDomains: string[]
): string[] | null {
  const visited = new Set<string>();
  const path: string[] = [];
  
  function dfs(currentDomain: string): string[] | null {
    if (path.includes(currentDomain)) {
      return [...path, currentDomain]; // Cycle detected
    }
    
    if (visited.has(currentDomain)) {
      return null; // Already explored, no cycle
    }
    
    visited.add(currentDomain);
    path.push(currentDomain);
    
    const coverage = getDomainCoverage(blueprintId, currentDomain);
    const decisions = coverage?.decisions || [];
    
    for (const decision of decisions) {
      if (decision.status === 'approved' && decision.requires_domains) {
        for (const reqDomain of decision.requires_domains) {
          const cycle = dfs(reqDomain);
          if (cycle) return cycle;
        }
      }
    }
    
    path.pop();
    return null;
  }
  
  for (const reqDomain of requiresDomains) {
    const cycle = dfs(reqDomain);
    if (cycle) return cycle;
  }
  
  return null;
}
```

### EC-03: Decision Superseded Multiple Times

**Scenario:** Decision A → Decision B → Decision C (chain of supersessions).

**Handling:**
1. Track full chain: `superseded_by` → `superseded_by` → ...
2. Show chain in UI: "Superseded by Decision B, which was superseded by Decision C"
3. Allow navigation: "View supersession chain"

```typescript
function getSupersessionChain(decisionId: string): Decision[] {
  const chain: Decision[] = [];
  let current = getDecision(decisionId);
  
  while (current) {
    chain.push(current);
    if (current.superseded_by) {
      current = getDecision(current.superseded_by);
    } else {
      break;
    }
  }
  
  return chain;
}
```

### EC-04: Assumption Never Validated

**Scenario:** Assumption created at `prototype` stage, blueprint advances to `production` without validation.

**Handling:**
1. Show warning badge: "Unvalidated assumption"
2. Increase domain risk score
3. Surface in stage gate: "X unvalidated assumptions"
4. Allow manual validation: "Mark as validated" (with reason)

### EC-05: Decision Made at Wrong Stage

**Scenario:** User creates a decision at `concept` stage that should have been made at `evt` (e.g., "PCB supplier selected").

**Handling:**
1. Show warning: "This decision is typically made at {typical_stage} stage"
2. Allow creation anyway (user may have valid reason)
3. Log to history with note

### EC-06: Evidence Task Deleted

**Scenario:** Decision links to task that gets deleted.

**Handling:**
1. Keep `evidence_task_ids` array (don't cascade delete)
2. Show "Task not found" badge in UI
3. Allow removal: "Remove broken link"
4. Optionally: Auto-remove on task deletion (soft delete)

### EC-07: Decision with No Evidence

**Scenario:** User creates decision without linking any tasks/RFQs.

**Handling:**
1. Allow creation (evidence can be added later)
2. Show warning badge: "No evidence linked"
3. Prompt: "Link evidence to strengthen this decision"
4. Don't block approval, but flag for review

### EC-08: Multiple Decisions Conflict

**Scenario:** Two approved decisions in same domain conflict (e.g., "Use Supplier A" and "Use Supplier B").

**Handling:**
1. Detect conflicts during creation (if possible)
2. Show warning: "This conflicts with existing decision: {other_decision.title}"
3. Require explicit acknowledgment
4. Allow both to exist (user may be comparing)
5. Surface conflict in domain panel

### EC-09: Decision Impacts Deleted Domain

**Scenario:** Decision lists `impacts_domains: [domainId]`, but that domain is deleted from blueprint.

**Handling:**
1. Keep decision intact (don't cascade)
2. Show "Domain not found" in impact list
3. Allow removal: "Remove broken domain reference"
4. Optionally: Auto-cleanup on domain deletion

### EC-10: Assumption Validated After Stage Advance

**Scenario:** Assumption created at `prototype`, validated at `dvt` stage.

**Handling:**
1. Update `validated_at` timestamp
2. Change status: `assumption` → `decision` (or keep as assumption but mark validated)
3. Log validation to history
4. Show timeline: "Assumption → Validated at DVT"

### EC-11: Decision JSONB Array Too Large

**Scenario:** Domain has 50+ decisions, JSONB array becomes unwieldy.

**Handling:**
1. Paginate decision list in UI (show 10 at a time)
2. Add filtering (by type, status, stage)
3. Consider migration to normalized table (see Section 6)
4. Add GIN index on `decisions` column for performance

### EC-12: Decision Created by AI Agent

**Scenario:** Ghost Worker (T9 task) proposes a decision.

**Handling:**
1. Set `provenance.provenance_type: 'ai_suggested'`
2. Set `status: 'proposed'` (not `'approved'`)
3. Require human approval before `status: 'approved'`
4. Show "AI Suggested" badge in UI
5. Allow user to edit before approving

---

## 9. Implementation Checklist

### 9.1 Backend

- [ ] Add TypeScript types for `Decision`, `DecisionType`, `DecisionStatus`
- [ ] Create `addDecisionToDomain()` server action
- [ ] Create `updateDecision()` server action (for supersession)
- [ ] Create `getDecisionsForDomain()` query function
- [ ] Implement `isDecisionFrozen()` helper
- [ ] Implement `detectCircularDependency()` helper
- [ ] Add GIN index on `blueprint_domain_coverage.decisions`
- [ ] Add RLS policy checks for decision operations
- [ ] Integrate with `blueprint_history` logging
- [ ] Add validation for decision JSON schema

### 9.2 Frontend

- [ ] Create `DecisionCard` component
- [ ] Create `DecisionList` component with filtering
- [ ] Create `AddDecisionDialog` component
- [ ] Create `SupersedeDecisionDialog` component
- [ ] Add decisions section to `DomainDetailPanel`
- [ ] Add decision impact visualization
- [ ] Add frozen decision warning UI
- [ ] Add circular dependency detection UI
- [ ] Add decision timeline view (optional)
- [ ] Integrate with task/RFQ linking

### 9.3 Analytics

- [ ] Implement `AR-100: decision_created` event
- [ ] Implement `AR-101: decision_approved` event
- [ ] Implement `AR-102: assumption_validated` event
- [ ] Implement `AR-103: decision_superseded` event
- [ ] Implement `AR-104: frozen_decision_overridden` event
- [ ] Implement `AR-105: decision_impact_analyzed` event

### 9.4 Integration

- [ ] Link OptionSet commits to decision creation
- [ ] Link task completion to assumption validation
- [ ] Link RFQ responses to decision evidence
- [ ] Update domain risk scoring to include unvalidated assumptions
- [ ] Update stage gate evaluation to check frozen decisions
- [ ] Add decision export (for reports)

### 9.5 Testing

- [ ] Unit test decision JSON schema validation
- [ ] Unit test freeze logic by stage
- [ ] Unit test circular dependency detection
- [ ] E2E test: Create decision in domain panel
- [ ] E2E test: Supersede frozen decision
- [ ] E2E test: Link decision to task
- [ ] E2E test: Validate assumption
- [ ] Test RLS enforcement on decision operations
- [ ] Test analytics events fire correctly

---

## Changes Made

| File | Action |
|------|--------|
| `docs/blueprint/10-decisions-assumptions.md` | Created - Full decisions and assumptions specification |
| `docs/blueprint/INDEX.md` | Updated - Added Decision Type and Decision Status enums |
| `docs/blueprint/ORCHESTRATION.md` | Updated - Marked Step 10 complete with timestamp |
