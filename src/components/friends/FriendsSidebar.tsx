import { useState } from "react";
import { useFriends, Friend } from "@/hooks/useFriends";
import { useAuth } from "@/contexts/AuthContext";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import AddFriendDialog from "./AddFriendDialog";
import FriendRequestsDialog from "./FriendRequestsDialog";
import SettingsDialog from "@/components/SettingsDialog";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

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
  const { toast } = useToast();
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState("");

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
  const onlineFriends = filteredFriends.filter((f) => f.status === "online");
  const offlineFriends = filteredFriends.filter((f) => f.status !== "online");

  return (
    <div className="w-80 h-full flex flex-col glass-subtle border-r border-white/[0.06]">
      {/* Header */}
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Users className="h-4 w-4 text-primary" />
            </div>
            Amis
          </h2>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl relative hover:bg-white/[0.08]"
              onClick={() => setRequestsOpen(true)}
            >
              <Bell className="h-4 w-4" />
              {pendingRequests.length > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs font-semibold">
                  {pendingRequests.length}
                </Badge>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl hover:bg-white/[0.08]"
              onClick={() => setAddFriendOpen(true)}
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="pl-9 h-10 input-modern"
          />
        </div>

        {/* Friend Code */}
        <div className="card-modern p-4">
          <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">
            Ton code ami
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-base font-semibold text-primary tracking-wide">
              {profile?.friend_code}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-white/[0.1]"
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
          <div className="text-center py-12 text-muted-foreground text-sm">
            <div className="w-8 h-8 mx-auto mb-3 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            Chargement...
          </div>
        ) : friends.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted/30 flex items-center justify-center">
              <Users className="h-8 w-8 opacity-40" />
            </div>
            <p className="text-sm mb-3">Aucun ami pour l'instant</p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => setAddFriendOpen(true)}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Ajouter des amis
            </Button>
          </div>
        ) : (
          <div className="space-y-6 pb-4">
            {onlineFriends.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground px-2 mb-2 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  En ligne — {onlineFriends.length}
                </p>
                <div className="space-y-1">
                  {onlineFriends.map((friend) => (
                    <FriendItem
                      key={friend.id}
                      friend={friend}
                      isSelected={selectedFriend?.id === friend.id}
                      onSelect={() => onSelectFriend(friend)}
                      onMessage={() => onSelectFriend(friend)}
                      onCall={() => onStartCall(friend)}
                    />
                  ))}
                </div>
              </div>
            )}

            {offlineFriends.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground px-2 mb-2 uppercase tracking-wider">
                  Hors ligne — {offlineFriends.length}
                </p>
                <div className="space-y-1">
                  {offlineFriends.map((friend) => (
                    <FriendItem
                      key={friend.id}
                      friend={friend}
                      isSelected={selectedFriend?.id === friend.id}
                      onSelect={() => onSelectFriend(friend)}
                      onMessage={() => onSelectFriend(friend)}
                      onCall={() => onStartCall(friend)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* User Profile Footer */}
      <div className="p-4 glass-solid border-t border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="h-10 w-10 ring-2 ring-primary/20">
              <AvatarImage src={profile?.avatar_url || ""} className="object-cover" />
              <AvatarFallback className="bg-primary/10 text-primary font-medium">
                {profile?.username?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-success rounded-full border-2 border-card" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{profile?.username}</p>
            <p className="text-xs text-success">En ligne</p>
          </div>
          <SettingsDialog />
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-9 w-9 rounded-xl hover:bg-white/[0.08]" 
            onClick={signOut}
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
  onSelect: () => void;
  onMessage: () => void;
  onCall: () => void;
}

const FriendItem = ({
  friend,
  isSelected,
  onSelect,
  onMessage,
  onCall,
}: FriendItemProps) => {
  const isOnline = friend.status === "online";

  return (
    <div
      className={cn(
        "group flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all duration-200",
        isSelected
          ? "bg-primary/15 border border-primary/20"
          : "hover:bg-white/[0.06] border border-transparent"
      )}
      onClick={onSelect}
    >
      <div className="relative">
        <Avatar className="h-11 w-11">
          <AvatarImage src={friend.avatar_url || ""} className="object-cover" />
          <AvatarFallback className="bg-muted font-medium">
            {friend.username[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-card transition-colors",
            isOnline ? "bg-success" : "bg-muted-foreground/50"
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{friend.username}</p>
        <p className={cn(
          "text-xs",
          isOnline ? "text-success" : "text-muted-foreground"
        )}>
          {isOnline ? "En ligne" : "Hors ligne"}
        </p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg hover:bg-white/[0.1]"
          onClick={(e) => {
            e.stopPropagation();
            onMessage();
          }}
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 rounded-lg",
            isOnline ? "hover:bg-success/20 hover:text-success" : "opacity-50"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onCall();
          }}
          disabled={!isOnline}
        >
          <Phone className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default FriendsSidebar;
