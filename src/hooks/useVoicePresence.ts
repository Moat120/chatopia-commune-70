import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface VoicePresenceUser {
  odId: string;
  username: string;
  avatarUrl?: string;
  isSpeaking: boolean;
  isMuted: boolean;
}

/**
 * Passive hook that observes who is in a voice channel
 * WITHOUT joining the call. Read-only presence subscription.
 */
export const useVoicePresence = (groupId: string | null) => {
  const [participants, setParticipants] = useState<VoicePresenceUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!groupId) {
      setParticipants([]);
      return;
    }

    const channelName = `voice-pres-group-${groupId}`;

    // Subscribe as observer (no track() call = read-only)
    const channel = supabase.channel(channelName, {
      config: { presence: { key: `observer-${Math.random().toString(36).slice(2)}` } },
    });
    channelRef.current = channel;

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const users: VoicePresenceUser[] = [];

      Object.values(state).forEach((presences: any[]) => {
        presences.forEach((p) => {
          // Only include actual voice participants (not observers)
          if (p.odId && !String(p.odId).startsWith("observer-")) {
            users.push({
              odId: p.odId,
              username: p.username || "Utilisateur",
              avatarUrl: p.avatarUrl,
              isSpeaking: p.isSpeaking || false,
              isMuted: p.isMuted || false,
            });
          }
        });
      });

      setParticipants(users);
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [groupId]);

  return { participants };
};
