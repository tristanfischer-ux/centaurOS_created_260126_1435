# Comparison Component Refactoring Plan

## Status: Foundation Created

The shared hook `src/hooks/use-comparison.ts` has been created. The full component refactor is documented here for future implementation.

## Problem

Two nearly identical comparison modals exist:
- `src/components/marketplace/comparison-modal.tsx` (~723 lines)
- `src/components/team/team-comparison-modal.tsx` (~691 lines)

When a bug is fixed in one, it's often missed in the other (see POST_MORTEM_COMPARISON_MODAL_20260202.md).

## Solution: Shared Base Component

### Phase 1: Shared Hook (COMPLETED)

`src/hooks/use-comparison.ts` provides:
- AI analysis state management
- Error handling
- Modal open/close cleanup
- Best value computation utilities

### Phase 2: Adopt Hook in Existing Components

Update both modals to use the shared hook:

```tsx
// In comparison-modal.tsx
import { useComparison } from '@/hooks/use-comparison'

export function ComparisonModal({ open, onOpenChange, items }) {
  const {
    aiAnalysis,
    isAnalyzing,
    analysisError,
    analyzeWithAI,
    clearAnalysis,
    handleOpenChange,
    clearError
  } = useComparison({
    endpoint: '/api/marketplace/compare',
    items,
    onOpenChange
  })
  
  // ... rest of component uses these instead of local state
}
```

### Phase 3: Extract Shared UI Components

Create reusable components:

```
src/components/shared/
  comparison/
    ai-analysis-card.tsx      # AI analysis result display
    ai-analysis-error.tsx     # Error state display
    comparison-grid.tsx       # Desktop grid layout
    comparison-cards.tsx      # Mobile card layout
    best-value-indicator.tsx  # Trend up/down indicators
    section-group.tsx         # Attribute section grouping
```

### Phase 4: Create Base Modal

```tsx
// src/components/shared/comparison/comparison-modal-base.tsx

interface ComparisonModalBaseProps<T> {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: T[]
  title: string
  apiEndpoint: string
  renderHeader: (item: T) => React.ReactNode
  renderValue: (item: T, key: string) => React.ReactNode
  getSections: (items: T[]) => SectionConfig[]
  getItemId: (item: T) => string
}

export function ComparisonModalBase<T>({
  open,
  onOpenChange,
  items,
  title,
  apiEndpoint,
  renderHeader,
  renderValue,
  getSections,
  getItemId
}: ComparisonModalBaseProps<T>) {
  const comparison = useComparison({ endpoint: apiEndpoint, items, onOpenChange })
  
  // Shared modal structure
  // Delegates rendering to callbacks
}
```

### Phase 5: Simplify Existing Modals

```tsx
// src/components/marketplace/comparison-modal.tsx (simplified)

import { ComparisonModalBase } from '@/components/shared/comparison/comparison-modal-base'

export function ComparisonModal({ open, onOpenChange, items }) {
  return (
    <ComparisonModalBase
      open={open}
      onOpenChange={onOpenChange}
      items={items}
      title="Compare Listings"
      apiEndpoint="/api/marketplace/compare"
      renderHeader={renderListingHeader}
      renderValue={renderListingValue}
      getSections={getListingSections}
      getItemId={(item) => item.id}
    />
  )
}
```

## Testing Strategy

Before each refactoring step:

1. Ensure E2E tests pass
2. Run comparison tests: `npm run test:e2e -- --grep="@critical"`
3. Test manually in browser

After each step:

1. Run E2E tests again
2. Manually verify both comparison modals work
3. Check console for errors

## Risk Mitigation

- **Do NOT refactor both components simultaneously**
- Start with marketplace, verify, then apply to team
- Each PR should only change ONE component
- Full E2E test coverage required before starting

## Estimated Effort

- Phase 2 (adopt hook): 1-2 hours per component
- Phase 3 (extract UI): 2-3 hours
- Phase 4 (base modal): 2-3 hours
- Phase 5 (simplify): 1 hour per component

Total: ~10-12 hours of focused work

## Success Criteria

After refactoring:
- Single source of truth for comparison logic
- Fix in base component = fix everywhere
- Reduced code from ~1400 lines to ~400 lines
- All E2E tests pass
- No regression in functionality
