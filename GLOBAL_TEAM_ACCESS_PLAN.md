# Global Team Access Plan
## Making Team Information Accessible From Anywhere in CentaurOS

## 📋 Executive Summary

Create a floating, accessible team panel that can be opened from anywhere in the app, displaying team members with the same rich card design used on the Teams page. This provides instant access to team information without disrupting the current workflow.

---

## 🎯 Goals

1. **Accessibility** - Access team info from any page with a single click
2. **Consistency** - Use the exact same design structure as the Teams page
3. **Non-Disruptive** - Overlay interface that doesn't break current context
4. **Responsive** - Works beautifully on mobile and desktop
5. **Performance** - Fast loading with smart caching

---

## 🏗️ Architecture Overview

### Component Structure

```
FloatingTeamPanel (Client Component)
├── Trigger Button (Fixed position, always visible)
├── Sliding Panel / Dialog
│   ├── Header (Search, Filters, Close)
│   ├── Quick Stats Bar
│   ├── Team Member Grid (Reusable cards)
│   │   ├── MemberCard (from Teams page design)
│   │   ├── Quick Actions
│   │   └── Presence Indicators
│   └── Footer (View Full Teams Page link)
└── Keyboard Shortcuts (Cmd+K for quick access)
```

### Data Flow

1. **Initial Load** - Fetch team data once when app loads
2. **Real-time Updates** - Supabase realtime subscriptions for presence
3. **Caching** - Store in React Context/Zustand for instant access
4. **Refresh** - Auto-refresh on team/profile table changes

---

## 🎨 Design Specification

### 1. Trigger Button

**Location:** Fixed position, bottom-right corner (like a help widget)

**Design:**
- Floating action button (FAB) style
- International orange background
- Users icon or team icon
- Shows notification dot if someone new joins
- Subtle pulse animation on updates
- Z-index above most content but below modals

**Responsive:**
- Desktop: Bottom-right, 24px from edges
- Mobile: Bottom-right, 16px from edges, smaller size

### 2. Sliding Panel (Desktop)

**Behavior:**
- Slides in from right side
- Width: 480px
- Full height with padding
- Backdrop blur overlay (semi-transparent)
- Click outside to close
- Smooth slide animation (300ms ease-out)

**Content Sections:**
1. **Header Bar**
   - Title: "Team Directory"
   - Search box (filter by name/role)
   - View mode toggle (Grid/List)
   - Close button (X)

2. **Quick Stats**
   - Total members count
   - Online now (presence)
   - AI Agents count
   - Active tasks count

3. **Filter Tabs**
   - All Members
   - Founders
   - Executives
   - Apprentices
   - AI Agents
   - Online Now

4. **Member Cards Grid**
   - Same design as Teams page
   - Compact variant for space efficiency
   - 1 column on panel (full width)
   - Virtualized list for performance
   - Expandable cards (click to expand inline)

5. **Footer**
   - "View Full Teams Page" button
   - Keyboard shortcuts hint

### 3. Full Screen Modal (Mobile)

**Behavior:**
- Slides up from bottom
- Full screen coverage
- Native feel with momentum scrolling
- Swipe down to dismiss

**Content:**
- Same as desktop but optimized for touch
- Larger tap targets (48px minimum)
- Pull-to-refresh gesture

### 4. Member Card Design (Reuse from Teams Page)

**Collapsed State:**
```
┌─────────────────────────────────────┐
│ [Color Bar] [Avatar] [Name      ] [>]│
│             [Presence] [Role     ]    │
│                       [Tasks: 3  ]    │
│                       [Online    ]    │
└─────────────────────────────────────┘
```

**Expanded State:**
```
┌─────────────────────────────────────┐
│ [Color Bar] [Avatar] [Name      ] [v]│
│             [Presence] [Role     ]    │
│                                       │
│ Bio: [Short description...]          │
│                                       │
│ Tasks:                                │
│ • Active: 3 tasks                    │
│ • Pending: 1 task                    │
│ • Completed: 45 tasks                │
│                                       │
│ Quick Actions:                        │
│ [View Profile] [@Mention] [Message]  │
│                                       │
│ Last Seen: 5 minutes ago             │
└─────────────────────────────────────┘
```

**Features:**
- Role-based color coding (same as Teams page)
  - Founder: Purple accent
  - Executive: Amber accent
  - Apprentice: Blue accent
  - AI Agent: Indigo accent
- Presence indicator (online/offline/away)
- Centaur badge if paired with AI
- Task counts with color coding
- Quick action buttons
- Smooth expand/collapse animation

