# Quick Test Guide - Messaging Features

**🎯 Goal:** Test all new messaging features in 10 minutes

---

## ✅ Pre-Test Checklist

Before starting:
- ✅ Dev server running: http://localhost:3001
- ✅ Database migration applied
- ✅ TypeScript compiled with no errors
- ✅ Test account ready with access to conversations

---

## 🧪 Test 1: Thread Replies (2 minutes)

### Steps:
1. Navigate to http://localhost:3001/messages
2. Select any conversation
3. Press **R** key

### ✅ Expected:
- Thread panel opens on right side
- Shows parent message at top
- Has reply input at bottom

### Test Reply:
4. Type "Test thread reply" in panel input
5. Press **Enter**

### ✅ Expected:
- Reply appears immediately below parent
- Reply count shows "1 reply"
- Separator line appears

### Test Persistence:
6. Refresh page (Cmd+R or F5)

### ✅ Expected:
- Thread panel closed (normal)
- Message now shows reply count badge
- Click badge to reopen thread
- Your reply is still there

---

## 🧪 Test 2: Message Actions (3 minutes)

### Test Star (S key):
1. Click on a message (or hover)
2. Press **S** key

### ✅ Expected:
- Toast notification: "Message starred"

3. Press **S** again

### ✅ Expected:
- Toast notification: "Message unstarred"

### Test Pin (P key):
4. Press **P** key on same message

### ✅ Expected:
- Toast notification: "Message pinned"

5. Press **P** again

### ✅ Expected:
- Toast notification: "Message unpinned"

### Test Mark Unread (U key):
6. Press **U** key

### ✅ Expected:
- Toast notification: "Conversation marked as unread"

---

## 🧪 Test 3: Search Operators (3 minutes)

### Test Basic Operator:
1. Type `/search is:starred` in message input
2. Press **Enter**

### ✅ Expected:
- URL changes to `/messages?search=is:starred`
- (Results would show starred messages if any exist)

### Test Combined Operators:
3. Type `/search from:me has:link`
4. Press **Enter**

### ✅ Expected:
- URL: `/messages?search=from%3Ame%20has%3Alink`

### Test Date Filter:
5. Type `/search before:2026-02-01 meeting`
6. Press **Enter**

### ✅ Expected:
- URL includes encoded query
- (Would show messages before date with "meeting")

---

## 🧪 Test 4: UI Elements (2 minutes)

### Check Reply Badges:
1. Look at messages in conversation
2. Find any message with replies

### ✅ Expected:
- Shows "X replies" button below message
- Shows "Last reply [time] ago" if recent
- Badge is clickable
- Clicking opens thread panel

### Check Keyboard Shortcuts:
1. Make sure message input is NOT focused (click elsewhere)
2. Try pressing R, S, P, U keys

### ✅ Expected:
- Shortcuts work when input unfocused
- Shortcuts DON'T work when typing in input
- Toast notifications appear for S, P, U

### Check Reactions (Still Work):
1. Hover over any message
2. Look for quick reaction bar (👍 ❤️ 😂 etc.)

### ✅ Expected:
- Quick reactions appear on hover
- Clicking reaction adds it
- Reaction count displays below message

---

## 📊 Test Results Tracking

| Feature | Status | Notes |
|---------|--------|-------|
| Thread panel opens (R) | ⬜ | |
| Send thread reply | ⬜ | |
| Reply persists after reload | ⬜ | |
| Reply count badge displays | ⬜ | |
| Star message (S) | ⬜ | |
| Pin message (P) | ⬜ | |
| Mark unread (U) | ⬜ | |
| Toast notifications work | ⬜ | |
| Search operators parse | ⬜ | |
| Combined operators work | ⬜ | |
| Reply badges clickable | ⬜ | |
| Shortcuts only work unfocused | ⬜ | |
| Reactions still work | ⬜ | |

---

## 🐛 If Something Doesn't Work

### Thread panel won't open:
- Check browser console for errors
- Verify you're on `/messages` page
- Check that message list is not empty

### Keyboard shortcuts don't work:
- Make sure input is NOT focused
- Click elsewhere on page first
- Check browser console for errors

### Search doesn't filter:
- This is normal - search UI is not yet implemented
- URL should still contain query parameters
- Backend search service is ready for integration

### Database errors:
- Run: `npx supabase migration list | grep 20260202100000`
- Should show migration is applied
- If not, run: `npx supabase db push`

---

## ✅ Success Criteria

**Minimum Viable Test (MVP):**
- ✅ Thread panel opens and closes
- ✅ Can send a reply in thread
- ✅ Reply count displays
- ✅ One shortcut works (S, P, or U)
- ✅ Toast notification appears

**Complete Test (All Features):**
- ✅ All shortcuts work (R, S, P, U)
- ✅ Thread replies persist
- ✅ Reply badges clickable
- ✅ Search commands work
- ✅ Reactions still functional
- ✅ No console errors

---

## 📝 Report Issues

If you find bugs, note:
1. **What you were doing** - Steps to reproduce
2. **What happened** - Error or unexpected behavior
3. **Console errors** - Open DevTools > Console
4. **Expected behavior** - What should have happened

---

**Testing Time:** ~10 minutes  
**Difficulty:** Easy (just keyboard shortcuts and clicks)  
**Prerequisites:** Running dev server, authenticated user

Good luck! 🚀
