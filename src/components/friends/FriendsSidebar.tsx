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
} from "lucide-react";
import { cn } from "@/lib/utils";
import AddFriendDialog from "./AddFriendDialog";
import FriendRequestsDialog from "./FriendRequestsDialog";
import SettingsDialog from "@/components/SettingsDialog";
import { useToast } from "@/hooks/use-toast";

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

  const copyFriendCode = () => {
    if (profile?.friend_code) {
      navigator.clipboard.writeText(profile.friend_code);
      setCopied(true);
      toast({ title: "Code copié !" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const onlineFriends = friends.filter((f) => f.status === "online");
  const offlineFriends = friends.filter((f) => f.status !== "online");

  return (
    <div className="w-72 h-full flex flex-col bg-card/50 border-r border-border/50">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Amis
          </h2>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 relative"
              onClick={() => setRequestsOpen(true)}
            >
              <Bell className="h-4 w-4" />
              {pendingRequests.length > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {pendingRequests.length}
                </Badge>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setAddFriendOpen(true)}
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Friend Code */}
        <div className="glass rounded-xl p-3">
          <p className="text-xs text-muted-foreground mb-1">Ton code ami</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-sm font-semibold text-primary">
              {profile?.friend_code}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={copyFriendCode}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Friends List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Chargement...
            </div>
          ) : friends.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Users className="h-12 w-12 mx-auto mb-2 opacity-20" />
              Aucun ami pour l'instant
              <Button
                variant="link"
                className="block mx-auto mt-2"
                onClick={() => setAddFriendOpen(true)}
              >
                Ajouter des amis
              </Button>
            </div>
          ) : (
            <>
              {onlineFriends.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-muted-foreground px-2 mb-2 uppercase tracking-wider">
                    En ligne — {onlineFriends.length}
                  </p>
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
              )}

              {offlineFriends.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground px-2 mb-2 uppercase tracking-wider">
                    Hors ligne — {offlineFriends.length}
                  </p>
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
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* User Profile Footer */}
      <div className="p-3 border-t border-border/50 glass">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 ring-2 ring-primary/20">
            <AvatarImage src={profile?.avatar_url || ""} className="object-cover" />
            <AvatarFallback className="bg-primary/10 text-primary text-sm">
              {profile?.username?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{profile?.username}</p>
            <p className="text-xs text-success flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              En ligne
            </p>
          </div>
          <SettingsDialog />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={signOut}>
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
        "group flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all",
        "hover:bg-secondary/50",
        isSelected && "bg-secondary/80"
      )}
      onClick={onSelect}
    >
      <div className="relative">
        <Avatar className="h-10 w-10">
          <AvatarImage src={friend.avatar_url || ""} />
          <AvatarFallback className="bg-muted">
            {friend.username[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card",
            isOnline ? "bg-success" : "bg-muted-foreground"
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{friend.username}</p>
        <p className="text-xs text-muted-foreground">
          {isOnline ? "En ligne" : "Hors ligne"}
        </p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
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
          className="h-8 w-8"
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
