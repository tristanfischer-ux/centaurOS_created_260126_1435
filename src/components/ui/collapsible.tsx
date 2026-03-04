"use client"

import * as React from "react"
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

const Collapsible = CollapsiblePrimitive.Root

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger

// GOTCHA: @radix-ui/react-id wraps React.useId() inside useState, which
// generates mismatched IDs between server and client in React 19 + Next.js
// App Router (tree paths differ due to RSC boundaries). The ID mismatch is
// cosmetic — it doesn't break functionality. suppressHydrationWarning
// silences the console warning.
const CollapsibleContent = React.forwardRef<
  React.ComponentRef<typeof CollapsiblePrimitive.CollapsibleContent>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.CollapsibleContent>
>((props, ref) => (
  <CollapsiblePrimitive.CollapsibleContent
    ref={ref}
    suppressHydrationWarning
    {...props}
  />
))
CollapsibleContent.displayName = "CollapsibleContent"

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
