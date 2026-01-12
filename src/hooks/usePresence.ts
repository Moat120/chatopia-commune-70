import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const OFFLINE_THRESHOLD = 60000; // 60 seconds - if no heartbeat for this long, user is offline

export const usePresence = () => {
  const { user, profile } = useAuth();
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const isActiveRef = useRef(true);

  // Update status in database
  const updateStatus = useCallback(async (status: "online" | "away" | "offline") => {
    if (!user) return;
    
    try {
      await supabase
        .from("profiles")
        .update({ 
          status, 
          updated_at: new Date().toISOString() 
        })
        .eq("id", user.id);
    } catch (err) {
      console.error("[Presence] Status update error:", err);
    }
  }, [user]);

  // Track user activity
  const trackActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (!isActiveRef.current) {
      isActiveRef.current = true;
      updateStatus("online");
    }
  }, [updateStatus]);

  // Check if user is idle (no activity for 5 minutes)
  const checkIdleStatus = useCallback(() => {
    const idleThreshold = 5 * 60 * 1000; // 5 minutes
    const timeSinceLastActivity = Date.now() - lastActivityRef.current;
    
    if (timeSinceLastActivity > idleThreshold && isActiveRef.current) {
      isActiveRef.current = false;
      updateStatus("away");
    }
  }, [updateStatus]);

  // Heartbeat to keep presence alive
  const sendHeartbeat = useCallback(() => {
    if (!user || !presenceChannelRef.current) return;
    
    presenceChannelRef.current.track({
      odId: user.id,
      username: profile?.username || "User",
      online_at: new Date().toISOString(),
      status: isActiveRef.current ? "online" : "away",
    });
    
    checkIdleStatus();
  }, [user, profile, checkIdleStatus]);

  // Setup presence channel and heartbeat
  useEffect(() => {
    if (!user) return;

    // Set online immediately
    updateStatus("online");

    // Create presence channel
    const presenceChannel = supabase.channel("global-presence", {
      config: { presence: { key: user.id } },
    });
    presenceChannelRef.current = presenceChannel;

    // Handle presence sync to detect other users
    presenceChannel.on("presence", { event: "sync" }, () => {
      const state = presenceChannel.presenceState();
      
      // Get all online user IDs from presence
      const onlineUserIds = new Set<string>();
      Object.values(state).forEach((presences: any[]) => {
        presences.forEach((presence) => {
          if (presence.odId) {
            onlineUserIds.add(presence.odId);
          }
        });
      });
    });

    presenceChannel.on("presence", { event: "leave" }, async ({ key, leftPresences }) => {
      // When a user leaves, mark them offline in database
      if (key && key !== user.id) {
        // Small delay to avoid race conditions
        setTimeout(async () => {
          try {
            await supabase
              .from("profiles")
              .update({ status: "offline", updated_at: new Date().toISOString() })
              .eq("id", key);
          } catch (err) {
            console.error("[Presence] Error marking user offline:", err);
          }
        }, 1000);
      }
    });

    presenceChannel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        // Track our presence
        await presenceChannel.track({
          odId: user.id,
          username: profile?.username || "User",
          online_at: new Date().toISOString(),
          status: "online",
        });
      }
    });

    // Start heartbeat
    heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    // Track user activity events
    const activityEvents = ["mousedown", "keydown", "touchstart", "scroll", "mousemove"];
    activityEvents.forEach((event) => {
      window.addEventListener(event, trackActivity, { passive: true });
    });

    // Handle visibility change (tab switch)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        trackActivity();
        sendHeartbeat();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Handle online/offline events
    const handleOnline = () => {
      updateStatus("online");
      sendHeartbeat();
    };
    const handleOffline = () => {
      updateStatus("offline");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Handle page unload
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable offline status update
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`;
      const headers = {
        "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      };
      
      navigator.sendBeacon(
        url,
        new Blob([JSON.stringify({ status: "offline", updated_at: new Date().toISOString() })], { 
          type: "application/json" 
        })
      );
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Cleanup
    return () => {
      // Clear heartbeat
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      // Remove presence channel
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
      }

      // Remove event listeners
      activityEvents.forEach((event) => {
        window.removeEventListener(event, trackActivity);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeunload", handleBeforeUnload);

      // Set offline on cleanup
      updateStatus("offline");
    };
  }, [user?.id, profile?.username, updateStatus, trackActivity, sendHeartbeat]);

  return {
    trackActivity,
  };
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
          if (presence.odId) {
            onlineIds.add(presence.odId);
          }
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
