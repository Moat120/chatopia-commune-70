import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { playNotificationSound, playMessageReceivedSound } from "@/hooks/useSound";

/** Request notification permission on mount; send browser notifications + sounds for new messages when tab is hidden. */
export const useNotifications = () => {
  const { user } = useAuth();
  const permissionRef = useRef<NotificationPermission>("default");

  // Request permission once
  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      permissionRef.current = "granted";
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((p) => {
        permissionRef.current = p;
      });
    }
  }, []);

  const notify = useCallback((title: string, body: string, opts?: { icon?: string; sound?: 'message' | 'notification' }) => {
    // Always play sound if tab is hidden
    if (document.visibilityState !== "visible") {
      if (opts?.sound === 'message') {
        playMessageReceivedSound();
      } else {
        playNotificationSound();
      }
    }

    if (permissionRef.current !== "granted") return;
    if (document.visibilityState === "visible") return;

    try {
      const n = new Notification(title, {
        body,
        icon: opts?.icon || "/favicon.ico",
        badge: "/favicon.ico",
        tag: `chatopia-${Date.now()}`,
        silent: true, // We handle sounds ourselves
        requireInteraction: false,
      });

      n.onclick = () => {
        window.focus();
        n.close();
      };

      setTimeout(() => n.close(), 6000);
    } catch {
      // Notifications may not be supported in all contexts
    }
  }, []);

  // Listen for private messages
  useEffect(() => {
    if (!user) return;
    const ts = Date.now();

    const channel = supabase
      .channel(`notif-pm-${user.id}-${ts}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "private_messages",
          filter: `receiver_id=eq.${user.id}` },
        async (payload) => {
          const msg = payload.new as any;
          if (msg.sender_id === user.id) return;

          const { data: sender } = await supabase
            .from("profiles")
            .select("username, avatar_url")
            .eq("id", msg.sender_id)
            .single();

          notify(
            sender?.username || "Nouveau message",
            msg.content?.substring(0, 120) || "📎 Fichier",
            { icon: sender?.avatar_url || undefined, sound: 'message' }
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, notify]);

  // Listen for group messages
  useEffect(() => {
    if (!user) return;
    const ts = Date.now();

    const channel = supabase
      .channel(`notif-gm-${user.id}-${ts}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages" },
        async (payload) => {
          const msg = payload.new as any;
          if (msg.sender_id === user.id) return;

          const { data: membership } = await supabase
            .from("group_members")
            .select("id")
            .eq("group_id", msg.group_id)
            .eq("user_id", user.id)
            .maybeSingle();

          if (!membership) return;

          const [{ data: sender }, { data: group }] = await Promise.all([
            supabase.from("profiles").select("username, avatar_url").eq("id", msg.sender_id).single(),
            supabase.from("groups").select("name, avatar_url").eq("id", msg.group_id).single(),
          ]);

          notify(
            `${sender?.username || "Message"} • ${group?.name || "Groupe"}`,
            msg.content?.substring(0, 120) || "📎 Fichier",
            { icon: group?.avatar_url || sender?.avatar_url || undefined, sound: 'message' }
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, notify]);

  // Listen for friend requests
  useEffect(() => {
    if (!user) return;
    const ts = Date.now();

    const channel = supabase
      .channel(`notif-fr-${user.id}-${ts}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "friendships",
          filter: `addressee_id=eq.${user.id}` },
        async (payload) => {
          const req = payload.new as any;
          const { data: sender } = await supabase
            .from("profiles")
            .select("username, avatar_url")
            .eq("id", req.requester_id)
            .single();

          notify(
            "Demande d'ami",
            `${sender?.username || "Quelqu'un"} vous a envoyé une demande d'ami`,
            { icon: sender?.avatar_url || undefined, sound: 'notification' }
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, notify]);

  // Listen for incoming private calls
  useEffect(() => {
    if (!user) return;
    const ts = Date.now();

    const channel = supabase
      .channel(`notif-call-${user.id}-${ts}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "private_calls",
          filter: `callee_id=eq.${user.id}` },
        async (payload) => {
          const call = payload.new as any;
          if (call.status !== "ringing") return;

          const { data: caller } = await supabase
            .from("profiles")
            .select("username, avatar_url")
            .eq("id", call.caller_id)
            .single();

          notify(
            "📞 Appel entrant",
            `${caller?.username || "Quelqu'un"} vous appelle`,
            { icon: caller?.avatar_url || undefined, sound: 'notification' }
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, notify]);
};
