import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface Friend {
  id: string;
  username: string;
  avatar_url: string | null;
  status: string;
  friend_code: string;
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

  const fetchFriends = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("friendships")
      .select(`
        id,
        requester_id,
        addressee_id,
        status,
        requester:profiles!friendships_requester_id_fkey(id, username, avatar_url, status, friend_code),
        addressee:profiles!friendships_addressee_id_fkey(id, username, avatar_url, status, friend_code)
      `)
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    if (error) {
      console.error("Error fetching friends:", error);
      return;
    }

    const friendsList = data?.map((f: any) => {
      const friend = f.requester_id === user.id ? f.addressee : f.requester;
      return friend as Friend;
    }) || [];

    setFriends(friendsList);
  }, [user]);

  const fetchPendingRequests = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("friendships")
      .select(`
        id,
        created_at,
        requester:profiles!friendships_requester_id_fkey(id, username, avatar_url, status, friend_code)
      `)
      .eq("addressee_id", user.id)
      .eq("status", "pending");

    if (error) {
      console.error("Error fetching requests:", error);
      return;
    }

    const requests = data?.map((r: any) => ({
      id: r.id,
      requester: r.requester as Friend,
      created_at: r.created_at,
    })) || [];

    setPendingRequests(requests);
  }, [user]);

  const sendFriendRequest = async (codeOrUsername: string) => {
    if (!user) return { error: "Non authentifié" };

    // Try to find by friend_code first, then username
    const { data: targetUser, error: findError } = await supabase
      .from("profiles")
      .select("id, username")
      .or(`friend_code.eq.${codeOrUsername.toUpperCase()},username.ilike.${codeOrUsername}`)
      .single();

    if (findError || !targetUser) {
      return { error: "Utilisateur non trouvé" };
    }

    if (targetUser.id === user.id) {
      return { error: "Vous ne pouvez pas vous ajouter vous-même" };
    }

    // Check if friendship already exists
    const { data: existing } = await supabase
      .from("friendships")
      .select("id, status")
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${targetUser.id}),and(requester_id.eq.${targetUser.id},addressee_id.eq.${user.id})`)
      .single();

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
      return { error: "Erreur lors de l'envoi de la demande" };
    }

    toast({
      title: "Demande envoyée",
      description: `Demande d'ami envoyée à ${targetUser.username}`,
    });

    return { success: true };
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

  useEffect(() => {
    if (user) {
      setLoading(true);
      Promise.all([fetchFriends(), fetchPendingRequests()]).finally(() => {
        setLoading(false);
      });

      // Subscribe to realtime updates
      const channel = supabase
        .channel("friendships-changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "friendships" },
          () => {
            fetchFriends();
            fetchPendingRequests();
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles" },
          () => {
            fetchFriends();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, fetchFriends, fetchPendingRequests]);

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
