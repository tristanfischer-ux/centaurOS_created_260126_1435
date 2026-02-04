---
name: feature-implementation-guide
description: Guide for implementing new features in CentaurOS following the established architecture patterns. Use when adding new platform features, API endpoints, database tables, UI components, or when the user asks about implementing features, creating new functionality, or following project conventions.
role: |
  You are a senior architect who has maintained large codebases for years.
  You think about the developer who will read this code in 6 months.
  You follow established patterns unless there's a compelling reason not to.
  You never skip design token compliance. You never ship without testing.
---

# Feature Implementation Guide

This skill provides step-by-step guidance for implementing new features in CentaurOS while maintaining architectural consistency.

## Discovery (Before You Start)

Before implementing, ensure you have answers to these questions. If any are unclear, ask the user:

- [ ] **What problem does this feature solve?** (user need, business goal)
- [ ] **Who uses this feature?** (user types, roles, permissions needed)
- [ ] **What's the user flow?** (how do users interact with this?)
- [ ] **What data is involved?** (new tables? relationships? what's stored?)
- [ ] **What are the constraints?** (performance, security, compliance)
- [ ] **Is this MVP or full implementation?** (scope determination)

## Quick Reference

CentaurOS follows a layered architecture:
- **UI Layer**: `src/app/` (Next.js App Router) and `src/components/`
- **Business Logic**: `src/actions/` (Server Actions) and `src/lib/`
- **Data Layer**: Supabase with PostgreSQL + RLS
- **AI Layer**: Edge Functions for Ghost Worker and AI agents

## Implementation Checklist

When implementing a new feature, follow this workflow:

```
Feature Implementation Progress:
- [ ] 1. Define data model and schema
- [ ] 2. Create database migration
- [ ] 3. Update TypeScript types
- [ ] 4. Implement service layer logic
- [ ] 5. Create server actions
- [ ] 6. Build UI components
- [ ] 7. Design token compliance check ← MANDATORY
- [ ] 8. Add to appropriate route
- [ ] 9. Test functionality
```

### Step 7: Design Token Compliance (MANDATORY)

**STOP. Before proceeding to Step 8, you MUST run:**

```bash
./scripts/check-design-tokens.sh
```

If this script fails, fix ALL violations before committing. This is not optional.

**Common violations and fixes:**

| Violation | Fix |
|-----------|-----|
| `text-slate-*` or `text-gray-*` | Use `text-foreground` or `text-muted-foreground` |
| `text-red-*` | Use `text-destructive` |
| `text-green-*` or `text-emerald-*` | Use `text-status-success` |
| `text-amber-*` | Use `text-status-warning` |
| `text-blue-*` | Use `text-status-info` |
| `bg-white` | Use `bg-background` |
| `bg-slate-*` | Use `bg-muted` or `bg-secondary` |
| `dark:*` variants | Remove entirely (light mode only) |

**Additional UI checklist:**

```
- [ ] Forms have proper ARIA attributes (aria-required, aria-invalid, aria-describedby)
- [ ] Error messages use text-destructive and role="alert"
- [ ] Dialogs use size prop (not custom max-w-[])
- [ ] Status indicators use StatusBadge component
- [ ] Icon-only buttons have aria-label
- [ ] Cards use Card component (not custom divs)
```

See `.cursor/rules/color-consistency.mdc` for complete token mappings.
See the **ui-component-standards** skill for accessibility patterns.

## Step-by-Step Workflow

### Step 1: Define Data Model

Before coding, clarify:
- What data needs to be stored?
- What relationships exist with existing tables?
- What access controls are needed (RLS policies)?

**Example questions to answer:**
- Does this require a new table or extend an existing one?
- What foreign keys connect to `foundries`, `users`, `tasks`, etc.?
- Who can read/write this data?

### Step 2: Create Database Migration

Create a migration file in `supabase/migrations/`:

```sql
-- Example: 20260130120000_feature_name.sql
create table public.feature_name (
  id uuid primary key default gen_random_uuid(),
  foundry_id uuid references public.foundries(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- ... your columns
);

-- Enable RLS
alter table public.feature_name enable row level security;

-- RLS Policy: Users can only see data for their foundry
create policy "Users can view own foundry data"
  on public.feature_name for select
  using (foundry_id = (select foundry_id from auth.users where id = auth.uid()));
```

**Run migration:**
```bash
npx supabase db push
```

### Step 3: Update TypeScript Types

Add types to the appropriate file in `src/types/`:

```typescript
// src/types/feature-name.ts
export interface FeatureName {
  id: string;
  foundry_id: string;
  created_at: string;
  updated_at: string;
  // ... your fields
}

export interface CreateFeatureInput {
  // ... input fields
}
```

### Step 4: Implement Service Layer

Create service logic in `src/lib/feature-name/service.ts`:

```typescript
// src/lib/feature-name/service.ts
import { createClient } from '@/lib/supabase/server';

export async function getFeatureData(featureId: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('feature_name')
    .select('*')
    .eq('id', featureId)
    .single();
    
  if (error) throw error;
  return data;
}

export async function createFeature(input: CreateFeatureInput) {
  const supabase = await createClient();
  
  // Business logic here
  const { data, error } = await supabase
    .from('feature_name')
    .insert(input)
    .select()
    .single();
    
  if (error) throw error;
  return data;
}
```

### Step 5: Create Server Actions

Add server actions in `src/actions/feature-name.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { createFeature, getFeatureData } from '@/lib/feature-name/service';

export async function createFeatureAction(formData: FormData) {
  try {
    const input = {
      // Parse formData
    };
    
    const result = await createFeature(input);
    
    revalidatePath('/feature-path');
    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to create feature:', error);
    return { success: false, error: 'Failed to create feature' };
  }
}
```

### Step 6: Build UI Components

Create components in `src/components/feature-name/`:

```typescript
// src/components/feature-name/feature-form.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createFeatureAction } from '@/actions/feature-name';

export function FeatureForm() {
  const [loading, setLoading] = useState(false);
  
  async function handleSubmit(formData: FormData) {
    setLoading(true);
    const result = await createFeatureAction(formData);
    setLoading(false);
    
    if (result.success) {
      // Handle success
    }
  }
  
  return (
    <form action={handleSubmit}>
      {/* Form fields */}
      <Button type="submit" disabled={loading}>
        Create
      </Button>
    </form>
  );
}
```

### Step 7: Add to Route

Create or update the route in `src/app/(platform)/feature-path/page.tsx`:

```typescript
// src/app/(platform)/feature-path/page.tsx
import { FeatureForm } from '@/components/feature-name/feature-form';
import { getFeatureData } from '@/lib/feature-name/service';

export default async function FeaturePage() {
  const data = await getFeatureData();
  
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Feature Name</h1>
      <FeatureForm />
    </div>
  );
}
```

### Step 8: Test Functionality

**Manual testing checklist:**
- [ ] Can create new records?
- [ ] Can view existing records?
- [ ] RLS prevents unauthorized access?
- [ ] UI responds correctly to actions?
- [ ] Error states handled gracefully?

## Key Architecture Patterns

### Server Actions vs Direct Queries

- **Use Server Actions** (`src/actions/`) for mutations and user-triggered operations
- **Use Service Layer** (`src/lib/`) for reusable business logic
- **Direct Queries** in page components for initial data loading

### Component Organization

```
src/components/feature-name/
├── feature-form.tsx       # Forms and user input
├── feature-list.tsx       # List/table displays
├── feature-card.tsx       # Card displays
└── index.ts               # Barrel exports
```

### Service Layer Pattern (For Complex Features)

For features with significant business logic, separate concerns into a service layer (from billing implementation):

```
src/lib/feature-name/
├── service.ts          # Core business logic
├── fees.ts             # Specific calculations (if applicable)
├── webhooks.ts         # External service integration (if applicable)
├── types.ts            # Internal types (if not in src/types/)
└── index.ts            # Barrel exports with organized exports
```

**When to Use Service Layer:**
- Feature has complex business logic
- Multiple actions share the same logic
- External service integration (Stripe, Telegram, etc.)
- Complex calculations or validations

**Service Layer Example (from billing):**

```typescript
// src/lib/billing/index.ts
// Organized exports by concern

// Fee calculation
export {
  getSellerFeePercent,
  calculateOrderFee,
  getFeeDescription,
  FEE_TIERS,
} from './fees'

// Subscription management
export {
  getUserSubscription,
  createSubscriptionCheckout,
  cancelSubscription,
  type SubscriptionTier,
} from './subscriptions'

// Bank transfers
export {
  createBankTransferRequest,
  handleBankTransferReceived,
  type BankTransferRequest,
} from './bank-transfers'
```

**Actions Call Service Layer:**

```typescript
// src/actions/billing.ts
'use server'

import { calculateOrderFee, createSubscriptionCheckout } from '@/lib/billing'

export async function createCheckoutAction(priceId: string) {
  // Actions handle:
  // - Authentication
  // - Input validation
  // - Calling service layer
  // - Error wrapping
  // - Cache revalidation
  
  try {
    const result = await createSubscriptionCheckout(userId, priceId, successUrl, cancelUrl)
    revalidatePath('/settings/billing')
    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: 'Checkout failed' }
  }
}
```

### RLS Best Practices

Always include `foundry_id` in tables and RLS policies to ensure data isolation between organizations.

```sql
-- Standard RLS pattern for CentaurOS
create policy "Policy name"
  on public.table_name for {select|insert|update|delete}
  using (foundry_id = (select foundry_id from auth.users where id = auth.uid()));
```

## Common Patterns

### Payment Integration

For payment/billing features, use the **stripe-integration** skill which covers:
- Stripe Connect for marketplace
- Payment intents and checkout
- Webhook handling
- Subscription management

### Multi-Step Forms

For complex form wizards, use the **multi-step-form** skill which covers:
- Step navigation
- Per-step validation
- Progress indicators
- Form state management

### Status Workflows

For features with status transitions, use the **status-workflow** skill which covers:
- Status enums and types
- Valid transition validation
- Status history tracking
- UI status indicators

### Database Migrations

For complex migrations with functions/triggers, use the **supabase-migration** skill which covers:
- Atomic balance functions
- Metrics calculation triggers
- RPC functions

### Telegram Integration

For Telegram bot features, use the **telegram-integration** skill.

## Design System

CentaurOS uses a custom design system based on shadcn/ui:

- **Components**: `src/components/ui/`
- **Utilities**: `src/lib/utils.ts`
- **Typography**: Use `src/lib/design-system/typography.ts`
- **Animations**: Use `src/lib/design-system/animations.ts`

### Design Philosophy

**IMPORTANT:** CentaurOS design is **bright, airy, and optimistic** - NOT dark or dreary.

- Default to **light backgrounds** (foundry-50, foundry-100, white)
- Use **vibrant brand colors** (international-orange, electric-blue)
- Create **spacious layouts** with generous whitespace
- Design for **optimism and collaboration**

See `.cursor/rules/design-philosophy.mdc` for full guidelines.

Import UI components:
```typescript
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
```

## Validation

Use Zod schemas for input validation:

```typescript
import { z } from 'zod';

const featureSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
});

type FeatureInput = z.infer<typeof featureSchema>;
```

## Error Handling

Follow the consistent error handling pattern:

```typescript
try {
  const result = await someOperation();
  return { success: true, data: result };
} catch (error) {
  console.error('Operation failed:', error);
  return { 
    success: false, 
    error: error instanceof Error ? error.message : 'Operation failed' 
  };
}
```

## Next Steps After Implementation

1. **Update documentation** if the feature changes user workflows
2. **Consider analytics** - track feature usage if needed
3. **Add to onboarding** if relevant for new users
4. **Monitor performance** in production

## Anti-Patterns

**BAD:** Starting to code before understanding the data model
**WHY:** You'll refactor 3 times. Define the schema first, then build on solid foundation.

**BAD:** Skipping the design token compliance check
**WHY:** Hardcoded colors create tech debt. Run `./scripts/check-design-tokens.sh` EVERY time.

**BAD:** "I'll add RLS policies later"
**WHY:** Later never comes. Unprotected tables leak data. Add policies with the migration.

**BAD:** Building the UI before the server actions work
**WHY:** You'll build the wrong UI. Get data flowing first, then make it pretty.

**BAD:** Creating custom card/dialog styles instead of using components
**WHY:** Inconsistent UI. Use `<Card>`, `<Dialog size="md">`, not custom divs.

**BAD:** Putting business logic in React components
**WHY:** Untestable, hard to reuse. Put logic in `src/lib/`, call from actions.

## Evaluation (Before Completing)

Before marking a feature complete, verify:

- [ ] **Migration applied?** Did `npx supabase db push` succeed?
- [ ] **RLS enabled?** Does the new table have policies for all operations?
- [ ] **Types updated?** Are TypeScript types in sync with the schema?
- [ ] **Design tokens?** Does `./scripts/check-design-tokens.sh` pass?
- [ ] **Accessibility?** Do forms have proper ARIA attributes?
- [ ] **Tested?** Have you tested create, read, update, delete flows?
- [ ] **Different roles?** Does it work for all user roles that should access it?
- [ ] **Different foundries?** Is data properly isolated between foundries?

## Examples

### Example 1: Adding a Notes Feature

**Discovery answers:**
- Problem: Users want to add notes to tasks
- Who: All foundry members can add notes to tasks they can see
- Data: Note text, author, timestamp, linked to task

**Step 1: Migration**
```sql
-- supabase/migrations/20260204_task_notes.sql
create table public.task_notes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  foundry_id uuid references public.foundries(id) on delete cascade,
  author_id uuid references auth.users(id),
  content text not null,
  created_at timestamptz default now()
);

alter table public.task_notes enable row level security;

create policy "Users can view notes in their foundry"
  on public.task_notes for select
  using (foundry_id = get_my_foundry_id());

create policy "Users can create notes in their foundry"
  on public.task_notes for insert
  with check (foundry_id = get_my_foundry_id());
```

**Step 2: Types**
```typescript
// src/types/task-notes.ts
export interface TaskNote {
  id: string
  task_id: string
  foundry_id: string
  author_id: string
  content: string
  created_at: string
}
```

**Step 3: Server Action**
```typescript
// src/actions/task-notes.ts
'use server'

export async function addTaskNote(taskId: string, content: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  
  const foundryId = await getFoundryIdCached()
  
  const { data, error } = await supabase
    .from('task_notes')
    .insert({
      task_id: taskId,
      foundry_id: foundryId,
      author_id: user.id,
      content,
    })
    .select()
    .single()
  
  if (error) throw error
  revalidatePath(`/tasks/${taskId}`)
  return data
}
```

**Step 4: UI Component**
```tsx
// src/components/tasks/task-notes.tsx
'use client'

export function TaskNotes({ taskId, notes }: TaskNotesProps) {
  const [content, setContent] = useState('')
  
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await addTaskNote(taskId, content)
    setContent('')
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {notes.map(note => (
          <div key={note.id} className="text-sm">
            <p className="text-foreground">{note.content}</p>
            <p className="text-muted-foreground text-xs">
              {formatDate(note.created_at)}
            </p>
          </div>
        ))}
        <form onSubmit={handleSubmit}>
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Add a note..."
            aria-label="Note content"
          />
          <Button type="submit" className="mt-2">Add Note</Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

**Verification:**
- Ran design token check: passes
- Tested adding note: works
- Tested other foundry: can't see notes (isolation works)
- Tested as different user: can see and add notes

## Related Skills

| Skill | Use When |
|-------|----------|
| **ui-component-standards** | Creating UI components, forms, dialogs |
| **stripe-integration** | Adding payment/billing features |
| **multi-step-form** | Building form wizards |
| **status-workflow** | Implementing status-based workflows |
| **supabase-migration** | Creating complex database migrations |
| **accessibility-remediation** | Fixing accessibility issues |
| **telegram-integration** | Adding Telegram bot features |

## Additional Resources

- [Component Patterns](references/component-patterns.md)
- `.cursor/rules/` - Design system rules

---

**Remember**: Always test with different user roles and foundry contexts to ensure RLS policies work correctly!
