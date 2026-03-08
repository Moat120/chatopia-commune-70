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
 *
 * Uses a dedicated observer channel (`voice-obs-group-<groupId>`)
 * that is completely separate from the channels used by useWebRTCVoice
 * to avoid any channel name conflicts or race conditions.
 *
 * The voice hook broadcasts roster updates on this observer channel too.
 */
export const useVoicePresence = (groupId: string | null) => {
  const [participants, setParticipants] = useState<VoicePresenceUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!groupId) {
      setParticipants([]);
      return;
    }

    const channel = supabase.channel(`voice-obs-group-${groupId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel.on("broadcast", { event: "voice-roster" }, ({ payload }) => {
      if (Array.isArray(payload?.users)) {
        setParticipants(normalizeRoster(payload.users));
      }
    });

    channel.subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(() => {});
        channelRef.current = null;
      }
    };
  }, [groupId]);

  return { participants };
};
