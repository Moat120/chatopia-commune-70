import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const TYPING_TIMEOUT = 3000; // 3 seconds

interface TypingState {
  [odId: string]: {
    username: string;
    timestamp: number;
  };
}

export const useTypingIndicator = (channelId: string) => {
  const { user, profile } = useAuth();
  const [typingUsers, setTypingUsers] = useState<TypingState>({});
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingBroadcast = useRef<number>(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Clean up stale typing indicators
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => {
        const updated = { ...prev };
        let changed = false;
        Object.keys(updated).forEach((odId) => {
          if (now - updated[odId].timestamp > TYPING_TIMEOUT) {
            delete updated[odId];
            changed = true;
          }
        });
        return changed ? updated : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Setup channel
  useEffect(() => {
    if (!user || !channelId) return;

    const channel = supabase.channel(`typing-${channelId}`);
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.odId !== user.id) {
          setTypingUsers((prev) => ({
            ...prev,
            [payload.odId]: {
              username: payload.username,
              timestamp: Date.now(),
            },
          }));
        }
      })
      .on("broadcast", { event: "stop-typing" }, ({ payload }) => {
        if (payload.odId !== user.id) {
          setTypingUsers((prev) => {
            const updated = { ...prev };
            delete updated[payload.odId];
            return updated;
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user, channelId]);

  // Broadcast typing status
  const startTyping = useCallback(() => {
    if (!user || !profile || !channelRef.current) return;

    // Throttle broadcasts to avoid spam
    const now = Date.now();
    if (now - lastTypingBroadcast.current < 1000) return;
    lastTypingBroadcast.current = now;

    channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: {
        odId: user.id,
        username: profile.username,
      },
    });

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to stop typing
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, TYPING_TIMEOUT);
  }, [user, profile]);

  const stopTyping = useCallback(() => {
    if (!user || !channelRef.current) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    channelRef.current.send({
      type: "broadcast",
      event: "stop-typing",
      payload: {
        odId: user.id,
      },
    });
  }, [user]);

  const typingUsersList = Object.values(typingUsers).map((u) => u.username);

  return {
    typingUsers: typingUsersList,
    isTyping: typingUsersList.length > 0,
    startTyping,
    stopTyping,
  };
};
