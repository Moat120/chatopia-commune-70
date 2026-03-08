import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/** Request notification permission on mount; send browser notifications for new messages when tab is hidden. */
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

  const notify = useCallback((title: string, body: string, icon?: string) => {
    if (document.visibilityState === "visible") return;
    if (permissionRef.current !== "granted") return;

    const n = new Notification(title, {
      body,
      icon: icon || "/favicon.ico",
      tag: "chatopia-msg",
      silent: false,
    });

    n.onclick = () => {
      window.focus();
      n.close();
    };

    setTimeout(() => n.close(), 5000);
  }, []);

  // Listen for private messages
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notif-private-${user.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "private_messages",
          filter: `receiver_id=eq.${user.id}`,
        },
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
            msg.content?.substring(0, 100) || "",
            sender?.avatar_url || undefined
          );
        }
      )
      .subscribe((status, err) => {
        if (err) console.error("[notif-private] subscription error:", err);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, notify]);

  // Listen for group messages
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notif-group-${user.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_messages",
        },
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
            msg.content?.substring(0, 100) || "",
            group?.avatar_url || sender?.avatar_url || undefined
          );
        }
      )
      .subscribe((status, err) => {
        if (err) console.error("[notif-group] subscription error:", err);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, notify]);

  // Listen for friend requests
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notif-friend-req-${user.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "friendships",
          filter: `addressee_id=eq.${user.id}`,
        },
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
            sender?.avatar_url || undefined
          );
        }
      )
      .subscribe((status, err) => {
        if (err) console.error("[notif-friend-req] subscription error:", err);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, notify]);
};
