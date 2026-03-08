import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface PrivateMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
  edited_at: string | null;
  reply_to_id: string | null;
}

export const usePrivateChat = (friendId: string | null) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const fetchMessages = useCallback(async () => {
    if (!user || !friendId) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("private_messages")
      .select("*")
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setMessages(data as PrivateMessage[]);

      // Mark unread messages as read
      const unreadIds = data
        .filter((m) => m.receiver_id === user.id && !m.read_at)
        .map((m) => m.id);

      if (unreadIds.length > 0) {
        await supabase
          .from("private_messages")
          .update({ read_at: new Date().toISOString() })
          .in("id", unreadIds);
      }
    }
    setLoading(false);
  }, [user, friendId]);

  const sendMessage = async (content: string, replyToId?: string) => {
    if (!user || !friendId || !content.trim()) return;

    const { error } = await supabase.from("private_messages").insert({
      sender_id: user.id,
      receiver_id: friendId,
      content: content.trim(),
      reply_to_id: replyToId || null,
    } as any);

    return { error };
  };

  useEffect(() => {
    if (!user || !friendId) return;

    fetchMessages();

    // Fallback polling every 10s
    pollRef.current = setInterval(fetchMessages, 10000);

    // Use two filtered subscriptions for RLS compatibility
    const channel = supabase
      .channel(`private-chat-${user.id}-${friendId}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "private_messages",
          filter: `sender_id=eq.${friendId}`,
        },
        (payload) => {
          const msg = payload.new as PrivateMessage;
          if (msg.receiver_id !== user.id) return;
          setMessages((prev) => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          // Mark as read
          supabase
            .from("private_messages")
            .update({ read_at: new Date().toISOString() })
            .eq("id", msg.id);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "private_messages",
          filter: `sender_id=eq.${user.id}`,
        },
        (payload) => {
          const msg = payload.new as PrivateMessage;
          if (msg.receiver_id !== friendId) return;
          setMessages((prev) => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "private_messages",
          filter: `sender_id=eq.${friendId}`,
        },
        (payload) => {
          const updated = payload.new as PrivateMessage;
          setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "private_messages",
          filter: `sender_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as PrivateMessage;
          setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "private_messages",
        },
        (payload) => {
          const deletedId = (payload.old as any).id;
          setMessages(prev => prev.filter(m => m.id !== deletedId));
        }
      )
      .subscribe((status, err) => {
        if (err) console.error("[private-chat] subscription error:", err);
      });

    return () => {
      clearInterval(pollRef.current);
      supabase.removeChannel(channel);
    };
  }, [user, friendId, fetchMessages]);

  return {
    messages,
    loading,
    sendMessage,
    refreshMessages: fetchMessages,
  };
};
