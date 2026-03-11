import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const HEARTBEAT_INTERVAL = 20000; // 20s
const IDLE_THRESHOLD = 3 * 60 * 1000; // 3 min → away

export const usePresence = () => {
  const { user, profile } = useAuth();
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const currentStatusRef = useRef<"online" | "away" | "offline">("online");
  const isTabVisibleRef = useRef(!document.hidden);
  const isWindowFocusedRef = useRef(document.hasFocus());
  const mouseMoveThrottleRef = useRef<number>(0);

  // Store latest values in refs to avoid recreating callbacks
  const userIdRef = useRef<string | null>(null);
  const usernameRef = useRef<string>("User");

  // Keep refs in sync without triggering effects
  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    usernameRef.current = profile?.username || "User";
  }, [profile?.username]);

  const updateStatus = useCallback(async (status: "online" | "away" | "offline") => {
    const uid = userIdRef.current;
    if (!uid || currentStatusRef.current === status) return;
    currentStatusRef.current = status;

    try {
      await supabase
        .from("profiles")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", uid);
    } catch (err) {
      console.error("[Presence] Status update error:", err);
    }
  }, []); // No deps — uses refs

  const trackActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (currentStatusRef.current !== "online") {
      updateStatus("online");
    }
  }, [updateStatus]);

  const trackMouseMove = useCallback(() => {
    const now = Date.now();
    if (now - mouseMoveThrottleRef.current < 2000) return;
    mouseMoveThrottleRef.current = now;
    lastActivityRef.current = now;
    if (currentStatusRef.current !== "online") {
      updateStatus("online");
    }
  }, [updateStatus]);

  const checkIdle = useCallback(() => {
    const elapsed = Date.now() - lastActivityRef.current;
    const tabVisible = isTabVisibleRef.current;
    const windowFocused = isWindowFocusedRef.current;

    const effectiveThreshold = (!tabVisible || !windowFocused)
      ? Math.min(IDLE_THRESHOLD, 90_000)
      : IDLE_THRESHOLD;

    if (elapsed >= effectiveThreshold && currentStatusRef.current === "online") {
      updateStatus("away");
    }
  }, [updateStatus]);

  const sendHeartbeat = useCallback(() => {
    const uid = userIdRef.current;
    if (!uid || !presenceChannelRef.current) return;

    presenceChannelRef.current.track({
      odId: uid,
      username: usernameRef.current,
      online_at: new Date().toISOString(),
      status: currentStatusRef.current,
    });

    checkIdle();
  }, [checkIdle]); // No user/profile deps — uses refs

  // Main effect — only re-runs when user.id changes (login/logout)
  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;

    updateStatus("online");

    // Presence channel
    const presenceChannel = supabase.channel("global-presence", {
      config: { presence: { key: uid } },
    });
    presenceChannelRef.current = presenceChannel;

    presenceChannel.on("presence", { event: "sync" }, () => {});

    presenceChannel.on("presence", { event: "leave" }, async ({ key }) => {
      if (key && key !== uid) {
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
          odId: uid,
          username: usernameRef.current,
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
    window.addEventListener("mousemove", trackMouseMove, { passive: true });
    window.addEventListener("scroll", trackActivity, { passive: true, capture: true });

    // ─── Visibility API ───
    const handleVisibility = () => {
      isTabVisibleRef.current = !document.hidden;
      if (!document.hidden) {
        trackActivity();
        sendHeartbeat();
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

    // ─── Page unload ───
    const handleBeforeUnload = () => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${uid}`;
      const headers = new Headers({
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      });

      try {
        fetch(url, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: "offline", updated_at: new Date().toISOString() }),
          keepalive: true,
        }).catch(() => {});
      } catch {
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
    window.addEventListener("pagehide", handleBeforeUnload);

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
      window.removeEventListener("pagehide", handleBeforeUnload);

      updateStatus("offline");
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
