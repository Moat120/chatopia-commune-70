import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Group {
  id: string;
  name: string;
  avatar_url: string | null;
  owner_id: string;
  created_at: string;
}

export interface GroupMember {
  id: string;
  user_id: string;
  role: string;
  username: string;
  avatar_url: string | null;
  status: string | null;
}

export const useGroups = () => {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroups = useCallback(async () => {
    if (!user) {
      console.log("[useGroups] No user, skipping fetch");
      setLoading(false);
      return;
    }

    console.log("[useGroups] Fetching groups for user:", user.id);

    try {
      const { data, error } = await supabase
        .from("group_members")
        .select(`
          group_id,
          groups (
            id,
            name,
            avatar_url,
            owner_id,
            created_at
          )
        `)
        .eq("user_id", user.id);

      if (error) {
        console.error("[useGroups] Fetch error:", error);
        throw error;
      }

      console.log("[useGroups] Raw data:", data);

      const groupsList = data
        ?.map((item: any) => item.groups)
        .filter(Boolean) as Group[];
      
      console.log("[useGroups] Groups list:", groupsList);
      setGroups(groupsList || []);
    } catch (error) {
      console.error("[useGroups] Error fetching groups:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const createGroup = useCallback(
    async (name: string, avatarUrl?: string) => {
      console.log("[useGroups] Creating group:", name);
      console.log("[useGroups] User:", user);

      if (!user) {
        console.error("[useGroups] Cannot create group: no user logged in");
        return null;
      }

      try {
        console.log("[useGroups] Inserting group...");
        
        // Create the group
        const { data: group, error: groupError } = await supabase
          .from("groups")
          .insert({
            name,
            owner_id: user.id,
            avatar_url: avatarUrl || null,
          })
          .select()
          .single();

        if (groupError) {
          console.error("[useGroups] Group insert error:", groupError);
          throw groupError;
        }

        console.log("[useGroups] Group created:", group);

        // Add owner as member with 'owner' role
        console.log("[useGroups] Adding owner as member...");
        const { error: memberError } = await supabase
          .from("group_members")
          .insert({
            group_id: group.id,
            user_id: user.id,
            role: "owner",
          });

        if (memberError) {
          console.error("[useGroups] Member insert error:", memberError);
          throw memberError;
        }

        console.log("[useGroups] Owner added as member, refreshing groups...");
        await fetchGroups();
        return group;
      } catch (error) {
        console.error("[useGroups] Error creating group:", error);
        return null;
      }
    },
    [user, fetchGroups]
  );

  const getGroupMembers = useCallback(
    async (groupId: string): Promise<GroupMember[]> => {
      try {
        const { data, error } = await supabase
          .from("group_members")
          .select(`
            id,
            user_id,
            role,
            profiles (
              username,
              avatar_url,
              status
            )
          `)
          .eq("group_id", groupId);

        if (error) throw error;

        return (data || []).map((item: any) => ({
          id: item.id,
          user_id: item.user_id,
          role: item.role,
          username: item.profiles?.username || "Unknown",
          avatar_url: item.profiles?.avatar_url,
          status: item.profiles?.status,
        }));
      } catch (error) {
        console.error("Error fetching group members:", error);
        return [];
      }
    },
    []
  );

  const addMember = useCallback(
    async (groupId: string, userId: string): Promise<boolean> => {
      try {
        // Check member count
        const { count } = await supabase
          .from("group_members")
          .select("*", { count: "exact", head: true })
          .eq("group_id", groupId);

        if (count && count >= 10) {
          throw new Error("Le groupe a atteint la limite de 10 membres");
        }

        const { error } = await supabase.from("group_members").insert({
          group_id: groupId,
          user_id: userId,
          role: "member",
        });

        if (error) throw error;
        return true;
      } catch (error) {
        console.error("Error adding member:", error);
        return false;
      }
    },
    []
  );

  const removeMember = useCallback(
    async (groupId: string, userId: string): Promise<boolean> => {
      try {
        const { error } = await supabase
          .from("group_members")
          .delete()
          .eq("group_id", groupId)
          .eq("user_id", userId);

        if (error) throw error;
        return true;
      } catch (error) {
        console.error("Error removing member:", error);
        return false;
      }
    },
    []
  );

  const leaveGroup = useCallback(
    async (groupId: string): Promise<boolean> => {
      if (!user) return false;
      return removeMember(groupId, user.id);
    },
    [user, removeMember]
  );

  const deleteGroup = useCallback(
    async (groupId: string): Promise<boolean> => {
      try {
        const { error } = await supabase
          .from("groups")
          .delete()
          .eq("id", groupId);

        if (error) throw error;
        await fetchGroups();
        return true;
      } catch (error) {
        console.error("Error deleting group:", error);
        return false;
      }
    },
    [fetchGroups]
  );

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("groups-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_members",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchGroups();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchGroups]);

  return {
    groups,
    loading,
    createGroup,
    getGroupMembers,
    addMember,
    removeMember,
    leaveGroup,
    deleteGroup,
    refreshGroups: fetchGroups,
  };
};
