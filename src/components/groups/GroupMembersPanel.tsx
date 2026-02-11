import { useState, useEffect } from "react";
import { useGroups, GroupMember } from "@/hooks/useGroups";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Users, Crown, Shield, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface GroupMembersPanelProps {
  groupId: string;
  isOwner: boolean;
  onAddMember: () => void;
  onClose: () => void;
}

const GroupMembersPanel = ({ groupId, isOwner, onAddMember, onClose }: GroupMembersPanelProps) => {
  const { getGroupMembers } = useGroups();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMembers = async () => {
    const list = await getGroupMembers(groupId);
    setMembers(list);
    setLoading(false);
  };

  useEffect(() => {
    fetchMembers();
  }, [groupId]);

  // Realtime: refresh members when group_members changes
  useEffect(() => {
    const channel = supabase
      .channel(`group-members-panel-${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_members", filter: `group_id=eq.${groupId}` },
        () => fetchMembers()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        () => fetchMembers()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [groupId]);

  const onlineMembers = members.filter(m => m.status === "online" || m.status === "away");
  const offlineMembers = members.filter(m => m.status !== "online" && m.status !== "away");

  const getRoleIcon = (role: string) => {
    if (role === "owner") return <Crown className="h-3.5 w-3.5 text-warning" />;
    if (role === "admin") return <Shield className="h-3.5 w-3.5 text-primary" />;
    return null;
  };

  return (
    <div className="w-64 h-full flex flex-col glass-subtle border-l border-white/[0.04]">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Membres — {members.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-lg hover:bg-white/[0.06]"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1 px-3 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Online */}
            {onlineMembers.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-muted-foreground px-2 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                  En ligne — {onlineMembers.length}
                </p>
                <div className="space-y-0.5">
                  {onlineMembers.map(member => (
                    <MemberItem key={member.id} member={member} roleIcon={getRoleIcon(member.role)} online />
                  ))}
                </div>
              </div>
            )}

            {/* Offline */}
            {offlineMembers.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-muted-foreground px-2 mb-2 uppercase tracking-wider">
                  Hors ligne — {offlineMembers.length}
                </p>
                <div className="space-y-0.5">
                  {offlineMembers.map(member => (
                    <MemberItem key={member.id} member={member} roleIcon={getRoleIcon(member.role)} online={false} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Add member button */}
      {isOwner && (
        <div className="p-3 border-t border-white/[0.04]">
          <Button
            variant="ghost"
            size="sm"
            className="w-full rounded-xl hover:bg-white/[0.06] text-muted-foreground hover:text-foreground"
            onClick={onAddMember}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Inviter
          </Button>
        </div>
      )}
    </div>
  );
};

const MemberItem = ({ member, roleIcon, online }: { member: GroupMember; roleIcon: React.ReactNode; online: boolean }) => (
  <div className={cn(
    "flex items-center gap-2.5 p-2 rounded-xl transition-all duration-200 hover:bg-white/[0.04]",
    !online && "opacity-50"
  )}>
    <div className="relative">
      <Avatar className="h-8 w-8">
        <AvatarImage src={member.avatar_url || ""} className="object-cover" />
        <AvatarFallback className="text-xs font-semibold bg-muted">
          {member.username[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className={cn(
        "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card",
        online ? (member.status === "away" ? "bg-warning" : "bg-success") : "bg-muted-foreground/40"
      )} />
    </div>
    <div className="flex-1 min-w-0 flex items-center gap-1.5">
      <span className="text-sm font-medium truncate">{member.username}</span>
      {roleIcon}
    </div>
  </div>
);

export default GroupMembersPanel;
