import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Reaction {
  id: string;
  message_id: string;
  message_type: "private" | "group";
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  users: string[];
  hasReacted: boolean;
}

export const useReactions = (messageType: "private" | "group", messageIds: string[]) => {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});

  const fetchReactions = useCallback(async () => {
    if (!messageIds.length) return;

    const { data, error } = await supabase
      .from("message_reactions")
      .select("*")
      .eq("message_type", messageType)
      .in("message_id", messageIds);

    if (!error && data) {
      const grouped: Record<string, Reaction[]> = {};
      (data as any[]).forEach((r) => {
        if (!grouped[r.message_id]) grouped[r.message_id] = [];
        grouped[r.message_id].push(r as Reaction);
      });
      setReactions(grouped);
    }
  }, [messageType, messageIds.join(",")]);

  useEffect(() => {
    fetchReactions();
  }, [fetchReactions]);

  // Realtime
  useEffect(() => {
    if (!messageIds.length) return;

    const channel = supabase
      .channel(`reactions-${messageType}-${messageIds[0]?.slice(0, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        (payload) => {
          const row = (payload.new || payload.old) as any;
          if (row?.message_type !== messageType) return;
          // Just refetch for simplicity
          fetchReactions();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [messageType, messageIds.join(","), fetchReactions]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;

    const existing = reactions[messageId]?.find(
      (r) => r.user_id === user.id && r.emoji === emoji
    );

    if (existing) {
      await supabase.from("message_reactions").delete().eq("id", existing.id);
    } else {
      await supabase.from("message_reactions").insert({
        message_id: messageId,
        message_type: messageType,
        user_id: user.id,
        emoji,
      } as any);
    }
  }, [user, reactions, messageType]);

  const getReactionGroups = useCallback((messageId: string): ReactionGroup[] => {
    const msgReactions = reactions[messageId] || [];
    const groups: Record<string, ReactionGroup> = {};

    msgReactions.forEach((r) => {
      if (!groups[r.emoji]) {
        groups[r.emoji] = { emoji: r.emoji, count: 0, users: [], hasReacted: false };
      }
      groups[r.emoji].count++;
      groups[r.emoji].users.push(r.user_id);
      if (r.user_id === user?.id) groups[r.emoji].hasReacted = true;
    });

    return Object.values(groups).sort((a, b) => b.count - a.count);
  }, [reactions, user?.id]);

  return { reactions, toggleReaction, getReactionGroups };
};