---

## 🔧 Implementation Plan

### Phase 1: Core Infrastructure (Week 1)

#### Step 1.1: Create Data Provider
**File:** `src/contexts/TeamContext.tsx`

**Features:**
- Fetch all team members on app load
- Real-time subscriptions for presence
- Caching with React Context
- Refresh functions
- Loading states

**Data Structure:**
```typescript
interface TeamMember {
  id: string
  full_name: string
  role: 'Founder' | 'Executive' | 'Apprentice' | 'AI_Agent'
  avatar_url: string | null
  bio: string | null
  presence: PresenceStatus
  paired_ai_id: string | null
  pairedAI: AIPartner | null
  taskStats: {
    active: number
    pending: number
    completed: number
    overdue: number
  }
  lastSeen: Date | null
}

interface TeamContextValue {
  members: TeamMember[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  searchQuery: string
  setSearchQuery: (query: string) => void
  selectedRole: RoleFilter
  setSelectedRole: (role: RoleFilter) => void
}
```

#### Step 1.2: Extract Reusable Member Card
**File:** `src/components/team/TeamMemberCard.tsx`

**Props:**
```typescript
interface TeamMemberCardProps {
  member: TeamMember
  variant: 'full' | 'compact'
  expandable: boolean
  showQuickActions: boolean
  onViewProfile: () => void
  onMention: () => void
  onMessage?: () => void
}
```

**Features:**
- Reuse exact design from Teams page
- Support both full and compact variants
- Optional quick actions
- Click to expand/collapse
- Presence indicator integration

### Phase 2: Floating Panel Component (Week 1-2)

#### Step 2.1: Create Panel Component
**File:** `src/components/team/FloatingTeamPanel.tsx`

**Features:**
- Sliding animation from right (desktop)
- Bottom sheet animation (mobile)
- Backdrop with blur effect
- Click outside to close
- Keyboard shortcuts (Esc to close, Cmd+K to toggle)

**Responsive Behavior:**
```typescript
// Desktop: Sliding panel
<motion.div
  initial={{ x: '100%' }}
  animate={{ x: 0 }}
  exit={{ x: '100%' }}
  transition={{ type: 'spring', damping: 30 }}
  className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-2xl z-50"
>
  {/* Panel content */}
</motion.div>

// Mobile: Bottom sheet
<motion.div
  initial={{ y: '100%' }}
  animate={{ y: 0 }}
  exit={{ y: '100%' }}
  className="fixed inset-0 bg-white z-50"
>
  {/* Full screen content */}
</motion.div>
```

#### Step 2.2: Create Trigger Button
**File:** `src/components/team/TeamPanelTrigger.tsx`

**Design:**
```typescript
<motion.button
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
  className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-international-orange shadow-lg flex items-center justify-center text-white z-40 hover:bg-international-orange-hover transition-colors"
>
  <Users className="h-6 w-6" />
  {hasNotification && (
    <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full border-2 border-white animate-pulse" />
  )}
</motion.button>
```

### Phase 3: Panel Features (Week 2)

#### Step 3.1: Header Section
- Search input with live filtering
- Role filter dropdown
- View mode toggle (Grid/List)
- Close button

#### Step 3.2: Quick Stats Bar
```tsx
<div className="grid grid-cols-4 gap-3 p-4 bg-foundry-50 border-b">
  <Stat icon={Users} label="Total" value={totalMembers} />
  <Stat icon={Circle} label="Online" value={onlineCount} color="green" />
  <Stat icon={Brain} label="AI Agents" value={aiCount} color="indigo" />
  <Stat icon={CheckCircle} label="Active Tasks" value={taskCount} color="blue" />
</div>
```

#### Step 3.3: Member List
- Virtualized scrolling for performance (react-window)
- Expandable cards
- Quick actions on hover
- Skeleton loading states

#### Step 3.4: Footer
- Link to full Teams page
- Keyboard shortcut hints

### Phase 4: Integration (Week 2-3)

#### Step 4.1: Add to Root Layout
**File:** `src/app/(platform)/layout.tsx`

```tsx
import { TeamProvider } from '@/contexts/TeamContext'
import { FloatingTeamPanel } from '@/components/team/FloatingTeamPanel'

export default function PlatformLayout({ children }) {
  return (
    <TeamProvider>
      {/* Existing layout */}
      {children}
      
      {/* Floating team panel - available everywhere */}
      <FloatingTeamPanel />
    </TeamProvider>
  )
}
```

