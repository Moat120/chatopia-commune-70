import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface UnreadCounts {
  [id: string]: number;
}

export const useUnreadMessages = () => {
  const { user } = useAuth();
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>({});
  const [totalUnread, setTotalUnread] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const fetchUnreadCounts = useCallback(async () => {
    if (!user) return;

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

    // Fallback polling every 10s
    pollRef.current = setInterval(fetchUnreadCounts, 10000);

    const ts = Date.now();
    const insertChannel = supabase
      .channel(`unread-ins-${user.id}-${ts}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "private_messages",
          filter: `receiver_id=eq.${user.id}` },
        (payload) => {
          const msg = payload.new as any;
          setUnreadCounts((prev) => ({
            ...prev,
            [msg.sender_id]: (prev[msg.sender_id] || 0) + 1,
          }));
          setTotalUnread((prev) => prev + 1);
        }
      )
      .subscribe();

    const updateChannel = supabase
      .channel(`unread-upd-${user.id}-${ts}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "private_messages",
          filter: `receiver_id=eq.${user.id}` },
        () => { fetchUnreadCounts(); }
      )
      .subscribe();

    return () => {
      clearInterval(pollRef.current);
      supabase.removeChannel(insertChannel);
      supabase.removeChannel(updateChannel);
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
