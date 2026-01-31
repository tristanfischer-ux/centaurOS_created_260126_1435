# Component Patterns in CentaurOS

Common component patterns and best practices used throughout the CentaurOS codebase.

## Table of Contents

1. [Server vs Client Components](#server-vs-client-components)
2. [Form Patterns](#form-patterns)
3. [List & Card Patterns](#list--card-patterns)
4. [Modal & Dialog Patterns](#modal--dialog-patterns)
5. [Loading & Empty States](#loading--empty-states)

## Server vs Client Components

### When to Use Server Components

Server Components are the default in Next.js App Router. Use them for:
- Data fetching
- Direct database access
- Accessing backend resources
- Reducing client-side JavaScript

```typescript
// src/app/(platform)/features/page.tsx
import { getFeatures } from '@/lib/features/service';
import { FeatureList } from '@/components/features/feature-list';

// Server Component (default)
export default async function FeaturesPage() {
  const features = await getFeatures();
  
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Features</h1>
      <FeatureList features={features} />
    </div>
  );
}
```

### When to Use Client Components

Use `'use client'` for:
- Event handlers (onClick, onChange, etc.)
- State management (useState, useReducer)
- Effects (useEffect)
- Browser-only APIs
- Custom hooks

```typescript
// src/components/features/feature-form.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function FeatureForm() {
  const [loading, setLoading] = useState(false);
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Handle submission
  }
  
  return (
    <form onSubmit={handleSubmit}>
      <Button type="submit" disabled={loading}>
        Submit
      </Button>
    </form>
  );
}
```

## Form Patterns

### Pattern 1: Server Action Form

The recommended pattern for forms in CentaurOS:

```typescript
// src/components/features/create-feature-form.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { createFeatureAction } from '@/actions/features';

export function CreateFeatureForm() {
  const [loading, setLoading] = useState(false);
  
  async function handleSubmit(formData: FormData) {
    setLoading(true);
    
    try {
      const result = await createFeatureAction(formData);
      
      if (result.success) {
        toast.success('Feature created successfully');
        // Reset form or redirect
      } else {
        toast.error(result.error);
      }
    } finally {
      setLoading(false);
    }
  }
  
  return (
    <form action={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          required
          disabled={loading}
        />
      </div>
      
      <div>
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          name="description"
          disabled={loading}
        />
      </div>
      
      <Button type="submit" disabled={loading}>
        {loading ? 'Creating...' : 'Create Feature'}
      </Button>
    </form>
  );
}
```

### Pattern 2: Form with Validation & Accessibility

Using react-hook-form with Zod validation and proper accessibility:

```typescript
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const featureSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']),
});

type FeatureFormData = z.infer<typeof featureSchema>;

export function ValidatedFeatureForm() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FeatureFormData>({
    resolver: zodResolver(featureSchema),
  });
  
  async function onSubmit(data: FeatureFormData) {
    const result = await createFeatureAction(data);
    
    if (result.success) {
      toast.success('Feature created');
    } else {
      toast.error(result.error);
    }
  }
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">
          Name
          <span className="text-destructive ml-1" aria-label="required">*</span>
        </Label>
        <Input
          id="name"
          {...register('name')}
          placeholder="Name"
          aria-required
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "name-error" : undefined}
          className={cn(errors.name && "border-destructive")}
        />
        {errors.name && (
          <p id="name-error" role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>
      
      <Button type="submit" disabled={isSubmitting}>
        Submit
      </Button>
    </form>
  );
}
```

## List & Card Patterns

### Pattern 1: Server Component List

```typescript
// src/app/(platform)/features/page.tsx
import { getFeatures } from '@/lib/features/service';
import { FeatureCard } from '@/components/features/feature-card';

export default async function FeaturesPage() {
  const features = await getFeatures();
  
  if (features.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No features found</p>
      </div>
    );
  }
  
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {features.map((feature) => (
        <FeatureCard key={feature.id} feature={feature} />
      ))}
    </div>
  );
}
```

### Pattern 2: Interactive Card Component

```typescript
// src/components/features/feature-card.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, Edit } from 'lucide-react';
import { deleteFeatureAction } from '@/actions/features';
import { toast } from 'sonner';

interface FeatureCardProps {
  feature: {
    id: string;
    name: string;
    description: string;
    status: string;
    created_at: string;
  };
}

export function FeatureCard({ feature }: FeatureCardProps) {
  const [deleting, setDeleting] = useState(false);
  
  async function handleDelete() {
    if (!confirm('Are you sure?')) return;
    
    setDeleting(true);
    const result = await deleteFeatureAction(feature.id);
    
    if (result.success) {
      toast.success('Feature deleted');
    } else {
      toast.error(result.error);
      setDeleting(false);
    }
  }
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle>{feature.name}</CardTitle>
          <Badge>{feature.status}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          {feature.description}
        </p>
        
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button 
            variant="destructive" 
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

## Modal & Dialog Patterns

### Dialog Size Guidelines

Always use the `size` prop instead of custom width classes:

| Size | Width | Use For |
|------|-------|---------|
| `sm` | 425px | Confirmations, simple forms |
| `md` | 600px | Standard forms (most dialogs) |
| `lg` | 800px | Complex forms, multi-step wizards |

```tsx
// ✅ CORRECT - Use size prop
<DialogContent size="md">

// ❌ WRONG - Don't use custom widths
<DialogContent className="sm:max-w-[600px]">
```

### Pattern 1: Dialog with Form

```typescript
// src/components/features/create-feature-dialog.tsx
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CreateFeatureForm } from './create-feature-form';

export function CreateFeatureDialog() {
  const [open, setOpen] = useState(false);
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create Feature</Button>
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Create New Feature</DialogTitle>
        </DialogHeader>
        <CreateFeatureForm onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
```

### Pattern 2: Confirmation Dialog

```typescript
// src/components/shared/confirm-dialog.tsx
'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Usage:
function FeatureCard() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  
  async function handleConfirmDelete() {
    await deleteFeature();
    setConfirmOpen(false);
  }
  
  return (
    <>
      <Button onClick={() => setConfirmOpen(true)}>Delete</Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleConfirmDelete}
        title="Delete Feature"
        description="This action cannot be undone. Are you sure?"
      />
    </>
  );
}
```

## Loading & Empty States

### Pattern 1: Loading Skeleton

```typescript
// src/components/features/feature-list-skeleton.tsx
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function FeatureListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-3/4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Usage in loading.tsx
// src/app/(platform)/features/loading.tsx
import { FeatureListSkeleton } from '@/components/features/feature-list-skeleton';

export default function Loading() {
  return <FeatureListSkeleton />;
}
```

### Pattern 2: Empty State

```typescript
// src/components/shared/empty-state.tsx
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-4">
        {description}
      </p>
      {action && (
        <Button onClick={action.onClick}>{action.label}</Button>
      )}
    </div>
  );
}

// Usage:
import { EmptyState } from '@/components/shared/empty-state';
import { Plus } from 'lucide-react';

export function FeaturesList({ features }) {
  if (features.length === 0) {
    return (
      <EmptyState
        icon={<Plus className="h-12 w-12" />}
        title="No features yet"
        description="Get started by creating your first feature"
        action={{
          label: "Create Feature",
          onClick: () => console.log('create'),
        }}
      />
    );
  }
  
  return <div>{/* render features */}</div>;
}
```

### Pattern 3: Suspense Boundary

```typescript
// src/app/(platform)/features/page.tsx
import { Suspense } from 'react';
import { FeatureList } from '@/components/features/feature-list';
import { FeatureListSkeleton } from '@/components/features/feature-list-skeleton';

export default function FeaturesPage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Features</h1>
      
      <Suspense fallback={<FeatureListSkeleton />}>
        <FeatureList />
      </Suspense>
    </div>
  );
}

