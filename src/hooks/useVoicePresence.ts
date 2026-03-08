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
 * WITHOUT joining the call. Uses a separate channel name suffix
 * to avoid collisions with the active voice presence channel.
 * 
 * Calls track() with an observer flag so Supabase presence
 * fully syncs, but filters out observers from the participant list.
 */
export const useVoicePresence = (groupId: string | null) => {
  const [participants, setParticipants] = useState<VoicePresenceUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const observerIdRef = useRef(`observer-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!groupId) {
      setParticipants([]);
      return;
    }

    // Use a DIFFERENT channel name than the voice hook to avoid conflicts.
    // The voice hook uses: voice-pres-group-${groupId}
    // The observer uses:   voice-obs-group-${groupId}-${observerId}
    // BUT we need to listen to the SAME presence room.
    // Supabase channels with different names are separate rooms.
    // So we must subscribe to the SAME channel name but with a unique presence key.
    const channelName = `voice-pres-group-${groupId}`;
    const observerId = observerIdRef.current;

    const channel = supabase.channel(channelName, {
      config: { presence: { key: observerId } },
    });
    channelRef.current = channel;

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const users: VoicePresenceUser[] = [];

      Object.entries(state).forEach(([key, presences]: [string, any[]]) => {
        // Skip observer keys
        if (key.startsWith("observer-")) return;

        presences.forEach((p) => {
          if (p.odId) {
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

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        // Track as observer so we receive sync events
        await channel.track({
          _observer: true,
          odId: observerId,
        });
      }
    });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [groupId]);

  return { participants };
};
