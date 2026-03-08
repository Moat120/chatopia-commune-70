import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const HEARTBEAT_INTERVAL = 20000; // 20s
const IDLE_THRESHOLD = 3 * 60 * 1000; // 3 min → away
const DEEP_IDLE_THRESHOLD = 15 * 60 * 1000; // 15 min → offline-ish (still tracked but "away")

export const usePresence = () => {
  const { user, profile } = useAuth();
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const idleCheckRef = useRef<NodeJS.Timeout | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const currentStatusRef = useRef<"online" | "away" | "offline">("online");
  const isTabVisibleRef = useRef(!document.hidden);
  const isWindowFocusedRef = useRef(document.hasFocus());
  const mouseMoveThrottleRef = useRef<number>(0);

  const updateStatus = useCallback(async (status: "online" | "away" | "offline") => {
    if (!user || currentStatusRef.current === status) return;
    currentStatusRef.current = status;

    try {
      await supabase
        .from("profiles")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", user.id);
    } catch (err) {
      console.error("[Presence] Status update error:", err);
    }
  }, [user]);

  // Debounced activity tracker
  const trackActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;

    // Only trigger status change if we were away
    if (currentStatusRef.current !== "online") {
      updateStatus("online");
    }
  }, [updateStatus]);

  // Throttled mouse move (every 2s max)
  const trackMouseMove = useCallback(() => {
    const now = Date.now();
    if (now - mouseMoveThrottleRef.current < 2000) return;
    mouseMoveThrottleRef.current = now;
    lastActivityRef.current = now;

    if (currentStatusRef.current !== "online") {
      updateStatus("online");
    }
  }, [updateStatus]);

  // Periodic idle check (every 15s)
  const checkIdle = useCallback(() => {
    const elapsed = Date.now() - lastActivityRef.current;
    const tabVisible = isTabVisibleRef.current;
    const windowFocused = isWindowFocusedRef.current;

    // If tab is hidden AND no recent activity → away faster (1.5 min)
    const effectiveThreshold = (!tabVisible || !windowFocused)
      ? Math.min(IDLE_THRESHOLD, 90_000)
      : IDLE_THRESHOLD;

    if (elapsed >= effectiveThreshold && currentStatusRef.current === "online") {
      updateStatus("away");
    }
  }, [updateStatus]);

  const sendHeartbeat = useCallback(() => {
    if (!user || !presenceChannelRef.current) return;

    presenceChannelRef.current.track({
      odId: user.id,
      username: profile?.username || "User",
      online_at: new Date().toISOString(),
      status: currentStatusRef.current,
    });

    checkIdle();
  }, [user, profile, checkIdle]);

  useEffect(() => {
    if (!user) return;

    updateStatus("online");

    // Presence channel
    const presenceChannel = supabase.channel("global-presence", {
      config: { presence: { key: user.id } },
    });
    presenceChannelRef.current = presenceChannel;

    presenceChannel.on("presence", { event: "sync" }, () => {
      // Presence state synced
    });

    presenceChannel.on("presence", { event: "leave" }, async ({ key }) => {
      if (key && key !== user.id) {
        setTimeout(async () => {
          try {
            await supabase
              .from("profiles")
              .update({ status: "offline", updated_at: new Date().toISOString() })
              .eq("id", key);
          } catch (err) {
            console.error("[Presence] Error marking user offline:", err);
          }
        }, 2000);
      }
    });

    presenceChannel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await presenceChannel.track({
          odId: user.id,
          username: profile?.username || "User",
          online_at: new Date().toISOString(),
          status: "online",
        });
      }
    });

    // Heartbeat
    heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    // Idle check every 15s
    idleCheckRef.current = setInterval(checkIdle, 15000);

    // ─── Activity event listeners ───
    const immediateEvents = ["mousedown", "keydown", "touchstart", "pointerdown", "wheel"];
    immediateEvents.forEach((ev) => {
      window.addEventListener(ev, trackActivity, { passive: true });
    });

    // Throttled mousemove
    window.addEventListener("mousemove", trackMouseMove, { passive: true });

    // Scroll (throttled naturally by browsers)
    window.addEventListener("scroll", trackActivity, { passive: true, capture: true });

    // ─── Visibility API ───
    const handleVisibility = () => {
      isTabVisibleRef.current = !document.hidden;
      if (!document.hidden) {
        // Tab became visible → instant re-engage
        trackActivity();
        sendHeartbeat();
      } else {
        // Tab hidden → start faster idle countdown
        // Don't immediately set away, let the idle checker handle it
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // ─── Window focus/blur ───
    const handleFocus = () => {
      isWindowFocusedRef.current = true;
      trackActivity();
      sendHeartbeat();
    };
    const handleBlur = () => {
      isWindowFocusedRef.current = false;
      // Don't set away immediately on blur, just note it for idle calculation
    };
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    // ─── Network status ───
    const handleOnline = () => {
      updateStatus("online");
      sendHeartbeat();
    };
    const handleOffline = () => {
      updateStatus("offline");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // ─── Page unload (sendBeacon for reliable offline) ───
    const handleBeforeUnload = () => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`;
      const headers = new Headers({
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      });

      // sendBeacon doesn't support custom headers, use fetch keepalive
      try {
        fetch(url, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: "offline", updated_at: new Date().toISOString() }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        // Fallback to sendBeacon (no auth headers but better than nothing)
        navigator.sendBeacon(
          url,
          new Blob(
            [JSON.stringify({ status: "offline", updated_at: new Date().toISOString() })],
            { type: "application/json" }
          )
        );
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // ─── Page hide (mobile browsers) ───
    const handlePageHide = () => {
      handleBeforeUnload();
    };
    window.addEventListener("pagehide", handlePageHide);

    // Cleanup
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (idleCheckRef.current) clearInterval(idleCheckRef.current);

      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
      }

      immediateEvents.forEach((ev) => window.removeEventListener(ev, trackActivity));
      window.removeEventListener("mousemove", trackMouseMove);
      window.removeEventListener("scroll", trackActivity);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);

      updateStatus("offline");
    };
  }, [user?.id, profile?.username, updateStatus, trackActivity, trackMouseMove, sendHeartbeat, checkIdle]);

  return { trackActivity };
};

// Standalone hook for tracking online users in real-time
export const useOnlineUsers = () => {
  const onlineUsersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const presenceChannel = supabase.channel("global-presence-watcher");

    presenceChannel.on("presence", { event: "sync" }, () => {
      const state = presenceChannel.presenceState();
      const onlineIds = new Set<string>();

      Object.values(state).forEach((presences: any[]) => {
        presences.forEach((presence) => {
          if (presence.odId) onlineIds.add(presence.odId);
        });
      });

      onlineUsersRef.current = onlineIds;
    });

    presenceChannel.subscribe();

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, []);

  const isUserOnline = useCallback((userId: string) => {
    return onlineUsersRef.current.has(userId);
  }, []);

  return { isUserOnline, onlineUsers: onlineUsersRef.current };
};
