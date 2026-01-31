---
name: feature-implementation-guide
description: Guide for implementing new features in CentaurOS following the established architecture patterns. Use when adding new platform features, API endpoints, database tables, UI components, or when the user asks about implementing features, creating new functionality, or following project conventions.
---

# Feature Implementation Guide

This skill provides step-by-step guidance for implementing new features in CentaurOS while maintaining architectural consistency.

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
- [ ] 7. UI Standards compliance check ← NEW
- [ ] 8. Add to appropriate route
- [ ] 9. Test functionality
```

### Step 7: UI Standards Compliance

**IMPORTANT:** Before committing UI code, verify:

```
UI Compliance Checklist:
- [ ] No hardcoded status colors (text-red/green/amber/blue-*)
- [ ] Forms have proper ARIA attributes (aria-required, aria-invalid, aria-describedby)
- [ ] Error messages use text-destructive and role="alert"
- [ ] Dialogs use size prop (not custom max-w-[])
- [ ] Status indicators use StatusBadge component
- [ ] Icon-only buttons have aria-label
- [ ] Cards use Card component (not custom divs)
```

See the **ui-component-standards** skill for complete reference.

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

### RLS Best Practices

Always include `foundry_id` in tables and RLS policies to ensure data isolation between organizations.

```sql
-- Standard RLS pattern for CentaurOS
create policy "Policy name"
  on public.table_name for {select|insert|update|delete}
  using (foundry_id = (select foundry_id from auth.users where id = auth.uid()));
```

## Common Patterns

### AI Integration

For AI-powered features, see [references/ai-integration-patterns.md](references/ai-integration-patterns.md)

### Realtime Updates

For features requiring realtime updates, see [references/realtime-patterns.md](references/realtime-patterns.md)

### Payment Integration

For payment-related features, see [references/payment-patterns.md](references/payment-patterns.md)

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

## Additional Resources

- [Project Architecture](references/architecture-patterns.md)
- [Database Conventions](references/database-conventions.md)
- [Component Patterns](references/component-patterns.md)

---

**Remember**: Always test with different user roles and foundry contexts to ensure RLS policies work correctly!
