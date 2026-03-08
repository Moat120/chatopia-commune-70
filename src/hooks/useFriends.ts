import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface Friend {
  id: string;
  username: string;
  avatar_url: string | null;
  status: string;
  friend_code: string;
  custom_status: string | null;
}

export interface FriendRequest {
  id: string;
  requester: Friend;
  created_at: string;
}

export const useFriends = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const fetchFriends = useCallback(async () => {
    if (!user) {
      setFriends([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("friendships")
        .select(`
          id,
          requester_id,
          addressee_id,
          status,
          requester:profiles!friendships_requester_id_fkey(id, username, avatar_url, status, friend_code, custom_status),
          addressee:profiles!friendships_addressee_id_fkey(id, username, avatar_url, status, friend_code, custom_status)
        `)
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      if (error) {
        console.error("Error fetching friends:", error);
        setFriends([]);
        return;
      }

      const friendsList = data?.map((f: any) => {
        const friend = f.requester_id === user.id ? f.addressee : f.requester;
        return friend as Friend;
      }).filter(Boolean) || [];

      setFriends(friendsList);
    } catch (err) {
      console.error("Fetch friends error:", err);
      setFriends([]);
    }
  }, [user]);

  const fetchPendingRequests = useCallback(async () => {
    if (!user) {
      setPendingRequests([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("friendships")
        .select(`
          id,
          created_at,
          requester:profiles!friendships_requester_id_fkey(id, username, avatar_url, status, friend_code, custom_status)
        `)
        .eq("addressee_id", user.id)
        .eq("status", "pending");

      if (error) {
        console.error("Error fetching requests:", error);
        setPendingRequests([]);
        return;
      }

      const requests = data?.map((r: any) => ({
        id: r.id,
        requester: r.requester as Friend,
        created_at: r.created_at,
      })).filter(r => r.requester) || [];

      setPendingRequests(requests);
    } catch (err) {
      console.error("Fetch requests error:", err);
      setPendingRequests([]);
    }
  }, [user]);

  const sendFriendRequest = async (codeOrUsername: string) => {
    if (!user) return { error: "Non authentifié" };

    try {
      const sanitizedInput = codeOrUsername.trim();
      if (sanitizedInput.length < 2 || sanitizedInput.length > 50) {
        return { error: "Code ou pseudo invalide" };
      }

      let targetUser = null;
      
      const { data: byCode } = await supabase
        .from("profiles")
        .select("id, username")
        .eq("friend_code", sanitizedInput.toUpperCase())
        .maybeSingle();

      if (byCode) {
        targetUser = byCode;
      } else {
        const { data: byUsername } = await supabase
          .from("profiles")
          .select("id, username")
          .ilike("username", sanitizedInput)
          .maybeSingle();
        
        targetUser = byUsername;
      }

      if (!targetUser) {
        return { error: "Utilisateur non trouvé" };
      }

      if (targetUser.id === user.id) {
        return { error: "Vous ne pouvez pas vous ajouter vous-même" };
      }

      const { data: existingList } = await supabase
        .from("friendships")
        .select("id, status")
        .or(`and(requester_id.eq.${user.id},addressee_id.eq.${targetUser.id}),and(requester_id.eq.${targetUser.id},addressee_id.eq.${user.id})`);

      const existing = existingList?.[0];

      if (existing) {
        if (existing.status === "accepted") {
          return { error: "Vous êtes déjà amis" };
        }
        return { error: "Une demande est déjà en cours" };
      }

      const { error: insertError } = await supabase
        .from("friendships")
        .insert({
          requester_id: user.id,
          addressee_id: targetUser.id,
        });

      if (insertError) {
        console.error("Insert error:", insertError);
        return { error: "Erreur lors de l'envoi de la demande" };
      }

      toast({
        title: "Demande envoyée",
        description: `Demande d'ami envoyée à ${targetUser.username}`,
      });

      return { success: true };
    } catch (err) {
      console.error("Friend request error:", err);
      return { error: "Une erreur est survenue" };
    }
  };

  const acceptRequest = async (requestId: string) => {
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", requestId);

    if (!error) {
      await fetchFriends();
      await fetchPendingRequests();
      toast({ title: "Ami ajouté !" });
    }
  };

  const declineRequest = async (requestId: string) => {
    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("id", requestId);

    if (!error) {
      await fetchPendingRequests();
    }
  };

  const removeFriend = async (friendId: string) => {
    if (!user) return;

    await supabase
      .from("friendships")
      .delete()
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${user.id})`);

    await fetchFriends();
    toast({ title: "Ami supprimé" });
  };

  // Initial fetch on every mount (no hasFetched guard)
  useEffect(() => {
    if (!user) {
      setLoading(false);
      setFriends([]);
      setPendingRequests([]);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchFriends(), fetchPendingRequests()]);
      } catch (err) {
        console.error("Load error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Fallback polling every 10s
    pollRef.current = setInterval(() => {
      fetchFriends();
      fetchPendingRequests();
    }, 10000);

    // Realtime subscriptions with unique channel names
    const friendshipsChannel = supabase
      .channel(`friendships-${user.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships",
          filter: `requester_id=eq.${user.id}` },
        () => {
          fetchFriends();
          fetchPendingRequests();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships",
          filter: `addressee_id=eq.${user.id}` },
        () => {
          fetchFriends();
          fetchPendingRequests();
        }
      )
      .subscribe((status, err) => {
        if (err) console.error("[friendships] subscription error:", err);
      });

    const profilesChannel = supabase
      .channel(`profiles-status-${user.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          const updatedProfile = payload.new as any;
          setFriends(prev => prev.map(friend => 
            friend.id === updatedProfile.id 
              ? { ...friend, status: updatedProfile.status, avatar_url: updatedProfile.avatar_url, username: updatedProfile.username, custom_status: updatedProfile.custom_status }
              : friend
          ));
        }
      )
      .subscribe((status, err) => {
        if (err) console.error("[profiles-status] subscription error:", err);
      });

    return () => {
      clearInterval(pollRef.current);
      supabase.removeChannel(friendshipsChannel);
      supabase.removeChannel(profilesChannel);
    };
  }, [user?.id, fetchFriends, fetchPendingRequests]);

  return {
    friends,
    pendingRequests,
    loading,
    sendFriendRequest,
    acceptRequest,
    declineRequest,
    removeFriend,
    refreshFriends: fetchFriends,
  };
};
