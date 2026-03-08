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
      tag: "chatopia-msg", // collapse rapid msgs
      silent: false,
    });

    // Focus tab on click
    n.onclick = () => {
      window.focus();
      n.close();
    };

    // Auto-close after 5s
    setTimeout(() => n.close(), 5000);
  }, []);

  // Listen for private messages
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("notif-private")
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, notify]);

  // Listen for group messages
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("notif-group")
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

          // Check membership
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, notify]);
};