#### Step 4.2: Refactor Teams Page
Update Teams page to use the new shared components:
- Use `TeamMemberCard` component
- Share data from `TeamContext`
- Remove duplicate code

### Phase 5: Advanced Features (Week 3)

#### Step 5.1: Keyboard Shortcuts
- `Cmd+K` / `Ctrl+K` - Toggle panel
- `Esc` - Close panel
- `/` - Focus search
- `Arrow keys` - Navigate members
- `Enter` - View profile
- `M` - Mention selected member

#### Step 5.2: Quick Actions Integration
**Mention Action:**
- Copy mention markdown: `@[Name](user-id)`
- Show toast with "Mention copied"
- Works with any mention-aware input

**Message Action** (Future):
- Open direct message modal
- Quick note to team member

**View Profile:**
- Navigate to `/team/[id]`
- Option to open in new tab

#### Step 5.3: Notifications
- Show badge when:
  - New member joins
  - Someone comes online (if you're watching them)
  - Task assigned from panel view

#### Step 5.4: Smart Sorting
Default sort options:
- **Online First** - Show online members at top
- **By Role** - Founders → Executives → Apprentices → AI
- **By Activity** - Most active (tasks) first
- **Alphabetical** - A-Z by name

---

## 📱 Responsive Design

### Desktop (≥768px)
- Sliding panel from right
- 480px width
- Full height
- Backdrop blur overlay

### Tablet (≥640px, <768px)
- Sliding panel from right
- 400px width or 60% viewport
- Full height

### Mobile (<640px)
- Bottom sheet
- Full width
- Full height (safe area aware)
- Swipe to dismiss

---

## 🎨 Design System Compliance

### Colors
- **Primary Trigger:** International Orange (`bg-international-orange`)
- **Panel Background:** White (`bg-white`)
- **Overlay:** Slate with blur (`bg-slate-900/20 backdrop-blur-sm`)
- **Accents:** Match role colors from Teams page

### Spacing
- Generous padding: `p-6` for sections
- Card spacing: `space-y-4`
- Safe margins from screen edges
- Follows "airy" design principle

### Typography
- Header: `font-display text-2xl font-bold`
- Body: `text-sm` or `text-base`
- Labels: `text-xs uppercase tracking-wide`

### Animations
- Smooth transitions (200-300ms)
- Spring animations for panel slide
- Hover effects on cards
- Pulse for notifications

---

## 🔐 Security & Privacy

### Data Access
- Only show members from same foundry
- Respect existing RLS policies
- Don't expose sensitive data (email, phone) in quick view
- Full details require navigation to profile page

### Presence Privacy
- Respect user privacy settings
- Option to disable presence tracking
- Don't expose exact timestamps in panel

---

## 🚀 Performance Optimization

### 1. Data Loading
- Load team data once on app mount
- Cache in React Context
- Incremental updates via Supabase realtime
- Don't refetch on every panel open

### 2. Rendering
- Virtualize member list (react-window)
- Lazy load expanded card content
- Debounce search input (300ms)
- Memoize filtered/sorted results

### 3. Bundle Size
- Code split panel component
- Lazy load when first opened
- Share components with Teams page
- Tree-shake unused features

---

## 📊 Success Metrics

### User Engagement
- Panel open rate
- Time spent in panel
- Member profile views from panel
- Search usage

### Performance
- Time to first render: <200ms
- Search response time: <100ms
- Panel animation: 60fps
- Memory usage: <10MB

### Adoption
- % of users who use panel vs navigating to Teams page
- Keyboard shortcut usage
- Mobile vs desktop usage

---

## 🧪 Testing Strategy

### Unit Tests
- TeamContext data fetching
- Search/filter logic
- Member card rendering
- Quick actions

### Integration Tests
- Panel open/close
- Real-time updates
- Keyboard shortcuts
- Role-based filtering

### E2E Tests (Playwright)
- Open panel from different pages
- Search and filter members
- View profile from panel
- Mobile swipe gestures
- Responsive breakpoints

### Accessibility Tests
- Keyboard navigation
- Screen reader support
- Focus management
- ARIA labels
- Color contrast

---

## 📝 Implementation Checklist

### Week 1: Foundation
- [ ] Create `TeamContext` with data provider
- [ ] Set up real-time subscriptions
- [ ] Extract `TeamMemberCard` component
- [ ] Create `FloatingTeamPanel` shell
- [ ] Create trigger button component
- [ ] Add to platform layout
- [ ] Basic open/close animation

### Week 2: Features
- [ ] Search functionality
- [ ] Role filtering
- [ ] Quick stats bar
- [ ] Member list with virtualization
- [ ] Expandable cards
- [ ] Quick actions (mention, view profile)
- [ ] Responsive design (mobile bottom sheet)
- [ ] Loading states

### Week 3: Polish
- [ ] Keyboard shortcuts
- [ ] Notification badges
- [ ] Smart sorting options
- [ ] Performance optimization
- [ ] Refactor Teams page to use shared components
- [ ] Error handling
- [ ] Empty states
- [ ] Documentation

### Week 4: Testing & Launch
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Write E2E tests
- [ ] Accessibility audit
- [ ] Performance audit
- [ ] User testing
- [ ] Bug fixes
- [ ] Deploy to production

---

## 🔄 Future Enhancements

### Phase 2 Features (Post-Launch)
1. **Quick Messaging** - Send direct message from panel
2. **Team Filters** - Filter by specific team membership
3. **Custom Views** - Save favorite filters/sorts
4. **Recent Interactions** - Show recently viewed/contacted members
5. **Quick Stats Expansion** - Click stats to filter (e.g., click "3 Online" to show only online members)
6. **Drag-to-Team** - Drag members to create ad-hoc teams
7. **Export List** - Export filtered member list
8. **Member Comparison** - Quick compare mode from panel

### Integration Opportunities
- **Task Assignment** - Drag member to task to assign
- **Calendar Integration** - See availability
- **Project Staffing** - Filter by skills/availability
- **Performance Dashboard** - Quick metrics view

---

## 💡 Design Inspiration

### Similar Patterns in Other Apps
- **Slack:** Right sidebar for people/threads
- **Linear:** Command palette for quick access
- **Notion:** Quick find for pages/people
- **Discord:** Member list sidebar
- **Figma:** Right panel for properties

### Key Differentiators
- **Role-based visual design** - Clear color coding
- **AI integration** - Centaur pairing visualization
- **Task-centric** - Focus on what people are working on
- **Real-time presence** - Live status updates
- **Mobile-optimized** - Native-feeling bottom sheet

---

## 📚 Technical Dependencies

### New Dependencies
```json
{
  "framer-motion": "^10.x", // Animations
  "react-window": "^1.x",    // Virtualized lists
  "zustand": "^4.x"          // Optional: State management alternative
}
```

### Existing Dependencies (Reuse)
- `@supabase/supabase-js` - Real-time
- `date-fns` - Date formatting
- `lucide-react` - Icons
- Existing UI components

---

## 🎯 Success Criteria

### Must Have (Launch Blockers)
✅ Panel opens from any page
✅ Shows all team members with correct info
✅ Search works reliably
✅ Mobile responsive
✅ Doesn't break existing functionality
✅ Passes accessibility audit
✅ Performance benchmarks met

### Should Have (Pre-Launch)
✅ Keyboard shortcuts work
✅ Real-time presence updates
✅ Quick actions (mention, view profile)
✅ Role filtering
✅ Loading states

### Nice to Have (Post-Launch)
○ Custom sorting
○ Notification badges
○ Quick messaging
○ Export functionality
○ Advanced filters

---

## 🚀 Deployment Strategy

### Rollout Plan
1. **Internal Alpha** - Test with founders/executives (Week 3)
2. **Beta Release** - Enable for 25% of users (Week 4)
3. **Full Release** - Enable for all users (Week 5)
4. **Monitor** - Track metrics and gather feedback

### Feature Flag
```typescript
const ENABLE_FLOATING_TEAM_PANEL = process.env.NEXT_PUBLIC_FEATURE_FLOATING_TEAM === 'true'
```

### Rollback Plan
- Feature flag to disable
- Monitoring for errors
- Quick revert capability
- User feedback channel

---

## 📖 Documentation Needs

### User Documentation
- Feature announcement blog post
- Keyboard shortcuts reference card
- Video tutorial (30 seconds)
- In-app tooltip on first use

### Developer Documentation
- Architecture overview
- Component API reference
- State management guide
- Performance optimization guide
- Testing guide

---

## 🎉 Conclusion

This floating team panel will make CentaurOS significantly more efficient by providing instant access to team information from anywhere in the app. The design maintains consistency with the existing Teams page while optimizing for quick, non-disruptive access.

**Estimated Timeline:** 3-4 weeks
**Complexity:** Medium
**Impact:** High
**Risk:** Low

Ready to start implementation! 🚀
