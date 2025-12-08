import { useState, useEffect, useRef } from "react";
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
import { MessageCircle, Users, Phone } from "lucide-react";
import { RingtoneManager } from "@/hooks/useSound";

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
  
  const ringtoneManager = useRef<RingtoneManager>(new RingtoneManager());

  // Play ringtone for incoming calls
  useEffect(() => {
    if (incomingCall && !activeCall) {
      ringtoneManager.current.start(2000);
    } else {
      ringtoneManager.current.stop();
    }

    return () => {
      ringtoneManager.current.stop();
    };
  }, [incomingCall, activeCall]);

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

      {/* Incoming Call Notification - Centered */}
      {incomingCall && !activeCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
          <div className="glass rounded-3xl p-8 shadow-2xl border border-border/50 w-96">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="relative mb-4">
                <img
                  src={incomingCall.friend.avatar_url || ""}
                  alt=""
                  className="h-24 w-24 rounded-full bg-muted ring-4 ring-success/30"
                />
                <span className="absolute -top-2 -right-2 w-6 h-6 bg-success rounded-full animate-pulse flex items-center justify-center">
                  <Phone className="h-3 w-3 text-success-foreground" />
                </span>
              </div>
              <p className="text-xl font-semibold">{incomingCall.friend.username}</p>
              <p className="text-muted-foreground">Appel entrant...</p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={handleDeclineIncomingCall}
                className="flex-1 py-3 px-6 rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors font-medium"
              >
                Refuser
              </button>
              <button
                onClick={handleAcceptIncomingCall}
                className="flex-1 py-3 px-6 rounded-2xl bg-success text-success-foreground hover:bg-success/90 transition-colors font-medium"
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
