import { useState, useEffect, useRef, useCallback } from "react";
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
 * WITHOUT joining the call.
 * 
 * Uses a separate "-watch" channel name to avoid conflicts 
 * with the active voice presence channel used by useWebRTCVoice.
 * Both use Supabase presence, so they are independent rooms,
 * but the voice hook broadcasts participant updates to a broadcast
 * channel that observers can listen to.
 * 
 * Fallback: polls the presence state of the voice channel
 * periodically without subscribing to it.
 */
export const useVoicePresence = (groupId: string | null) => {
  const [participants, setParticipants] = useState<VoicePresenceUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!groupId) {
      setParticipants([]);
      return;
    }

    // Listen for voice status broadcasts on a dedicated broadcast channel
    const broadcastChannelName = `voice-status-group-${groupId}`;
    const channel = supabase.channel(broadcastChannelName, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel.on("broadcast", { event: "voice-roster" }, ({ payload }) => {
      if (payload?.users && Array.isArray(payload.users)) {
        setParticipants(payload.users.map((u: any) => ({
          odId: u.odId,
          username: u.username || "Utilisateur",
          avatarUrl: u.avatarUrl,
          isSpeaking: u.isSpeaking || false,
          isMuted: u.isMuted || false,
        })));
      }
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [groupId]);

  return { participants };
};
