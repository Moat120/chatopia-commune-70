import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: {
    username: string;
    avatar_url: string | null;
  };
}

export const useGroupChat = (groupId: string | null) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    if (!groupId || !user) return;

    try {
      const { data, error } = await supabase
        .from("group_messages")
        .select(`
          *,
          profiles:sender_id (
            username,
            avatar_url
          )
        `)
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const formattedMessages = (data || []).map((msg: any) => ({
        ...msg,
        sender: msg.profiles,
      }));

      setMessages(formattedMessages);
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
    }
  }, [groupId, user]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!groupId || !user || !content.trim()) return false;

      try {
        const { error } = await supabase.from("group_messages").insert({
          group_id: groupId,
          sender_id: user.id,
          content: content.trim(),
        });

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

  // Realtime subscription
  useEffect(() => {
    if (!groupId) return;

    const channel = supabase
      .channel(`group-messages-${groupId}`)
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
          
          // Fetch sender info
          const { data: profile } = await supabase
            .from("profiles")
            .select("username, avatar_url")
            .eq("id", newMessage.sender_id)
            .single();

          setMessages((prev) => [
            ...prev,
            { ...newMessage, sender: profile || undefined },
          ]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId]);

  return {
    messages,
    loading,
    sendMessage,
    refreshMessages: fetchMessages,
  };
};
