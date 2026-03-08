import { useState, useEffect, useCallback } from "react";
import { playTabSwitchSound } from "@/hooks/useSound";
import { useFriends, Friend } from "@/hooks/useFriends";
import { useGroups, Group } from "@/hooks/useGroups";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MessageCircle,
  Users,
  UserPlus,
  Phone,
  Copy,
  Check,
  Bell,
  LogOut,
  Search,
  Plus,
  Settings,
  Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AddFriendDialog from "@/components/friends/AddFriendDialog";
import FriendRequestsDialog from "@/components/friends/FriendRequestsDialog";
import CreateGroupDialog from "@/components/groups/CreateGroupDialog";
import SettingsDialog from "@/components/SettingsDialog";
import { useToast } from "@/hooks/use-toast";

type Tab = "messages" | "groups";

interface UnifiedSidebarProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  selectedFriend: Friend | null;
  onSelectFriend: (friend: Friend | null) => void;
  selectedGroup: Group | null;
  onSelectGroup: (group: Group | null) => void;
  onStartCall: (friend: Friend) => void;
  onStartGroupCall: (group: Group) => void;
  onOpenSearch: () => void;
}

const UnifiedSidebar = ({
  tab,
  onTabChange,
  selectedFriend,
  onSelectFriend,
  selectedGroup,
  onSelectGroup,
  onStartCall,
  onStartGroupCall,
  onOpenSearch,
}: UnifiedSidebarProps) => {
  const { profile, signOut } = useAuth();
  const { friends, pendingRequests, loading: friendsLoading } = useFriends();
  const { groups, loading: groupsLoading } = useGroups();
  const { getUnreadCount, markAsRead, totalUnread } = useUnreadMessages();
  const { toast } = useToast();

  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (selectedFriend) markAsRead(selectedFriend.id);
  }, [selectedFriend, markAsRead]);

  const copyFriendCode = () => {
    if (profile?.friend_code) {
      navigator.clipboard.writeText(profile.friend_code);
      setCopied(true);
      toast({ title: "Code copié !" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const filteredFriends = friends.filter((f) =>
    f.username.toLowerCase().includes(search.toLowerCase())
  );
  const onlineFriends = filteredFriends.filter(
    (f) => f.status === "online" || f.status === "away"
  );
  const offlineFriends = filteredFriends.filter(
    (f) => f.status !== "online" && f.status !== "away"
  );

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  const loading = tab === "messages" ? friendsLoading : groupsLoading;

  return (
    <div className="w-[320px] h-full flex flex-col bg-card/40 backdrop-blur-2xl border-r border-white/[0.06]">
      {/* ─── Header ─── */}
      <div className="px-4 pt-4 pb-2 space-y-3">
        {/* Tab switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary/40 border border-white/[0.04]">
          <TabButton
            active={tab === "messages"}
            onClick={() => { playTabSwitchSound(); onTabChange("messages"); onSelectGroup(null); }}
            icon={<MessageCircle className="h-4 w-4" />}
            label="Messages"
            badge={totalUnread > 0 ? totalUnread : undefined}
          />
          <TabButton
            active={tab === "groups"}
            onClick={() => { playTabSwitchSound(); onTabChange("groups"); onSelectFriend(null); }}
            icon={<Users className="h-4 w-4" />}
            label="Groupes"
          />
        </div>

        {/* Search + actions row */}
        <div className="flex gap-2">
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-focus-within:text-primary" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="pl-9 h-9 text-sm input-modern rounded-lg"
            />
          </div>

          {tab === "messages" ? (
            <div className="flex gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-lg relative hover:bg-white/[0.06]"
                    onClick={() => setRequestsOpen(true)}
                  >
                    <Bell className="h-4 w-4" />
                    {pendingRequests.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] font-bold rounded-full bg-primary text-primary-foreground">
                        {pendingRequests.length}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Demandes d'ami</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-lg hover:bg-white/[0.06]"
                    onClick={() => setAddFriendOpen(true)}
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ajouter un ami</TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-lg hover:bg-white/[0.06]"
                  onClick={() => setCreateGroupOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Créer un groupe</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* ─── Content ─── */}
      <ScrollArea className="flex-1 px-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            <span className="text-xs text-muted-foreground animate-pulse">Chargement…</span>
          </div>
        ) : tab === "messages" ? (
          <FriendsList
            onlineFriends={onlineFriends}
            offlineFriends={offlineFriends}
            friends={friends}
            selectedFriend={selectedFriend}
            getUnreadCount={getUnreadCount}
            onSelectFriend={onSelectFriend}
            onStartCall={onStartCall}
            onAddFriend={() => setAddFriendOpen(true)}
          />
        ) : (
          <GroupsList
            groups={filteredGroups}
            allGroups={groups}
            selectedGroup={selectedGroup}
            onSelectGroup={onSelectGroup}
            onStartGroupCall={onStartGroupCall}
            onCreateGroup={() => setCreateGroupOpen(true)}
          />
        )}
      </ScrollArea>

      {/* ─── Friend Code (Messages tab only) ─── */}
      {tab === "messages" && (
        <div className="px-3 py-2 border-t border-white/[0.03]">
          <button
            onClick={copyFriendCode}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-all duration-200 group"
          >
            <Hash className="h-3.5 w-3.5 text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground/60 font-medium">Code ami :</span>
            <code className="text-xs font-mono font-bold text-primary/80 tracking-wider">
              {profile?.friend_code}
            </code>
            <span className="ml-auto">
              {copied ? (
                <Check className="h-3 w-3 text-success" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
              )}
            </span>
          </button>
        </div>
      )}

      {/* ─── User Footer ─── */}
      <div className="px-3 py-3 border-t border-white/[0.06] bg-card/30">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="h-9 w-9">
              <AvatarImage src={profile?.avatar_url || ""} className="object-cover" />
              <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                {profile?.username?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-card" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{profile?.username}</p>
            <p className="text-[10px] text-success font-medium">En ligne</p>
          </div>
          <div className="flex gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <span><SettingsDialog /></span>
              </TooltipTrigger>
              <TooltipContent>Paramètres</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-all"
                  onClick={signOut}
                >
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Déconnexion</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <AddFriendDialog open={addFriendOpen} onOpenChange={setAddFriendOpen} />
      <FriendRequestsDialog open={requestsOpen} onOpenChange={setRequestsOpen} />
      <CreateGroupDialog open={createGroupOpen} onOpenChange={setCreateGroupOpen} />
    </div>
  );
};

/* ─── Tab Button ─── */
const TabButton = ({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "flex-1 flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-medium transition-all duration-200",
      active
        ? "bg-primary/15 text-primary shadow-sm border border-primary/20"
        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
    )}
  >
    {icon}
    <span>{label}</span>
    {badge !== undefined && badge > 0 && (
      <span className="h-4 min-w-4 px-1 flex items-center justify-center text-[10px] font-bold rounded-full bg-primary text-primary-foreground">
        {badge > 99 ? "99+" : badge}
      </span>
    )}
  </button>
);

/* ─── Friends List ─── */
const FriendsList = ({
  onlineFriends,
  offlineFriends,
  friends,
  selectedFriend,
  getUnreadCount,
  onSelectFriend,
  onStartCall,
  onAddFriend,
}: {
  onlineFriends: Friend[];
  offlineFriends: Friend[];
  friends: Friend[];
  selectedFriend: Friend | null;
  getUnreadCount: (id: string) => number;
  onSelectFriend: (f: Friend) => void;
  onStartCall: (f: Friend) => void;
  onAddFriend: () => void;
}) => {
  if (friends.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 animate-fade-in-up">
        <div className="w-16 h-16 mb-4 rounded-2xl bg-muted/20 border border-white/[0.04] flex items-center justify-center">
          <MessageCircle className="h-7 w-7 text-muted-foreground/25" />
        </div>
        <p className="text-sm text-muted-foreground font-medium mb-1">Aucun ami</p>
        <p className="text-xs text-muted-foreground/50 mb-4 text-center">
          Ajoute des amis pour commencer à discuter
        </p>
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg border-white/10 hover:border-primary/30 hover:bg-primary/10 text-xs"
          onClick={onAddFriend}
        >
          <UserPlus className="h-3.5 w-3.5 mr-1.5" />
          Ajouter un ami
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      {onlineFriends.length > 0 && (
        <div>
          <SectionLabel>
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            En ligne — {onlineFriends.length}
          </SectionLabel>
          <div className="space-y-0.5">
            {onlineFriends.map((f) => (
              <FriendRow
                key={f.id}
                friend={f}
                isSelected={selectedFriend?.id === f.id}
                unreadCount={getUnreadCount(f.id)}
                onSelect={() => onSelectFriend(f)}
                onCall={() => onStartCall(f)}
              />
            ))}
          </div>
        </div>
      )}
      {offlineFriends.length > 0 && (
        <div>
          <SectionLabel>Hors ligne — {offlineFriends.length}</SectionLabel>
          <div className="space-y-0.5">
            {offlineFriends.map((f) => (
              <FriendRow
                key={f.id}
                friend={f}
                isSelected={selectedFriend?.id === f.id}
                unreadCount={getUnreadCount(f.id)}
                onSelect={() => onSelectFriend(f)}
                onCall={() => onStartCall(f)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Groups List ─── */
const GroupsList = ({
  groups,
  allGroups,
  selectedGroup,
  onSelectGroup,
  onStartGroupCall,
  onCreateGroup,
}: {
  groups: Group[];
  allGroups: Group[];
  selectedGroup: Group | null;
  onSelectGroup: (g: Group) => void;
  onStartGroupCall: (g: Group) => void;
  onCreateGroup: () => void;
}) => {
  if (allGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 animate-fade-in-up">
        <div className="w-16 h-16 mb-4 rounded-2xl bg-muted/20 border border-white/[0.04] flex items-center justify-center">
          <Users className="h-7 w-7 text-muted-foreground/25" />
        </div>
        <p className="text-sm text-muted-foreground font-medium mb-1">Aucun groupe</p>
        <p className="text-xs text-muted-foreground/50 mb-4 text-center">
          Crée un groupe pour discuter à plusieurs
        </p>
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg border-white/10 hover:border-primary/30 hover:bg-primary/10 text-xs"
          onClick={onCreateGroup}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Créer un groupe
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-0.5 py-2">
      {groups.map((g) => (
        <GroupRow
          key={g.id}
          group={g}
          isSelected={selectedGroup?.id === g.id}
          onSelect={() => onSelectGroup(g)}
          onCall={() => onStartGroupCall(g)}
        />
      ))}
    </div>
  );
};

/* ─── Section Label ─── */
const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-bold text-muted-foreground/50 px-3 mb-1.5 uppercase tracking-widest flex items-center gap-1.5">
    {children}
  </p>
);

/* ─── Friend Row ─── */
const FriendRow = ({
  friend,
  isSelected,
  unreadCount,
  onSelect,
  onCall,
}: {
  friend: Friend;
  isSelected: boolean;
  unreadCount: number;
  onSelect: () => void;
  onCall: () => void;
}) => {
  const isOnline = friend.status === "online";
  const isAway = friend.status === "away";
  const isActive = isOnline || isAway;

  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200",
        isSelected
          ? "bg-primary/10 text-foreground"
          : "hover:bg-white/[0.04] text-foreground/80",
        unreadCount > 0 && !isSelected && "bg-primary/[0.04]"
      )}
      onClick={onSelect}
    >
      <div className="relative shrink-0">
        <Avatar className="h-9 w-9">
          <AvatarImage src={friend.avatar_url || ""} className="object-cover" />
          <AvatarFallback className="bg-muted/50 font-semibold text-xs">
            {friend.username[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card",
            isOnline && "bg-success",
            isAway && "bg-warning",
            !isActive && "bg-muted-foreground/30"
          )}
        />
      </div>

      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm truncate",
          unreadCount > 0 ? "font-bold" : "font-medium"
        )}>
          {friend.username}
        </p>
        <p className={cn(
          "text-[11px]",
          isOnline ? "text-success/80" : isAway ? "text-warning/80" : "text-muted-foreground/40"
        )}>
          {isOnline ? "En ligne" : isAway ? "Absent" : "Hors ligne"}
        </p>
      </div>

      {unreadCount > 0 && (
        <Badge className="h-5 min-w-5 px-1.5 text-[10px] font-bold bg-primary text-primary-foreground shrink-0">
          {unreadCount > 99 ? "99+" : unreadCount}
        </Badge>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-7 w-7 rounded-md shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200",
              isActive ? "hover:bg-success/10 hover:text-success" : "opacity-0 pointer-events-none"
            )}
            onClick={(e) => { e.stopPropagation(); if (isActive) onCall(); }}
            disabled={!isActive}
          >
            <Phone className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Appeler</TooltipContent>
      </Tooltip>
    </div>
  );
};

/* ─── Group Row ─── */
const GroupRow = ({
  group,
  isSelected,
  onSelect,
  onCall,
}: {
  group: Group;
  isSelected: boolean;
  onSelect: () => void;
  onCall: () => void;
}) => (
  <div
    className={cn(
      "group flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200",
      isSelected
        ? "bg-primary/10 text-foreground"
        : "hover:bg-white/[0.04] text-foreground/80"
    )}
    onClick={onSelect}
  >
    <Avatar className="h-9 w-9 shrink-0">
      <AvatarImage src={group.avatar_url || ""} className="object-cover" />
      <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
        {group.name[0]?.toUpperCase()}
      </AvatarFallback>
    </Avatar>

    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium truncate">{group.name}</p>
      <p className="text-[11px] text-muted-foreground/40">
        {group.member_count || 1} membre{(group.member_count || 1) > 1 ? "s" : ""}
      </p>
    </div>

    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-md shrink-0 opacity-0 group-hover:opacity-100 hover:bg-success/10 hover:text-success transition-all duration-200"
          onClick={(e) => { e.stopPropagation(); onCall(); }}
        >
          <Phone className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Appel vocal</TooltipContent>
    </Tooltip>
  </div>
);

export default UnifiedSidebar;
