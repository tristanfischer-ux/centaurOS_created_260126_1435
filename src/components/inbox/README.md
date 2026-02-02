# Inbox Components

## PeopleList

A WhatsApp-style people list component for displaying foundry members with messaging features.

### Features

- **Search functionality** - Real-time filtering by name, role, or last message
- **Presence indicators** - Visual online/away/offline status using semantic colors
- **Unread badges** - Prominent badge showing unread message count
- **Last message preview** - Shows most recent message content
- **Grouped display** - Automatically groups by online/offline status
- **Touch-friendly** - Minimum 44px touch targets for accessibility
- **Responsive design** - Full width on mobile, fixed 300px on desktop

### Usage

```tsx
import { PeopleList } from '@/components/inbox'

function MyInbox() {
  const [selectedPerson, setSelectedPerson] = useState<string>()
  
  const members = [
    {
      id: '1',
      full_name: 'John Doe',
      avatar_url: '/avatars/john.jpg',
      role: 'Executive',
      online_status: 'online',
      last_message: 'Hey, how are you?',
      last_message_at: '2024-02-02T10:30:00Z',
      unread_count: 3
    },
    // ... more members
  ]

  return (
    <PeopleList
      members={members}
      selectedPersonId={selectedPerson}
      onSelectPerson={setSelectedPerson}
    />
  )
}
```

### Props

```typescript
interface PeopleListProps {
  members: Array<{
    id: string                                    // Required: Unique member ID
    full_name: string                             // Required: Display name
    avatar_url?: string                           // Optional: Avatar image URL
    role: string                                  // Required: Member role (for color coding)
    online_status?: 'online' | 'away' | 'offline' // Optional: Presence status
    last_message?: string                         // Optional: Last message preview
    last_message_at?: string                      // Optional: ISO timestamp of last message
    unread_count?: number                         // Optional: Number of unread messages
  }>
  selectedPersonId?: string                       // Optional: Currently selected person ID
  onSelectPerson: (personId: string) => void      // Required: Callback when person clicked
  className?: string                              // Optional: Additional CSS classes
}
```

### Design System Compliance

- ✅ Uses semantic color tokens (`status-success`, `status-warning`, `muted-foreground`)
- ✅ Uses design system components (`UserAvatar`, `Badge`, `Input`, `ScrollArea`)
- ✅ Follows layout spacing standards (`space-y-2`, consistent padding)
- ✅ Touch-friendly with `min-h-[44px]` targets
- ✅ Accessible with proper ARIA labels and keyboard navigation
- ✅ Responsive with mobile-first approach

### Presence Colors

- **Online** - `status-success` (green)
- **Away** - `status-warning` (yellow/orange)
- **Offline** - `muted-foreground/30` (gray)

### Grouping

Members are automatically grouped into two sections:
1. **Online** - Includes both 'online' and 'away' statuses
2. **Offline** - Includes 'offline' and members with no status

Each group is sorted alphabetically by name.

### Time Formatting

Last message times are formatted relative to current time:
- Less than 1 minute: "Now"
- Less than 60 minutes: "23m"
- Less than 24 hours: "4h"
- Less than 7 days: "3d"
- 7 days or more: "Jan 15"

### Accessibility

- Minimum 44px touch targets for all interactive elements
- Proper ARIA labels for presence indicators
- Keyboard navigation support via button elements
- Screen reader friendly with semantic HTML
- High contrast text and visual indicators
