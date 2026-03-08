import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface VoicePresenceUser {
  odId: string;
  username: string;
  avatarUrl?: string;
  isSpeaking: boolean;
  isMuted: boolean;
}

const normalizeRoster = (users: unknown[]): VoicePresenceUser[] => {
  return users
    .map((u: any) => ({
      odId: String(u?.odId ?? ""),
      username: String(u?.username ?? "Utilisateur"),
      avatarUrl: u?.avatarUrl ? String(u.avatarUrl) : undefined,
      isSpeaking: Boolean(u?.isSpeaking),
      isMuted: Boolean(u?.isMuted),
    }))
    .filter((u) => !!u.odId && !u.odId.startsWith("observer-"));
};

/**
 * Observe who is in a group voice call without joining audio.
 * Uses ONLY the roster broadcast channel to avoid conflicting with the
 * voice presence channel used by useWebRTCVoice.
 */
export const useVoicePresence = (groupId: string | null) => {
  const [participants, setParticipants] = useState<VoicePresenceUser[]>([]);
  const rosterChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!groupId) {
      setParticipants([]);
      return;
    }

    // Subscribe to the SAME roster broadcast channel that useWebRTCVoice broadcasts on.
    // The voice hook broadcasts on `voice-status-group-${groupId}`.
    // We use a unique config key to avoid channel name collision within this client.
    const rosterChannel = supabase.channel(`voice-status-group-${groupId}`, {
      config: { broadcast: { self: false } },
    });
    rosterChannelRef.current = rosterChannel;

    rosterChannel.on("broadcast", { event: "voice-roster" }, ({ payload }) => {
      if (Array.isArray(payload?.users)) {
        setParticipants(normalizeRoster(payload.users));
      }
    });

    rosterChannel.subscribe();

    return () => {
      if (rosterChannelRef.current) {
        supabase.removeChannel(rosterChannelRef.current).catch(() => {});
        rosterChannelRef.current = null;
      }
    };
  }, [groupId]);

  return { participants };
};
