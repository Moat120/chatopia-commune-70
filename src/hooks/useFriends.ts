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
  const previousRequestsCount = useRef(0);
  const hasFetched = useRef(false);

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
          requester:profiles!friendships_requester_id_fkey(id, username, avatar_url, status, friend_code),
          addressee:profiles!friendships_addressee_id_fkey(id, username, avatar_url, status, friend_code)
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
          requester:profiles!friendships_requester_id_fkey(id, username, avatar_url, status, friend_code)
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

      previousRequestsCount.current = requests.length;

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

  useEffect(() => {
    if (!user) {
      setLoading(false);
      setFriends([]);
      setPendingRequests([]);
      hasFetched.current = false;
      return;
    }

    const loadData = async () => {
      if (hasFetched.current) return;
      hasFetched.current = true;
      
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

    // Subscribe to realtime updates for friendships
    const friendshipsChannel = supabase
      .channel("friendships-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => {
          fetchFriends();
          fetchPendingRequests();
        }
      )
      .subscribe();

    // Subscribe to profile status changes for real-time online/offline updates
    const profilesChannel = supabase
      .channel("profiles-status-changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          // Update friend status in real-time without full refetch
          const updatedProfile = payload.new as any;
          setFriends(prev => prev.map(friend => 
            friend.id === updatedProfile.id 
              ? { ...friend, status: updatedProfile.status, avatar_url: updatedProfile.avatar_url, username: updatedProfile.username }
              : friend
          ));
        }
      )
      .subscribe();

    return () => {
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
