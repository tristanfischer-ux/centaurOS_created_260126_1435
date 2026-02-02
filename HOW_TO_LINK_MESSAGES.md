# How to Link Messages to Tasks & Objectives

## Overview

Messages in CentaurOS can be linked to specific tasks or objectives, making them appear in task notes for better organization and context.

## Where to Find Context Linking

### 📬 In Inbox Conversations

**Location**: Directly above the message input field

**What to Look For**:
- A button showing "General conversation" (when not linked)
- Or showing the task/objective name (when linked)
- Has a message icon and dropdown arrows
- Highlighted in orange when linked to a task/objective

**Visual Cue**:
```
┌─────────────────────────────────────┐
│ 🎯 #123 Design Homepage             │ ← Linked to task (orange highlight)
│     [Click to change context]       │
└─────────────────────────────────────┘
  OR
┌─────────────────────────────────────┐
│ 💬 General conversation             │ ← Not linked (gray)
│     [Click to select task]          │
└─────────────────────────────────────┘
          ▼
[ Type your message here...          ]
```

### ✅ In Task Threads

When you're viewing a specific task and send messages:
- Messages **automatically link** to that task
- No manual selection needed
- Messages appear in the task's "Notes" section

### 📋 In Objective Threads  

When you're viewing a specific objective and send messages:
- Messages **automatically link** to that objective  
- No manual selection needed

## How to Link Messages (Step-by-Step)

### Method 1: Using Context Selector (Inbox)

1. **Open an inbox conversation**
   - Go to Inbox
   - Click on any conversation with a team member

2. **Find the Context Selector**
   - Look above the message input field
   - See the button showing "General conversation"

3. **Click to select context**
   - Click the dropdown button
   - Search for a task by number (#123) or name
   - Or browse tasks grouped by objective
   - Click to select a task or objective

4. **Send your message**
   - Type your message
   - Send as usual
   - Message is now linked to the selected context

5. **Verify it worked**
   - Open the task you linked to
   - Check the "Notes" tab
   - Your message should appear there

### Method 2: Automatic Linking (Task/Objective Threads)

1. **Navigate to a task**
   - Go to Tasks
   - Open any task

2. **Use the message thread**
   - Messages sent here automatically link to this task
   - No manual selection needed

3. **Check task notes**
   - Messages appear in the "Notes" section
   - Organized by conversation thread

## What Context Linking Does

### ✅ Benefits

**Better Organization**:
- Keep project discussions with related tasks
- Find conversations about specific work items
- Maintain context across multiple conversations

**Visibility**:
- Team members see relevant conversations in task notes
- No need to forward messages or repeat information
- Historical context is preserved

**Search & Discovery**:
- Find messages by task number or objective
- See all discussions related to a project
- Track decision-making over time

### 📊 Example Use Cases

**1. Bug Reports**
```
Link to: #234 Fix login button
Messages: Screenshots, reproduction steps, discussion
Benefit: All debugging info in one place
```

**2. Feature Requests**
```
Link to: #456 Add dark mode
Messages: User feedback, design decisions, requirements
Benefit: Complete feature discussion history
```

**3. Client Feedback**
```
Link to: Objective "Q1 Website Redesign"
Messages: Client messages, approval requests, iterations
Benefit: All client communication organized by project
```

## Tips & Best Practices

### 🎯 When to Link Messages

**DO link messages when**:
- Discussing specific task requirements
- Sharing updates about task progress
- Asking questions about task implementation
- Providing feedback on task completion

**DON'T link messages for**:
- General casual conversation
- Company-wide announcements
- Personal check-ins unrelated to work
- Social coordination (lunch plans, etc.)

### 🔄 Switching Context

You can change the context mid-conversation:
1. Click the context selector
2. Choose a different task/objective
3. Next message will link to new context
4. Previous messages stay with their original context

### 📋 Recent Contexts

The context selector remembers your recently used contexts:
- Shown at the top of the dropdown
- Quick access to frequently referenced tasks
- Makes it faster to switch between related discussions

### 🔍 Searching for Tasks

Use the search box in context selector:
- Type task number: `#123`
- Type task name: `design homepage`
- Type objective name: `website redesign`
- Results update as you type

## Troubleshooting

### "I don't see the Context Selector"

**Check your location**:
- Context selector only appears in **Inbox conversations**
- Not in standalone Messages page
- Not in Team view
- **Solution**: Go to Inbox → Open a conversation

### "My messages aren't appearing in task notes"

**Verify context selection**:
1. Check the context selector shows the task name (orange highlight)
2. Send a test message
3. Open the task → Notes tab
4. Look for your message

**Common issues**:
- Forgot to select context (shows "General conversation")
- Selected wrong task
- Task was deleted or archived
- Permissions: Can't link to tasks you don't have access to

### "Can't find my task in the dropdown"

**Try these**:
1. Type the task number in search: `#123`
2. Check if task is archived or deleted
3. Verify you have permission to view the task
4. Check if task belongs to your foundry

## Visual Design Updates

### Current Improvements

**Enhanced Button Design**:
- ✅ Orange border when linked to task/objective
- ✅ Icon changes based on state:
  - 🎯 Target icon when linked
  - 💬 Message icon when not linked
- ✅ Orange background when active
- ✅ Hover state hints at functionality

**Clear Labels**:
- Shows task number and name: "#123 Design Homepage"
- Shows objective name: "Q1 Website Redesign"
- Clear "General conversation" default state

## Quick Reference

| Location | Context Linking |
|----------|----------------|
| **Inbox conversations** | Manual selection via dropdown |
| **Task threads** | Automatic linking to that task |
| **Objective threads** | Automatic linking to that objective |
| **Messages page** | Not available (use Inbox instead) |
| **Team view** | Not available (use Inbox instead) |

---

**Need help?** The Quick Reference panel below the message input provides more tips and keyboard shortcuts.
