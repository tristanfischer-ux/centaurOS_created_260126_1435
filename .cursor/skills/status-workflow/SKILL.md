---
name: status-workflow
description: Patterns for implementing status workflows and state machines in CentaurOS. Use when implementing state machine, status, workflow, transitions, lifecycle, or when a feature needs status tracking with transitions.
---

# Status Workflow Patterns

This skill provides patterns for implementing status-based workflows with state machines.

## Examples in Codebase

- **Pitch Prep:** `draft → submitted → in_review → matched → completed`
- **RFQ:** `open → bidding → awarded → closed`
- **Orders:** `pending → confirmed → in_progress → completed → disputed`
- **Timesheets:** `draft → submitted → approved → paid`

---

## 1. TypeScript Status Definition

### Define Status Enum

```typescript
// src/types/feature-name.ts

// Status type as union (preferred for type safety)
export type FeatureStatus = 
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'completed'

// Array of all statuses (for validation/iteration)
export const FEATURE_STATUSES = [
  'draft',
  'submitted',
  'in_review',
  'approved',
  'rejected',
  'completed',
] as const satisfies readonly FeatureStatus[]

// Status display configuration
export const FEATURE_STATUS_CONFIG: Record<FeatureStatus, {
  label: string
  color: 'success' | 'warning' | 'error' | 'info' | 'default'
  description: string
}> = {
  draft: {
    label: 'Draft',
    color: 'default',
    description: 'Not yet submitted',
  },
  submitted: {
    label: 'Submitted',
    color: 'info',
    description: 'Awaiting review',
  },
  in_review: {
    label: 'In Review',
    color: 'warning',
    description: 'Being reviewed by team',
  },
  approved: {
    label: 'Approved',
    color: 'success',
    description: 'Approved and ready',
  },
  rejected: {
    label: 'Rejected',
    color: 'error',
    description: 'Not approved',
  },
  completed: {
    label: 'Completed',
    color: 'success',
    description: 'Finished',
  },
}
```

---

## 2. Database Schema

### Status Column with Constraints

```sql
-- Create table with status
CREATE TABLE public.feature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  foundry_id UUID NOT NULL REFERENCES public.foundries(id),
  
  -- Status with check constraint
  status TEXT NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'completed')),
  
  -- Track status changes
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for filtering by status
CREATE INDEX idx_feature_requests_status ON public.feature_requests(status);
```

### Status History Table (Optional)

Track all status transitions:

```sql
CREATE TABLE public.feature_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id UUID NOT NULL REFERENCES public.feature_requests(id) ON DELETE CASCADE,
  
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Trigger to auto-log status changes
CREATE OR REPLACE FUNCTION log_feature_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.feature_status_history (feature_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_log_status_change
  AFTER UPDATE ON public.feature_requests
  FOR EACH ROW
  EXECUTE FUNCTION log_feature_status_change();
```

---

## 3. State Machine Validation

### Define Valid Transitions

```typescript
// src/lib/feature-name/transitions.ts

type FeatureStatus = 'draft' | 'submitted' | 'in_review' | 'approved' | 'rejected' | 'completed'

// Define which transitions are allowed
const VALID_TRANSITIONS: Record<FeatureStatus, FeatureStatus[]> = {
  draft: ['submitted'],
  submitted: ['in_review', 'rejected'],
  in_review: ['approved', 'rejected'],
  approved: ['completed'],
  rejected: ['draft'],  // Can be returned to draft for revision
  completed: [],        // Terminal state
}

export function isValidTransition(from: FeatureStatus, to: FeatureStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function getAvailableTransitions(current: FeatureStatus): FeatureStatus[] {
  return VALID_TRANSITIONS[current] ?? []
}
```

### Server Action with Validation

```typescript
// src/actions/feature-name.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isValidTransition, FeatureStatus } from '@/lib/feature-name/transitions'

export async function updateFeatureStatus(
  featureId: string,
  newStatus: FeatureStatus
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  // Get current status
  const { data: feature, error: fetchError } = await supabase
    .from('feature_requests')
    .select('id, status, user_id')
    .eq('id', featureId)
    .single()
  
  if (fetchError || !feature) {
    return { success: false, error: 'Feature not found' }
  }
  
  // Validate transition
  if (!isValidTransition(feature.status as FeatureStatus, newStatus)) {
    return { 
      success: false, 
      error: `Cannot transition from ${feature.status} to ${newStatus}` 
    }
  }
  
  // Update status with timestamp
  const updates: Record<string, unknown> = { 
    status: newStatus,
    updated_at: new Date().toISOString(),
  }
  
  // Set appropriate timestamp
  switch (newStatus) {
    case 'submitted':
      updates.submitted_at = new Date().toISOString()
      break
    case 'approved':
    case 'rejected':
      updates.reviewed_at = new Date().toISOString()
      break
    case 'completed':
      updates.completed_at = new Date().toISOString()
      break
  }
  
  const { error: updateError } = await supabase
    .from('feature_requests')
    .update(updates)
    .eq('id', featureId)
  
  if (updateError) {
    return { success: false, error: 'Failed to update status' }
  }
  
  revalidatePath('/features')
  return { success: true }
}
```

