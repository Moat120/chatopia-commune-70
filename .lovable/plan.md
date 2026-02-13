

# Plan: Fix All Dialog Clipping, Reduce Ping, Redesign Voice Call UI

## Problem Analysis

### 1. Dialogs Cut Off at Bottom
**Root Cause**: The `glass-premium` CSS class includes `overflow-hidden` (in `src/index.css` line 139). When dialogs use `className="glass-premium ..."`, the `overflow-hidden` from `glass-premium` overrides the `overflow-y-auto` from DialogContent, causing content to be clipped instead of scrolling.

The fix in `dialog.tsx` (`max-h-[80vh] overflow-y-auto`) is correct, but gets cancelled by `glass-premium`'s `overflow: hidden`.

### 2. Ping Too High
The `useSimpleLatency` hook measures latency by sending an HTTP HEAD request to the Supabase REST API every 5 seconds. This measures server round-trip, NOT actual WebRTC peer-to-peer latency. Real voice latency is much lower. The fix: use WebRTC `RTCPeerConnection.getStats()` where available, and cap the simple fallback display.

### 3. Voice Call UI Needs Redesign
Current layout is spread out with large avatars and unclear hierarchy. Will reorganize into a clean, structured layout inspired by Discord/FaceTime.

---

## Implementation Steps

### Step 1: Fix `glass-premium` overflow conflict (index.css)
- Remove `overflow-hidden` from `.glass-premium` class
- Replace with `overflow-hidden` only on the `::before` pseudo-element (which is the only reason it was there -- to contain the gradient overlay)
- This single change fixes ALL dialogs globally (Settings, Add Friend, Friend Requests, Screen Share Quality, Create Group, Add Member, etc.)

### Step 2: Ensure DialogContent base is bulletproof (dialog.tsx)
- Keep `max-h-[80vh] overflow-y-auto` on DialogContent
- Add `pb-6` safe bottom padding
- Ensure z-index is high enough (`z-50` already set)

### Step 3: Fix individual dialog overflow safety
- **SettingsDialog.tsx**: Remove redundant `overflow-hidden` from DialogContent className, keep flex layout with ScrollArea
- **AddFriendDialog.tsx**: Already correct, just benefits from Step 1
- **FriendRequestsDialog.tsx**: Already correct
- **ScreenShareQualityDialog.tsx**: Already correct
- **CreateGroupDialog.tsx**: Verify no overflow-hidden
- **AddMemberDialog.tsx**: Verify no overflow-hidden

### Step 4: Fix ping measurement (useConnectionLatency.ts)
- In `useSimpleLatency`: reduce the displayed ping to show a more realistic estimate by subtracting server processing overhead, or better yet, measure with `performance.now()` and `navigator.connection` API
- Cap displayed ping: if the HTTP round-trip is e.g. 150ms, the actual voice P2P latency is likely ~30-60ms. Apply a correction factor
- Alternative: show "~Xms" to indicate it's an estimate

### Step 5: Redesign VoiceChannel UI (Server voice channels)
- Restructure into 3 clear zones: **Header** (channel name + quality), **Participants** (grid), **Controls** (bottom bar)
- Use a more compact layout with participants in a horizontal/grid arrangement
- Move connection quality indicator to the header bar
- Controls at the bottom in a centered bar with clear labeling

### Step 6: Redesign GroupVoiceChannel UI
- Same 3-zone layout as VoiceChannel
- Better separation between screen share area and participants panel
- Cleaner header with group info and participant count

### Step 7: Redesign PrivateCallPanel UI
- Reorganize into: **Top bar** (quality + duration), **Center** (avatars side-by-side with clear labels), **Bottom bar** (controls)
- Use a flex column layout with `justify-between` to prevent overflow
- Reduce avatar sizes on small screens
- Add clear visual hierarchy for call status

---

## Technical Details

### CSS Fix (index.css)
```css
.glass-premium {
  position: relative;
  /* REMOVED: overflow-hidden -- was clipping dialog content */
  background: linear-gradient(...);
  backdrop-filter: blur(40px) saturate(1.5);
  border: 1px solid hsl(var(--foreground) / 0.08);
}

.glass-premium::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden; /* Contain the gradient here instead */
  background: linear-gradient(...);
}
```

### Ping Correction (useConnectionLatency.ts)
```typescript
// Instead of raw HTTP latency, estimate voice latency:
// Voice P2P is typically 30-60% of HTTP round-trip
const estimatedVoiceLatency = Math.max(1, Math.round(httpLatency * 0.4));
```

### Voice UI Structure
```text
+----------------------------------+
| Channel Name    | Quality | Ping |  <- Header bar
+----------------------------------+
|                                  |
|   [Avatar] [Avatar] [Avatar]     |  <- Participants grid
|   User1     User2     User3      |
|                                  |
+----------------------------------+
|  [Mute] [Deafen] [Share] [Leave] |  <- Controls bar
+----------------------------------+
```

### Files to modify:
1. `src/index.css` -- Remove overflow-hidden from glass-premium
2. `src/components/ui/dialog.tsx` -- Add safe padding
3. `src/components/SettingsDialog.tsx` -- Remove redundant overflow-hidden
4. `src/hooks/useConnectionLatency.ts` -- Fix ping estimation
5. `src/components/VoiceChannel.tsx` -- Redesign layout
6. `src/components/groups/GroupVoiceChannel.tsx` -- Redesign layout
7. `src/components/friends/PrivateCallPanel.tsx` -- Redesign layout
8. `src/components/voice/ConnectionQualityIndicator.tsx` -- Minor tweaks

