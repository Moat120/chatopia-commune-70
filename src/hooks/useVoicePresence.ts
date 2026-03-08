import { useState, useEffect, useRef, useCallback } from "react";
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
 * Uses 2 sources:
 * 1) presence snapshot/sync on `voice-pres-group-<groupId>` for immediate accuracy
 * 2) roster broadcasts on `voice-status-group-<groupId>` for faster UI updates
 */
export const useVoicePresence = (groupId: string | null) => {
  const [participants, setParticipants] = useState<VoicePresenceUser[]>([]);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const rosterChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const syncFromPresence = useCallback(() => {
    const state = presenceChannelRef.current?.presenceState();
    if (!state) return;

    const users: VoicePresenceUser[] = [];
    Object.entries(state).forEach(([key, presences]) => {
      if (key.startsWith("observer-")) return;
      (presences as any[]).forEach((presence) => {
        if (!presence?.odId || presence?._observer) return;
        users.push({
          odId: presence.odId,
          username: presence.username || "Utilisateur",
          avatarUrl: presence.avatarUrl,
          isSpeaking: Boolean(presence.isSpeaking),
          isMuted: Boolean(presence.isMuted),
        });
      });
    });

    setParticipants(users);
  }, []);

  useEffect(() => {
    if (!groupId) {
      setParticipants([]);
      return;
    }

    const observerKey = `observer-${groupId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

    const presenceChannel = supabase.channel(`voice-pres-group-${groupId}`, {
      config: { presence: { key: observerKey } },
    });
    presenceChannelRef.current = presenceChannel;

    presenceChannel.on("presence", { event: "sync" }, syncFromPresence);

    presenceChannel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await presenceChannel.track({
          odId: observerKey,
          _observer: true,
          isSpeaking: false,
          isMuted: true,
        });
        syncFromPresence();
      }
    });

    return () => {
      if (rosterChannelRef.current) {
        supabase.removeChannel(rosterChannelRef.current);
        rosterChannelRef.current = null;
      }
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
      }
    };
  }, [groupId, syncFromPresence]);

  return { participants };
};
