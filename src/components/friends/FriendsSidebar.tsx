import { useState, useEffect } from "react";
import { useFriends, Friend } from "@/hooks/useFriends";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  UserPlus,
  MessageCircle,
  Phone,
  Copy,
  Check,
  Bell,
  LogOut,
  Search,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AddFriendDialog from "./AddFriendDialog";
import FriendRequestsDialog from "./FriendRequestsDialog";
import SettingsDialog from "@/components/SettingsDialog";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { playClickSound } from "@/hooks/useSound";

interface FriendsSidebarProps {
  selectedFriend: Friend | null;
  onSelectFriend: (friend: Friend | null) => void;
  onStartCall: (friend: Friend) => void;
}

const FriendsSidebar = ({
  selectedFriend,
  onSelectFriend,
  onStartCall,
}: FriendsSidebarProps) => {
  const { profile, signOut } = useAuth();
  const { friends, pendingRequests, loading } = useFriends();
  const { getUnreadCount, markAsRead, totalUnread } = useUnreadMessages();
  const { toast } = useToast();
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (selectedFriend) {
      markAsRead(selectedFriend.id);
    }
  }, [selectedFriend, markAsRead]);

  const copyFriendCode = () => {
    if (profile?.friend_code) {
      navigator.clipboard.writeText(profile.friend_code);
      setCopied(true);
      playClickSound();
      toast({ title: "Code copié !" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const filteredFriends = friends.filter((f) =>
    f.username.toLowerCase().includes(search.toLowerCase())
  );
  const onlineFriends = filteredFriends.filter((f) => f.status === "online" || f.status === "away");
  const offlineFriends = filteredFriends.filter((f) => f.status !== "online" && f.status !== "away");

  return (
    <div className="w-80 h-full flex flex-col glass-subtle border-r border-white/[0.04]">
      {/* Header */}
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/25 to-primary/10 border border-primary/20 flex items-center justify-center">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <span className="gradient-text-static">Amis</span>
          </h2>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl relative hover:bg-white/[0.06] transition-all duration-300"
              onClick={() => { playClickSound(); setRequestsOpen(true); }}
            >
              <Bell className="h-4 w-4" />
              {pendingRequests.length > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 min-w-5 p-0 flex items-center justify-center text-xs font-bold bg-primary text-primary-foreground animate-scale-in glow-primary">
                  {pendingRequests.length}
                </Badge>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl hover:bg-white/[0.06] transition-all duration-300"
              onClick={() => { playClickSound(); setAddFriendOpen(true); }}
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="pl-10 h-11 input-modern"
          />
        </div>

        {/* Friend Code Card */}
        <div className="card-modern p-4 hover:border-primary/20 transition-all duration-300 group">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-3 w-3 text-primary" />
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
              Ton code ami
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-base font-bold gradient-text-static tracking-widest">
              {profile?.friend_code}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-white/[0.08] transition-all duration-300"
              onClick={copyFriendCode}
            >
              {copied ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Friends List */}
      <ScrollArea className="flex-1 px-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            <span className="animate-pulse">Chargement...</span>
          </div>
        ) : friends.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground animate-fade-in-up">
            <div className="w-20 h-20 mb-5 rounded-3xl bg-gradient-to-br from-muted/30 to-transparent border border-white/[0.04] flex items-center justify-center">
              <Users className="h-10 w-10 opacity-30" />
            </div>
            <p className="text-sm mb-4 font-medium">Aucun ami pour l'instant</p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-white/10 hover:border-primary/30 hover:bg-primary/10 transition-all duration-300"
              onClick={() => { playClickSound(); setAddFriendOpen(true); }}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Ajouter des amis
            </Button>
          </div>
        ) : (
          <div className="space-y-6 pb-4">
            {onlineFriends.length > 0 && (
              <div>
                <p className="text-xs font-bold text-muted-foreground px-2 mb-3 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-success status-online" />
                  En ligne — {onlineFriends.length}
                </p>
                <div className="space-y-1">
                  {onlineFriends.map((friend, index) => (
                    <div
                      key={friend.id}
                      className="animate-fade-in"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      <FriendItem
                        friend={friend}
                        isSelected={selectedFriend?.id === friend.id}
                        unreadCount={getUnreadCount(friend.id)}
                        onSelect={() => { playClickSound(); onSelectFriend(friend); }}
                        onMessage={() => onSelectFriend(friend)}
                        onCall={() => onStartCall(friend)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {offlineFriends.length > 0 && (
              <div>
                <p className="text-xs font-bold text-muted-foreground px-2 mb-3 uppercase tracking-wider">
                  Hors ligne — {offlineFriends.length}
                </p>
                <div className="space-y-1">
                  {offlineFriends.map((friend, index) => (
                    <div
                      key={friend.id}
                      className="animate-fade-in"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      <FriendItem
                        friend={friend}
                        isSelected={selectedFriend?.id === friend.id}
                        unreadCount={getUnreadCount(friend.id)}
                        onSelect={() => { playClickSound(); onSelectFriend(friend); }}
                        onMessage={() => onSelectFriend(friend)}
                        onCall={() => onStartCall(friend)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* User Profile Footer */}
      <div className="p-4 glass-solid border-t border-white/[0.04]">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="h-11 w-11 ring-2 ring-primary/20">
              <AvatarImage src={profile?.avatar_url || ""} className="object-cover" />
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary font-bold">
                {profile?.username?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-success rounded-full border-2 border-card status-online" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{profile?.username}</p>
            <p className="text-xs text-success font-medium">En ligne</p>
          </div>
          <SettingsDialog />
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-9 w-9 rounded-xl hover:bg-white/[0.06] hover:text-destructive transition-all duration-300" 
            onClick={() => { playClickSound(); signOut(); }}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AddFriendDialog open={addFriendOpen} onOpenChange={setAddFriendOpen} />
      <FriendRequestsDialog open={requestsOpen} onOpenChange={setRequestsOpen} />
    </div>
  );
};

interface FriendItemProps {
  friend: Friend;
  isSelected: boolean;
  unreadCount?: number;
  onSelect: () => void;
  onMessage: () => void;
  onCall: () => void;
}

const FriendItem = ({
  friend,
  isSelected,
  unreadCount = 0,
  onSelect,
  onMessage,
  onCall,
}: FriendItemProps) => {
  const isOnline = friend.status === "online";
  const isAway = friend.status === "away";
  const isActive = isOnline || isAway;

  return (
    <div
      className={cn(
        "group flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all duration-300",
        isSelected
          ? "bg-primary/15 border border-primary/25 shadow-lg shadow-primary/10"
          : "hover:bg-white/[0.04] border border-transparent",
        unreadCount > 0 && !isSelected && "bg-primary/5 border-primary/10"
      )}
      onClick={onSelect}
    >
      <div className="relative">
        <Avatar className={cn(
          "h-12 w-12 transition-all duration-300",
          isSelected && "ring-2 ring-primary/30"
        )}>
          <AvatarImage src={friend.avatar_url || ""} className="object-cover" />
          <AvatarFallback className="bg-gradient-to-br from-muted to-muted/50 font-semibold">
            {friend.username[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-card transition-all duration-300",
            isOnline && "bg-success status-online",
            isAway && "bg-warning",
            !isActive && "bg-muted-foreground/40"
          )}
        />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn(
            "text-sm font-semibold truncate transition-colors duration-300",
            unreadCount > 0 && "text-foreground"
          )}>
            {friend.username}
          </p>
          {unreadCount > 0 && (
            <Badge 
              className="h-5 min-w-5 px-1.5 text-xs font-bold bg-primary text-primary-foreground animate-scale-in"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </div>
        <p className={cn(
          "text-xs font-medium transition-colors duration-300",
          isOnline ? "text-success" : isAway ? "text-warning" : "text-muted-foreground/60"
        )}>
          {isOnline ? "En ligne" : isAway ? "Absent" : "Hors ligne"}
        </p>
      </div>
      
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg hover:bg-white/[0.08] transition-all duration-300"
          onClick={(e) => {
            e.stopPropagation();
            playClickSound();
            onMessage();
          }}
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 rounded-lg transition-all duration-300",
            isActive ? "hover:bg-success/15 hover:text-success" : "opacity-40 cursor-not-allowed"
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (isActive) {
              playClickSound();
              onCall();
            }
          }}
          disabled={!isActive}
        >
          <Phone className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default FriendsSidebar;