// src/components/features/feature-list.tsx (async server component)
import { getFeatures } from '@/lib/features/service';

export async function FeatureList() {
  const features = await getFeatures();
  
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {features.map((feature) => (
        <FeatureCard key={feature.id} feature={feature} />
      ))}
    </div>
  );
}
```

## Common Component Composition

### Composing Complex Features

```typescript
// src/app/(platform)/features/page.tsx
import { Suspense } from 'react';
import { FeatureList } from '@/components/features/feature-list';
import { FeatureFilters } from '@/components/features/feature-filters';
import { CreateFeatureDialog } from '@/components/features/create-feature-dialog';

export default function FeaturesPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Features</h1>
        <CreateFeatureDialog />
      </div>
      
      <div className="mb-6">
        <FeatureFilters />
      </div>
      
      <Suspense fallback={<div>Loading...</div>}>
        <FeatureList />
      </Suspense>
    </div>
  );
}
```

---

## Quick Reference

### Common UI Components

```typescript
// Buttons
<Button>Default</Button>
<Button variant="outline">Outline</Button>
<Button variant="destructive">Delete</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>

// Icon buttons - MUST have aria-label
<Button variant="ghost" size="icon" aria-label="Close">
  <X className="h-4 w-4" />
</Button>

// Cards - ALWAYS use Card component
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>Content</CardContent>
  <CardFooter>Footer</CardFooter>
</Card>

// Dialogs - Use size prop
<Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger asChild>
    <Button>Open</Button>
  </DialogTrigger>
  <DialogContent size="md">
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
    {/* Content */}
  </DialogContent>
</Dialog>

// Badges (for non-status labels)
<Badge>Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="outline">Outline</Badge>

// StatusBadge (for status indicators) - USE THIS for statuses
import { StatusBadge } from '@/components/ui/status-badge'

<StatusBadge status="success">Completed</StatusBadge>
<StatusBadge status="warning">Pending</StatusBadge>
<StatusBadge status="error">Failed</StatusBadge>
<StatusBadge status="info">In Progress</StatusBadge>
```

### Color Token Quick Reference

```typescript
// ❌ DON'T use hardcoded status colors
text-red-500, text-green-500, text-amber-500, text-blue-500
bg-red-100, bg-green-100, bg-amber-100, bg-blue-100

// ✅ DO use semantic tokens
text-destructive        // errors
text-status-success     // success
text-status-warning     // warnings
text-status-info        // information
bg-status-error-light   // error backgrounds
bg-status-success-light // success backgrounds
bg-status-warning-light // warning backgrounds
bg-status-info-light    // info backgrounds
```

### Notification Patterns

```typescript
import { toast } from 'sonner';

// Success
toast.success('Operation successful');

// Error
toast.error('Operation failed');

// Loading with promise
toast.promise(
  asyncOperation(),
  {
    loading: 'Processing...',
    success: 'Done!',
    error: 'Failed',
  }
);
```
