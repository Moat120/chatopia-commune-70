import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Group {
  id: string;
  name: string;
  avatar_url: string | null;
  owner_id: string;
  created_at: string;
  member_count?: number;
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
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const fetchGroups = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

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

      if (error) throw error;

      const groupsList: Group[] = [];
      for (const item of data || []) {
        if (item.groups) {
          const { count } = await supabase
            .from("group_members")
            .select("*", { count: "exact", head: true })
            .eq("group_id", item.groups.id);
          
          groupsList.push({
            ...item.groups,
            member_count: count || 0,
          });
        }
      }
      
      setGroups(groupsList);
    } catch (error) {
      console.error("[useGroups] Error fetching groups:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const createGroup = useCallback(
    async (name: string, avatarUrl?: string) => {
      if (!user) return null;

      try {
        const { data: group, error: groupError } = await supabase
          .from("groups")
          .insert({
            name,
            owner_id: user.id,
            avatar_url: avatarUrl || null,
          })
          .select()
          .single();

        if (groupError) throw groupError;

        const { error: memberError } = await supabase
          .from("group_members")
          .insert({
            group_id: group.id,
            user_id: user.id,
            role: "owner",
          });

        if (memberError) throw memberError;

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
        const { data: membersData, error: membersError } = await supabase
          .from("group_members")
          .select("id, user_id, role")
          .eq("group_id", groupId);

        if (membersError) throw membersError;
        if (!membersData || membersData.length === 0) return [];

        const userIds = membersData.map(m => m.user_id);
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, username, avatar_url, status")
          .in("id", userIds);

        if (profilesError) throw profilesError;

        const profilesMap = new Map(
          (profilesData || []).map(p => [p.id, p])
        );

        return membersData.map((item) => {
          const profile = profilesMap.get(item.user_id);
          return {
            id: item.id,
            user_id: item.user_id,
            role: item.role,
            username: profile?.username || "Unknown",
            avatar_url: profile?.avatar_url || null,
            status: profile?.status || null,
          };
        });
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

  // Realtime subscription + fallback polling
  useEffect(() => {
    if (!user) return;

    pollRef.current = setInterval(fetchGroups, 15000);

    const membershipChannel = supabase
      .channel(`groups-membership-${user.id}-${Date.now()}`)
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
      .subscribe((status, err) => {
        if (err) console.error("[groups-membership] subscription error:", err);
      });

    const allMembersChannel = supabase
      .channel(`groups-all-members-${user.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_members",
        },
        async (payload) => {
          const groupId = (payload.new as any)?.group_id || (payload.old as any)?.group_id;
          if (!groupId) return;
          
          const { count } = await supabase
            .from("group_members")
            .select("*", { count: "exact", head: true })
            .eq("group_id", groupId);
          
          setGroups(prev => prev.map(g =>
            g.id === groupId ? { ...g, member_count: count || 0 } : g
          ));
        }
      )
      .subscribe((status, err) => {
        if (err) console.error("[groups-all-members] subscription error:", err);
      });

    const groupsChannel = supabase
      .channel(`groups-updates-${user.id}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "groups",
        },
        (payload) => {
          const updatedGroup = payload.new as Group;
          setGroups(prev => prev.map(g => 
            g.id === updatedGroup.id 
              ? { ...g, name: updatedGroup.name, avatar_url: updatedGroup.avatar_url }
              : g
          ));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "groups",
        },
        (payload) => {
          const deletedGroupId = (payload.old as any).id;
          setGroups(prev => prev.filter(g => g.id !== deletedGroupId));
        }
      )
      .subscribe((status, err) => {
        if (err) console.error("[groups-updates] subscription error:", err);
      });

    return () => {
      clearInterval(pollRef.current);
      supabase.removeChannel(membershipChannel);
      supabase.removeChannel(allMembersChannel);
      supabase.removeChannel(groupsChannel);
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
