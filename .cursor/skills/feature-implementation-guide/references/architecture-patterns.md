# CentaurOS Architecture Patterns

This reference provides detailed architectural patterns used throughout CentaurOS.

## Table of Contents

1. [Layered Architecture](#layered-architecture)
2. [Data Flow Patterns](#data-flow-patterns)
3. [Authentication & Authorization](#authentication--authorization)
4. [AI Integration](#ai-integration)
5. [Realtime Features](#realtime-features)
6. [Error Handling](#error-handling)

## Layered Architecture

CentaurOS follows a strict layered architecture to maintain separation of concerns:

```
┌─────────────────────────────────────┐
│   UI Layer (Client Components)     │  src/components/
│   - Forms, Cards, Dialogs          │
│   - User interactions               │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   Route Layer (Server Components)  │  src/app/
│   - Data fetching                   │
│   - Page layouts                    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   Action Layer (Server Actions)    │  src/actions/
│   - Form submissions                │
│   - User-triggered mutations        │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   Service Layer (Business Logic)   │  src/lib/
│   - Reusable business logic         │
│   - Data transformations            │
│   - Complex queries                 │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   Data Layer (Supabase)            │  Database
│   - PostgreSQL with RLS             │
│   - Realtime subscriptions          │
└─────────────────────────────────────┘
```

### When to Use Each Layer

| Layer | Purpose | Example |
|-------|---------|---------|
| **UI Components** | User interface, client-side state | `FeatureForm`, `FeatureCard` |
| **Routes** | Initial data loading, page structure | `page.tsx`, `layout.tsx` |
| **Actions** | Form submissions, mutations | `createFeatureAction()` |
| **Services** | Reusable business logic | `getFeatures()`, `updateFeature()` |
| **Data** | Direct database access | Supabase queries |

## Data Flow Patterns

### Pattern 1: Form Submission Flow

```typescript
// 1. User submits form (Client Component)
// src/components/feature/feature-form.tsx
'use client';

export function FeatureForm() {
  async function handleSubmit(formData: FormData) {
    const result = await createFeatureAction(formData);
    // Handle result
  }
  
  return <form action={handleSubmit}>...</form>;
}

// 2. Server Action processes (Server)
// src/actions/feature.ts
'use server';

export async function createFeatureAction(formData: FormData) {
  // Validate input
  const validated = schema.parse(formData);
  
  // Call service layer
  const result = await createFeature(validated);
  
  // Revalidate cache
  revalidatePath('/feature');
  
  return { success: true, data: result };
}

// 3. Service layer executes (Server)
// src/lib/feature/service.ts
export async function createFeature(input: CreateFeatureInput) {
  const supabase = await createClient();
  
  // Business logic
  const processed = await processInput(input);
  
  // Database operation
  const { data, error } = await supabase
    .from('features')
    .insert(processed)
    .select()
    .single();
    
  if (error) throw error;
  return data;
}
```

### Pattern 2: Data Loading Flow

```typescript
// 1. Route fetches data (Server Component)
// src/app/(platform)/feature/page.tsx
export default async function FeaturePage() {
  const features = await getFeatures();
  
  return <FeatureList features={features} />;
}

// 2. Service layer queries (Server)
// src/lib/feature/service.ts
export async function getFeatures() {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('features')
    .select('*')
    .order('created_at', { ascending: false });
    
  if (error) throw error;
  return data;
}

// 3. Component renders (Client)
// src/components/feature/feature-list.tsx
'use client';

export function FeatureList({ features }) {
  return (
    <div>
      {features.map(feature => (
        <FeatureCard key={feature.id} feature={feature} />
      ))}
    </div>
  );
}
```

## Authentication & Authorization

### Foundry Context Pattern

CentaurOS uses a multi-tenant architecture with `foundry_id` for data isolation:

```typescript
// Get current user's foundry context
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();

if (!user) {
  throw new Error('Unauthorized');
}

// User metadata contains foundry_id
const foundryId = user.user_metadata?.foundry_id;
```

### RLS Policy Patterns

**Standard Read Policy:**
```sql
create policy "Users can view own foundry data"
  on public.table_name for select
  using (
    foundry_id = (
      select user_metadata->>'foundry_id' 
      from auth.users 
      where id = auth.uid()
    )::uuid
  );
```

**Standard Write Policy:**
```sql
create policy "Users can insert own foundry data"
  on public.table_name for insert
  with check (
    foundry_id = (
      select user_metadata->>'foundry_id' 
      from auth.users 
      where id = auth.uid()
    )::uuid
  );
```

**Role-Based Policy (Admin Only):**
```sql
create policy "Only admins can update"
  on public.table_name for update
  using (
    exists (
      select 1 from public.users
      where id = auth.uid()
      and role = 'admin'
      and foundry_id = table_name.foundry_id
    )
  );
```

## AI Integration

### Ghost Worker Pattern

CentaurOS uses the "Ghost Worker" pattern for AI-powered features:

```sql
-- 1. Database trigger fires on task assignment
create trigger on_task_assigned_to_ai
  after insert or update on public.tasks
  for each row
  when (new.assignee_type = 'ai')
  execute function invoke_ghost_worker();

-- 2. Trigger invokes Edge Function
create function invoke_ghost_worker()
returns trigger as $$
begin
  perform net.http_post(
    url := 'https://[project].supabase.co/functions/v1/ghost-worker',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key')),
    body := jsonb_build_object('task_id', new.id)
  );
  return new;
end;
$$ language plpgsql;
```

```typescript
// 3. Edge Function processes with AI
// supabase/functions/ghost-worker/index.ts
import { OpenAI } from 'openai';

Deno.serve(async (req) => {
  const { task_id } = await req.json();
  
  // Fetch task context
  const task = await getTaskContext(task_id);
  
  // Generate AI response
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: task.persona },
      { role: 'user', content: task.description },
    ],
  });
  
  // Update task with AI response
  await updateTask(task_id, {
    status: 'amended_pending_approval',
    amendment_notes: completion.choices[0].message.content,
  });
  
  return new Response('OK');
});
```

### AI Service Integration Pattern

For client-side AI features:

```typescript
// src/lib/ai/service.ts
export async function generateSuggestions(input: string) {
  const response = await fetch('/api/ai/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to generate suggestions');
  }
  
  return response.json();
}

// src/app/api/ai/suggestions/route.ts
export async function POST(request: Request) {
  const { input } = await request.json();
  
  // Verify authentication
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // Generate with AI
  const suggestions = await openai.chat.completions.create({...});
  
  return Response.json({ suggestions });
}
```

## Realtime Features

### Subscription Pattern

```typescript
// src/components/feature/realtime-list.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function RealtimeFeatureList({ initialData }) {
  const [features, setFeatures] = useState(initialData);
  const supabase = createClient();
  
  useEffect(() => {
    const channel = supabase
      .channel('features')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'features',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setFeatures(prev => [payload.new, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setFeatures(prev => 
              prev.map(f => f.id === payload.new.id ? payload.new : f)
            );
          } else if (payload.eventType === 'DELETE') {
            setFeatures(prev => prev.filter(f => f.id !== payload.old.id));
          }
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);
  
  return <div>{/* Render features */}</div>;
}
```

## Error Handling

### Standard Error Response Pattern

All server actions and API routes should return consistent error responses:

```typescript
type ActionResult<T> = 
  | { success: true; data: T }
  | { success: false; error: string };

export async function createFeatureAction(input: unknown): Promise<ActionResult<Feature>> {
  try {
    // Validate
    const validated = schema.parse(input);
    
    // Execute
    const result = await createFeature(validated);
    
    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to create feature:', error);
    
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Invalid input data' };
    }
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create feature' 
    };
  }
}
```

### Client-Side Error Handling

```typescript
'use client';

import { toast } from 'sonner';

export function FeatureForm() {
  async function handleSubmit(formData: FormData) {
    const result = await createFeatureAction(formData);
    
    if (result.success) {
      toast.success('Feature created successfully');
      // Handle success
    } else {
      toast.error(result.error);
      // Handle error
    }
  }
  
  return <form action={handleSubmit}>...</form>;
}
```

### Service Layer Error Handling

```typescript
// src/lib/feature/service.ts
export async function getFeatureOrNull(id: string): Promise<Feature | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('features')
      .select('*')
      .eq('id', id)
      .single();
      
    if (error) {
      if (error.code === 'PGRST116') {
        // Not found is expected, return null
        return null;
      }
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('Failed to fetch feature:', error);
    throw error;
  }
}
```

---

## Quick Reference

### File Structure for New Features

```
New Feature: "invoicing"

1. Database:
   supabase/migrations/20260130_invoicing.sql

2. Types:
   src/types/invoicing.ts

3. Service Layer:
   src/lib/invoicing/
   ├── service.ts        # Core business logic
   ├── generator.ts      # Invoice generation
   └── pdf.ts           # PDF export

4. Actions:
   src/actions/invoicing.ts

5. Components:
   src/components/invoices/
   ├── invoice-form.tsx
   ├── invoice-list.tsx
   └── index.ts

6. Routes:
   src/app/(platform)/invoices/
   ├── page.tsx
   └── [id]/
       └── page.tsx
```

### Common Imports

```typescript
// Supabase
import { createClient } from '@/lib/supabase/server';      // Server
import { createClient } from '@/lib/supabase/client';      // Client

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

// Forms & Validation
import { z } from 'zod';
import { toast } from 'sonner';

// Next.js
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
```
