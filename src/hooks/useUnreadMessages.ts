import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { playNotificationSound } from "@/hooks/useSound";

interface UnreadCounts {
  [odId: string]: number;
}

export const useUnreadMessages = () => {
  const { user } = useAuth();
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>({});
  const [totalUnread, setTotalUnread] = useState(0);

  const fetchUnreadCounts = useCallback(async () => {
    if (!user) return;

    // Get all unread private messages grouped by sender
    const { data, error } = await supabase
      .from("private_messages")
      .select("sender_id")
      .eq("receiver_id", user.id)
      .is("read_at", null);

    if (!error && data) {
      const counts: UnreadCounts = {};
      data.forEach((msg) => {
        counts[msg.sender_id] = (counts[msg.sender_id] || 0) + 1;
      });
      setUnreadCounts(counts);
      setTotalUnread(data.length);
    }
  }, [user]);

  const markAsRead = useCallback(async (friendId: string) => {
    if (!user) return;

    await supabase
      .from("private_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("receiver_id", user.id)
      .eq("sender_id", friendId)
      .is("read_at", null);

    setUnreadCounts((prev) => {
      const updated = { ...prev };
      delete updated[friendId];
      return updated;
    });
    
    fetchUnreadCounts();
  }, [user, fetchUnreadCounts]);

  const getUnreadCount = useCallback(
    (friendId: string) => unreadCounts[friendId] || 0,
    [unreadCounts]
  );

  useEffect(() => {
    if (!user) return;

    fetchUnreadCounts();

    // Listen for new messages
    const channel = supabase
      .channel("unread-messages-global")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "private_messages",
          filter: `receiver_id=eq.${user.id}`,
        },
        (payload) => {
          const msg = payload.new as any;
          
          // Play sound for new message
          playNotificationSound();
          
          setUnreadCounts((prev) => ({
            ...prev,
            [msg.sender_id]: (prev[msg.sender_id] || 0) + 1,
          }));
          setTotalUnread((prev) => prev + 1);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "private_messages",
          filter: `receiver_id=eq.${user.id}`,
        },
        () => {
          // Refetch when messages are marked as read
          fetchUnreadCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchUnreadCounts]);

  return {
    unreadCounts,
    totalUnread,
    getUnreadCount,
    markAsRead,
    refreshUnread: fetchUnreadCounts,
  };
};
