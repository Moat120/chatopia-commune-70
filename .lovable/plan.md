

## Plan: Fix Real-time Updates and Notifications

### Problem Analysis

After reviewing all hooks, the real-time system has several issues causing events to be silently missed:

1. **Channel name collisions**: `useNotifications` uses static names like `"notif-private"` and `"notif-group"` — if the component remounts, the old channel may not be properly cleaned up, and a new one with the same name silently fails.
2. **`useFriends` has a `hasFetched` guard** (`hasFetched.current`) that prevents re-fetching data after the initial load. Realtime callbacks call `fetchFriends()` / `fetchPendingRequests()` but these work — the real issue is the guard blocks reloads on remount.
3. **`usePrivateChat` subscribes to ALL `private_messages` INSERTs** without a filter, then filters client-side. With RLS, the realtime event may never arrive because the subscription lacks a row-level filter.
4. **No fallback polling** — if a realtime subscription drops silently, data stays stale forever.
5. **`useUnreadMessages`** uses a static channel name `"unread-messages-global"` — same collision issue.

### Changes

#### 1. Fix all channel names to be unique per user (5 files)

Every `supabase.channel(...)` call needs a unique, user-scoped name to prevent collisions on remount:

- **`useNotifications.ts`**: `"notif-private"` → `"notif-private-${user.id}-${Date.now()}"`, same for group channel
- **`useUnreadMessages.ts`**: `"unread-messages-global"` → `"unread-messages-${user.id}-${Date.now()}"`
- **`usePrivateChat.ts`**: `"private-chat-${friendId}"` → `"private-chat-${user.id}-${friendId}-${Date.now()}"`
- **`useGroupChat.ts`**: `"group-messages-${groupId}"` → `"group-messages-${user.id}-${groupId}-${Date.now()}"`
- **`useGroups.ts`**: Static names → user-scoped with timestamp suffix

#### 2. Add subscription status monitoring + fallback polling (all hooks)

Each realtime hook will:
- Track subscription status via `.subscribe((status) => ...)`
- Log errors when subscription fails
- Add a fallback polling interval (every 10s) that re-fetches data as a safety net
- Clear the polling interval when the subscription is confirmed working

#### 3. Fix `useFriends` hasFetched guard

Remove the `hasFetched.current` guard — it prevents data from loading on remount. Instead, just fetch on every mount (the loading state already handles UI).

#### 4. Add RLS-compatible filters to `usePrivateChat`

Add proper filters to the realtime subscription so events aren't blocked by RLS:
- Split into two subscriptions: one filtered by `sender_id=eq.${friendId}` and one by `receiver_id=eq.${friendId}`

#### 5. Fix `useNotifications` to work reliably

- Use unique channel names
- Add sound playback for friend requests (subscribe to `friendships` table INSERTs where `addressee_id=eq.${user.id}`)

### Files to modify

| File | Change |
|------|--------|
| `src/hooks/useNotifications.ts` | Unique channel names, add friend request notifications |
| `src/hooks/useUnreadMessages.ts` | Unique channel name, fallback polling |
| `src/hooks/usePrivateChat.ts` | Unique channel name, proper RLS filters, fallback polling |
| `src/hooks/useGroupChat.ts` | Unique channel name, fallback polling |
| `src/hooks/useGroups.ts` | Unique channel names, fallback polling |
| `src/hooks/useFriends.ts` | Remove hasFetched guard, unique channel names, fallback polling |

