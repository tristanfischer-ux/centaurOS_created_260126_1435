# Home Dashboard - Command Center

## Overview

The new Home Dashboard (`/dashboard`) is a beautiful, personalized command center that provides users with a comprehensive view of their work, team activity, and priorities at a glance.

## Features

### 1. **Hero Welcome Section**
- Personalized greeting based on time of day
- Quick metrics with animated badges
- View toggles (Overview, My Tasks, Team Activity)
- Beautiful gradient background with floating elements

### 2. **Smart Priority Queue**
- AI-suggested next tasks based on urgency
- Priority scoring algorithm considers:
  - Overdue status
  - Due date proximity
  - Task status
  - Approval requirements
- Visual urgency indicators (Critical 🔥, High ⚡, Medium 📋, Low ✓)
- Top 8 most important tasks

### 3. **Objective Progress Cards**
- Visual progress bars with color-coded completion
- Days remaining countdown
- Up to 6 active objectives
- Beautiful hover effects

### 4. **Team Pulse Widget**
- Live presence indicators
- Current task each team member is working on
- Online/Away/Focus/Offline status
- Last seen timestamps

### 5. **Activity Feed**
- Real-time foundry activity
- Task creation and completion events
- Objective creation
- Last 3 days of activity
- Beautiful icons and avatars

### 6. **Quick Actions Panel**
- One-click access to common tasks
- Gradient hover effects
- Create tasks, objectives, messages, view team

### 7. **Productivity Chart**
- 7-day task completion trends
- Stacked bar chart showing your tasks vs team tasks
- Beautiful visualizations
- Completion statistics

### 8. **Stats Cards**
- Active objectives count
- Team online status
- Completion rate
- Executive-only: Needs attention counter

## Design Philosophy

### Visual Design
- **Gradient backgrounds**: Subtle gradients using international orange
- **Floating elements**: Decorative blurred circles for depth
- **Card-based layout**: Clean, modern card designs with shadows
- **Responsive**: Fully responsive grid layout
- **Animations**: Smooth transitions and hover effects

### Color Palette
- Primary: International Orange (#FF4500)
- Success: Green (task completion)
- Warning: Amber/Yellow (due soon)
- Danger: Red (overdue)
- Info: Blue (team/objectives)
- Neutral: Slate (backgrounds)

### Typography
- Display font for hero headings
- Clear hierarchy with font sizes and weights
- Readable font sizes (min 12px)

## Navigation

The Home Dashboard is accessible from:
- **Desktop Sidebar**: First item under "Work" section
- **Mobile Bottom Nav**: First tab (Home icon)
- **Direct URL**: `/dashboard`

## Data Fetching

The dashboard fetches comprehensive data server-side including:
- User's active tasks
- Active objectives with progress
- Team presence and current activities
- Recent foundry activity (last 3 days)
- Task completion statistics (last 7 days)
- Overdue tasks
- Tasks due today and this week
- Blockers from standups (executives)
- Pending decisions (executives)
- Unread message counts

## Role-Based Features

### All Users
- Personal task queue
- Objective progress
- Team activity
- Productivity charts

### Executives & Founders
- Blockers from standups
- Pending decision approvals
- "Needs Attention" stat card

## Performance

- Server-side data fetching for fast initial load
- Parallel data queries for efficiency
- Client-side interactivity with React
- No unnecessary re-renders

## Future Enhancements

Potential improvements:
- Drag-and-drop widget customization
- Customizable widget visibility
- More chart types (pie, line, area)
- Widget presets by role
- Real-time updates with Supabase subscriptions
- Notifications panel
- Quick task creation inline
- Calendar view integration
- Desktop notifications

## Implementation Files

### Pages
- `src/app/(platform)/dashboard/page.tsx` - Server component with data fetching
- `src/app/(platform)/dashboard/dashboard-client.tsx` - Client component wrapper

### Components
- `src/components/dashboard/dashboard-hero.tsx` - Hero section
- `src/components/dashboard/priority-queue.tsx` - Smart task queue
- `src/components/dashboard/objective-cards.tsx` - Objective progress
- `src/components/dashboard/team-pulse.tsx` - Team presence
- `src/components/dashboard/activity-feed.tsx` - Activity stream
- `src/components/dashboard/quick-actions.tsx` - Quick action buttons
- `src/components/dashboard/productivity-chart.tsx` - Task completion chart
- `src/components/dashboard/stats-cards.tsx` - Summary stat cards
- `src/components/dashboard/index.ts` - Barrel exports

### Navigation
- `src/components/Sidebar.tsx` - Desktop navigation (updated)
- `src/components/MobileNav.tsx` - Mobile navigation (updated)

## Usage

Users can access the Home Dashboard by:
1. Clicking "Home" in the sidebar
2. Tapping "Home" in mobile bottom nav
3. Navigating to `/dashboard`

The dashboard automatically:
- Fetches fresh data on each page load
- Shows personalized greetings
- Prioritizes tasks intelligently
- Displays role-appropriate content

## Comparison: Home vs Inbox

| Feature | Home (`/dashboard`) | Inbox (`/home`) |
|---------|---------------------|-----------------|
| Purpose | Command center overview | Messaging & conversations |
| Focus | Tasks, objectives, team | Messages, threads, people |
| Layout | Widget grid | Two/three-panel messaging |
| Use Case | Daily planning & overview | Communication |
| Data | Aggregated insights | Real-time messages |

Both pages serve different purposes and complement each other in the workflow.
