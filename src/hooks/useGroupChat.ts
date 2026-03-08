import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  edited_at?: string | null;
  reply_to_id?: string | null;
  sender?: {
    username: string;
    avatar_url: string | null;
  };
}

export const useGroupChat = (groupId: string | null) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const fetchMessages = useCallback(async () => {
    if (!groupId || !user) return;

    try {
      const { data, error } = await supabase
        .from("group_messages")
        .select(`
          *,
          sender:profiles!group_messages_sender_id_fkey (
            username,
            avatar_url
          )
        `)
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const formattedMessages = (data || []).map((msg: any) => ({
        ...msg,
        sender: msg.sender,
      }));

      setMessages(formattedMessages);
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
    }
  }, [groupId, user]);

  const sendMessage = useCallback(
    async (content: string, replyToId?: string) => {
      if (!groupId || !user || !content.trim()) return false;

      try {
        const { error } = await supabase.from("group_messages").insert({
          group_id: groupId,
          sender_id: user.id,
          content: content.trim(),
          reply_to_id: replyToId || null,
        } as any);

        if (error) throw error;
        return true;
      } catch (error) {
        console.error("Error sending message:", error);
        return false;
      }
    },
    [groupId, user]
  );

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Realtime subscription + fallback polling
  useEffect(() => {
    if (!groupId || !user) return;

    pollRef.current = setInterval(fetchMessages, 10000);

    const channel = supabase
      .channel(`group-messages-${user.id}-${groupId}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${groupId}`,
        },
        async (payload) => {
          const newMessage = payload.new as GroupMessage;

          const { data: profile } = await supabase
            .from("profiles")
            .select("username, avatar_url")
            .eq("id", newMessage.sender_id)
            .single();

          setMessages((prev) => {
            if (prev.some(m => m.id === newMessage.id)) return prev;
            return [
              ...prev,
              { ...newMessage, sender: profile || undefined },
            ];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const updated = payload.new as GroupMessage;
          setMessages(prev =>
            prev.map(m =>
              m.id === updated.id
                ? { ...m, content: updated.content, edited_at: updated.edited_at }
                : m
            )
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const deletedId = (payload.old as any).id;
          setMessages(prev => prev.filter(m => m.id !== deletedId));
        }
      )
      .subscribe((status, err) => {
        if (err) console.error("[group-chat] subscription error:", err);
      });

    return () => {
      clearInterval(pollRef.current);
      supabase.removeChannel(channel);
    };
  }, [groupId, user, fetchMessages]);

  return {
    messages,
    loading,
    sendMessage,
    refreshMessages: fetchMessages,
  };
};
