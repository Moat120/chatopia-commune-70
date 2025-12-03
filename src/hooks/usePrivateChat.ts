import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface PrivateMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
}

export const usePrivateChat = (friendId: string | null) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [loading, setLoading] = useState(false);

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

  const sendMessage = async (content: string) => {
    if (!user || !friendId || !content.trim()) return;

    const { error } = await supabase.from("private_messages").insert({
      sender_id: user.id,
      receiver_id: friendId,
      content: content.trim(),
    });

    return { error };
  };

  useEffect(() => {
    if (user && friendId) {
      fetchMessages();

      const channel = supabase
        .channel(`private-chat-${friendId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "private_messages",
          },
          (payload) => {
            const msg = payload.new as PrivateMessage;
            if (
              (msg.sender_id === user.id && msg.receiver_id === friendId) ||
              (msg.sender_id === friendId && msg.receiver_id === user.id)
            ) {
              setMessages((prev) => [...prev, msg]);
              
              // Mark as read if we're the receiver
              if (msg.receiver_id === user.id) {
                supabase
                  .from("private_messages")
                  .update({ read_at: new Date().toISOString() })
                  .eq("id", msg.id);
              }
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, friendId, fetchMessages]);

  return {
    messages,
    loading,
    sendMessage,
    refreshMessages: fetchMessages,
  };
};
