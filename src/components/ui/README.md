# UI Component Guidelines

This document provides guidelines for using overlay components (dropdowns, popovers, dialogs) consistently across the application.

## Z-Index Hierarchy

All overlay components use a standardized z-index scale to ensure proper stacking:

| Layer | Z-Index | Components |
|-------|---------|------------|
| Base content | `z-0` | Page content |
| Elevated cards | `z-10` | Cards with shadows |
| Sticky elements | `z-40` | Sticky headers, sidebars |
| Overlays | `z-50` | Dropdowns, popovers, dialogs, tooltips |

**Key principle:** All overlays use `z-50`. Stacking order within the same z-index level is determined by DOM order (later elements appear on top). Radix UI's Portal system handles this automatically.

---

## Dropdown Components

### 1. Select (Simple Dropdown)

**Use when:** You need a simple dropdown with static options, no search required.

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

<Select value={value} onValueChange={setValue}>
  <SelectTrigger>
    <SelectValue placeholder="Select option..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
    <SelectItem value="option2">Option 2</SelectItem>
  </SelectContent>
</Select>
```

### 2. Popover + Command (Searchable Combobox)

**Use when:** You need a searchable dropdown (e.g., assignee pickers, user selection).

```tsx
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command"
import { Button } from "@/components/ui/button"

<Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild>
    <Button variant="outline">
      {selectedValue || "Select..."}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-[250px] p-0" align="start">
    <Command>
      <CommandInput placeholder="Search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {items.map((item) => (
          <CommandItem
            key={item.id}
            onSelect={() => {
              setSelectedValue(item.id)
              setOpen(false)
            }}
          >
            {item.label}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

### 3. MultiSelect

**Use when:** Users need to select multiple items with visual badges.

```tsx
import { MultiSelect } from "@/components/ui/multi-select"

const options = [
  { value: "user1", label: "John Doe", icon: <Avatar /> },
  { value: "user2", label: "Jane Smith", icon: <Avatar /> },
]

<MultiSelect
  options={options}
  selected={selectedIds}
  onChange={setSelectedIds}
  placeholder="Select assignees..."
/>
```

### 4. DropdownMenu (Action Menus)

**Use when:** You need a menu of actions (edit, delete, etc.), not for form selection.

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon">
      <MoreHorizontal className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={handleEdit}>Edit</DropdownMenuItem>
    <DropdownMenuItem onClick={handleDelete}>Delete</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

## Best Practices

### Dropdowns Inside Dialogs

Dropdowns inside dialogs work correctly because:
1. Both use `z-50`
2. The dropdown's Portal renders after the dialog in DOM order
3. Radix automatically manages focus and stacking

No special handling is needed.

### Collision Detection

For dropdowns near screen edges, use `collisionPadding`:

```tsx
<PopoverContent collisionPadding={16}>
  {/* Content */}
</PopoverContent>
```

This ensures the dropdown repositions to stay within viewport bounds.

### Alignment

Control dropdown alignment with the `align` prop:

```tsx
<SelectContent align="start" />  // Left-aligned
<SelectContent align="center" /> // Center-aligned (default)
<SelectContent align="end" />    // Right-aligned
```

### Side Placement

Control which side the dropdown opens on:

```tsx
<PopoverContent side="bottom" /> // Opens below (default)
<PopoverContent side="top" />    // Opens above
<PopoverContent side="left" />   // Opens to the left
<PopoverContent side="right" />  // Opens to the right
```

---

## Component Selection Guide

| Scenario | Component |
|----------|-----------|
| Simple option list (3-10 items) | `Select` |
| Long searchable list | `Popover` + `Command` |
| Multiple selection with badges | `MultiSelect` |
| Action menu (edit, delete) | `DropdownMenu` |
| Assignee/user picker | `Popover` + `Command` |
| Date selection | `DatePicker` (uses Popover) |

---

## Troubleshooting

### Dropdown appears behind other content

1. Ensure the component uses `z-50` (all UI components should by default)
2. Check if a parent has `overflow: hidden` which clips the Portal
3. Verify the component uses Radix Portal (default behavior)

### Dropdown doesn't close when clicking outside

1. Ensure `onOpenChange` is wired up correctly
2. Check for event propagation issues (`e.stopPropagation()` calls)

### Dropdown content is cut off

1. Add `collisionPadding` prop
2. Check `max-height` CSS values
3. Use `--radix-*-content-available-height` CSS variable for dynamic height
