# Quick Start - Testing Messaging Features

## Dev Server
**URL:** http://localhost:3002  
**Status:** Running ✅

## Quick Tests (5 minutes)

### 1. Thread Replies (30 seconds)
```
1. Go to http://localhost:3002/messages
2. Hover any message
3. Press R key
4. ➜ Thread panel opens from right
5. Type a reply
6. Press Cmd+Enter
7. ➜ Reply posts, count increments
```

### 2. Star Messages (15 seconds)
```
1. Hover a message
2. Press S key
3. ➜ Gold star appears on top-right
4. Press S again
5. ➜ Star disappears
```

### 3. Pin Messages (15 seconds)
```
1. Hover a message
2. Press P key
3. ➜ Orange pin appears on top-left
4. Press P again
5. ➜ Pin disappears
```

### 4. Mark Unread (10 seconds)
```
1. In any conversation
2. Press U key
3. ➜ Conversation marked unread
4. ➜ Moves to top of list
```

### 5. Search Operators (30 seconds)
```
1. Focus message input
2. Type: /search is:starred
3. Press Enter
4. ➜ Shows only starred messages

5. Try: /search from:@username
6. Try: /search has:link
7. Try: /search before:2024-02-01
```

## All Keyboard Shortcuts

| Key | Action |
|-----|--------|
| R | Open thread |
| S | Star/unstar |
| P | Pin/unpin |
| U | Mark unread |
| / | Slash commands |
| @ | Mentions |
| + | Add reaction |
| ↑ | Previous message (history) |
| ? | Help dialog |

## Search Operators

| Operator | Example |
|----------|---------|
| is:starred | /search is:starred budget |
| is:pinned | /search is:pinned urgent |
| from:@user | /search from:@john update |
| in:#channel | /search in:#general meeting |
| has:link | /search has:link documentation |
| has:file | /search has:file report |
| before:date | /search before:2024-02-01 |
| after:date | /search after:2024-01-01 |
| on:date | /search on:2024-02-02 |

## Troubleshooting

### Dev Server Not Running:
```bash
cd "/Users/tristanfischer/Library/Mobile Documents/com~apple~CloudDocs/Software development/ForgeOS created 260126 1435"
pkill -9 -f "next dev"
rm -rf .next
npm run dev
```

### Need to Restart:
```bash
pkill -9 -f "next dev" && npm run dev
```

### Check TypeScript:
```bash
npx tsc --noEmit 2>&1 | grep -E "messaging|threads|search"
```

## Status
✅ All 12 tasks complete  
✅ All features implemented  
✅ Ready for testing  
🚀 http://localhost:3002/messages
