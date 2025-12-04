import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import FriendsSidebar from "@/components/friends/FriendsSidebar";
import PrivateChatPanel from "@/components/friends/PrivateChatPanel";
import PrivateCallPanel from "@/components/friends/PrivateCallPanel";
import GroupsSidebar from "@/components/groups/GroupsSidebar";
import GroupChatPanel from "@/components/groups/GroupChatPanel";
import GroupVoiceChannel from "@/components/groups/GroupVoiceChannel";
import { Friend } from "@/hooks/useFriends";
import { Group } from "@/hooks/useGroups";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { MessageCircle, Users } from "lucide-react";

type ViewMode = "friends" | "groups";

const Index = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>("friends");
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [activeCall, setActiveCall] = useState<{
    friend: Friend;
    isIncoming: boolean;
    callId?: string;
  } | null>(null);
  const [activeGroupCall, setActiveGroupCall] = useState<Group | null>(null);
  const [incomingCall, setIncomingCall] = useState<{
    friend: Friend;
    callId: string;
  } | null>(null);

  // Listen for incoming calls
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("incoming-calls")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "private_calls",
          filter: `callee_id=eq.${user.id}`,
        },
        async (payload) => {
          const call = payload.new as any;
          if (call.status === "ringing") {
            // Fetch caller info
            const { data: caller } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", call.caller_id)
              .single();

            if (caller) {
              setIncomingCall({
                friend: caller as Friend,
                callId: call.id,
              });
              toast({
                title: "Appel entrant",
                description: `${caller.username} vous appelle`,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, toast]);

  const handleStartCall = (friend: Friend) => {
    setActiveCall({ friend, isIncoming: false });
  };

  const handleAcceptIncomingCall = () => {
    if (incomingCall) {
      setActiveCall({
        friend: incomingCall.friend,
        isIncoming: true,
        callId: incomingCall.callId,
      });
      setIncomingCall(null);
    }
  };

  const handleDeclineIncomingCall = async () => {
    if (incomingCall) {
      await supabase
        .from("private_calls")
        .update({ status: "declined", ended_at: new Date().toISOString() })
        .eq("id", incomingCall.callId);
      setIncomingCall(null);
    }
  };

  const handleStartGroupCall = (group: Group) => {
    setActiveGroupCall(group);
  };

  return (
    <div className="h-screen flex bg-background noise">
      {/* View Toggle */}
      <div className="w-16 h-full flex flex-col items-center py-4 gap-2 bg-card/30 border-r border-border/50">
        <Button
          variant={viewMode === "friends" ? "secondary" : "ghost"}
          size="icon"
          className="h-12 w-12 rounded-xl"
          onClick={() => {
            setViewMode("friends");
            setSelectedGroup(null);
          }}
        >
          <MessageCircle className="h-5 w-5" />
        </Button>
        <Button
          variant={viewMode === "groups" ? "secondary" : "ghost"}
          size="icon"
          className="h-12 w-12 rounded-xl"
          onClick={() => {
            setViewMode("groups");
            setSelectedFriend(null);
          }}
        >
          <Users className="h-5 w-5" />
        </Button>
      </div>

      {/* Sidebar */}
      {viewMode === "friends" ? (
        <FriendsSidebar
          selectedFriend={selectedFriend}
          onSelectFriend={setSelectedFriend}
          onStartCall={handleStartCall}
        />
      ) : (
        <GroupsSidebar
          selectedGroup={selectedGroup}
          onSelectGroup={setSelectedGroup}
          onStartGroupCall={handleStartGroupCall}
          onBack={() => setViewMode("friends")}
        />
      )}

      {/* Main Content */}
      {viewMode === "friends" && selectedFriend ? (
        <PrivateChatPanel
          friend={selectedFriend}
          onClose={() => setSelectedFriend(null)}
          onStartCall={() => handleStartCall(selectedFriend)}
        />
      ) : viewMode === "groups" && selectedGroup ? (
        <GroupChatPanel
          group={selectedGroup}
          onClose={() => setSelectedGroup(null)}
          onStartCall={() => handleStartGroupCall(selectedGroup)}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <MessageCircle className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <h2 className="text-xl font-semibold mb-2">Bienvenue !</h2>
            <p className="text-sm">
              {viewMode === "friends"
                ? "Sélectionne un ami pour commencer une conversation"
                : "Sélectionne un groupe ou crée-en un nouveau"}
            </p>
          </div>
        </div>
      )}

      {/* Active Call */}
      {activeCall && (
        <PrivateCallPanel
          friend={activeCall.friend}
          onEnd={() => setActiveCall(null)}
          isIncoming={activeCall.isIncoming}
          callId={activeCall.callId}
        />
      )}

      {/* Active Group Call */}
      {activeGroupCall && (
        <GroupVoiceChannel
          group={activeGroupCall}
          onEnd={() => setActiveGroupCall(null)}
        />
      )}

      {/* Incoming Call Notification */}
      {incomingCall && !activeCall && (
        <div className="fixed bottom-4 right-4 z-50 animate-fade-in-up">
          <div className="glass rounded-2xl p-4 shadow-2xl border border-border/50 w-80">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative">
                <img
                  src={incomingCall.friend.avatar_url || ""}
                  alt=""
                  className="h-12 w-12 rounded-full bg-muted"
                />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-success rounded-full animate-pulse" />
              </div>
              <div>
                <p className="font-semibold">{incomingCall.friend.username}</p>
                <p className="text-sm text-muted-foreground">Appel entrant...</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleDeclineIncomingCall}
                className="flex-1 py-2 px-4 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              >
                Refuser
              </button>
              <button
                onClick={handleAcceptIncomingCall}
                className="flex-1 py-2 px-4 rounded-xl bg-success text-success-foreground hover:bg-success/90 transition-colors"
              >
                Accepter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