---

## 4. UI Components

### Status Badge Display

```tsx
import { StatusBadge } from '@/components/ui/status-badge'
import { FEATURE_STATUS_CONFIG, FeatureStatus } from '@/types/feature-name'

function FeatureStatusBadge({ status }: { status: FeatureStatus }) {
  const config = FEATURE_STATUS_CONFIG[status]
  
  return (
    <StatusBadge status={config.color}>
      {config.label}
    </StatusBadge>
  )
}
```

### Status Transition Buttons

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { getAvailableTransitions, FeatureStatus } from '@/lib/feature-name/transitions'
import { FEATURE_STATUS_CONFIG } from '@/types/feature-name'
import { updateFeatureStatus } from '@/actions/feature-name'
import { toast } from 'sonner'

function StatusActions({ 
  featureId, 
  currentStatus 
}: { 
  featureId: string
  currentStatus: FeatureStatus 
}) {
  const [isPending, startTransition] = useTransition()
  const availableTransitions = getAvailableTransitions(currentStatus)
  
  if (availableTransitions.length === 0) {
    return <span className="text-muted-foreground text-sm">No actions available</span>
  }
  
  const handleTransition = (newStatus: FeatureStatus) => {
    startTransition(async () => {
      const result = await updateFeatureStatus(featureId, newStatus)
      if (result.success) {
        toast.success(`Status updated to ${FEATURE_STATUS_CONFIG[newStatus].label}`)
      } else {
        toast.error(result.error || 'Failed to update status')
      }
    })
  }
  
  return (
    <div className="flex gap-2">
      {availableTransitions.map((status) => {
        const config = FEATURE_STATUS_CONFIG[status]
        return (
          <Button
            key={status}
            variant={status === 'rejected' ? 'destructive' : 'default'}
            size="sm"
            disabled={isPending}
            onClick={() => handleTransition(status)}
          >
            {config.label}
          </Button>
        )
      })}
    </div>
  )
}
```

### Status Timeline

```tsx
import { CheckCircle2, Circle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FEATURE_STATUSES, FEATURE_STATUS_CONFIG, FeatureStatus } from '@/types/feature-name'

function StatusTimeline({ currentStatus }: { currentStatus: FeatureStatus }) {
  const currentIndex = FEATURE_STATUSES.indexOf(currentStatus)
  
  return (
    <div className="flex items-center gap-2">
      {FEATURE_STATUSES.map((status, index) => {
        const config = FEATURE_STATUS_CONFIG[status]
        const isCompleted = index < currentIndex
        const isCurrent = index === currentIndex
        
        return (
          <div key={status} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border-2',
                  isCompleted && 'border-status-success bg-status-success text-white',
                  isCurrent && 'border-accent bg-accent text-accent-foreground',
                  !isCompleted && !isCurrent && 'border-muted text-muted-foreground'
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : isCurrent ? (
                  <Clock className="h-4 w-4" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
              </div>
              <span className="mt-1 text-xs">{config.label}</span>
            </div>
            
            {/* Connector line */}
            {index < FEATURE_STATUSES.length - 1 && (
              <div
                className={cn(
                  'mx-2 h-0.5 w-8',
                  index < currentIndex ? 'bg-status-success' : 'bg-muted'
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
```

---

## 5. Notifications on Status Change

### Trigger Notifications

```typescript
// In your server action after successful status update:

import { sendNotification } from '@/lib/notifications'

// After updating status
if (newStatus === 'approved') {
  await sendNotification({
    userId: feature.user_id,
    title: 'Request Approved',
    body: 'Your request has been approved and is ready for the next step.',
    type: 'status_update',
    priority: 'high',
    actionUrl: `/features/${featureId}`,
    metadata: {
      featureId,
      oldStatus: feature.status,
      newStatus,
    },
  })
}
```

---

## 6. Checklist

Before implementing a status workflow:

### Design
- [ ] Define all possible statuses
- [ ] Map valid transitions (state machine)
- [ ] Identify terminal states
- [ ] Decide if history tracking is needed

### Database
- [ ] Add status column with CHECK constraint
- [ ] Add timestamp columns for key statuses
- [ ] Create index on status column
- [ ] Create history table (if needed)
- [ ] Create trigger for history logging (if needed)

### TypeScript
- [ ] Define status type as union
- [ ] Create status array for iteration
- [ ] Create status config with labels/colors
- [ ] Implement transition validation functions

### Server Actions
- [ ] Validate current status before transition
- [ ] Update appropriate timestamp columns
- [ ] Send notifications on key transitions
- [ ] Return meaningful error messages

### UI
- [ ] Use StatusBadge for display
- [ ] Show available actions based on current status
- [ ] Disable buttons during transitions
- [ ] Show loading state during updates
- [ ] Display status timeline (optional)
