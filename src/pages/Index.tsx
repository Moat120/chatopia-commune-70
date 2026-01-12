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
import { cn } from "@/lib/utils";
import { usePresence } from "@/hooks/usePresence";
import { useCallCleanup } from "@/hooks/useCallCleanup";

type ViewMode = "friends" | "groups";

const Index = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Initialize presence system for automatic online/offline tracking
  usePresence();
  
  // Initialize call cleanup for abandoned calls
  useCallCleanup();
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
    <div className="h-screen flex mesh-gradient noise overflow-hidden">
      {/* Navigation Rail */}
      <div className="w-[72px] h-full flex flex-col items-center py-4 gap-3 glass-solid border-r border-white/[0.06]">
        <NavButton
          active={viewMode === "friends"}
          onClick={() => {
            setViewMode("friends");
            setSelectedGroup(null);
          }}
          icon={<MessageCircle className="h-5 w-5" />}
          label="Messages"
        />
        <NavButton
          active={viewMode === "groups"}
          onClick={() => {
            setViewMode("groups");
            setSelectedFriend(null);
          }}
          icon={<Users className="h-5 w-5" />}
          label="Groupes"
        />
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
          <div className="text-center animate-fade-in-up">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary/20 to-transparent border border-white/[0.08] flex items-center justify-center">
              <MessageCircle className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">Bienvenue !</h2>
            <p className="text-muted-foreground max-w-sm">
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

      {/* Incoming Call Modal */}
      {incomingCall && !activeCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xl animate-fade-in">
          <div className="card-modern p-8 w-[380px] animate-scale-in">
            <div className="flex flex-col items-center text-center mb-8">
              <div className="relative mb-5">
                <div className="absolute inset-0 bg-success/20 rounded-full animate-ping" />
                <img
                  src={incomingCall.friend.avatar_url || ""}
                  alt=""
                  className="h-28 w-28 rounded-full bg-muted ring-4 ring-success/30 relative z-10 object-cover"
                />
                <span className="absolute -top-1 -right-1 w-8 h-8 bg-success rounded-full flex items-center justify-center z-20 shadow-lg glow-success">
                  <Phone className="h-4 w-4 text-success-foreground" />
                </span>
              </div>
              <p className="text-2xl font-semibold mb-1">{incomingCall.friend.username}</p>
              <p className="text-muted-foreground">Appel entrant...</p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={handleDeclineIncomingCall}
                className="flex-1 h-12 rounded-xl bg-destructive/90 hover:bg-destructive text-destructive-foreground font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Refuser
              </Button>
              <Button
                onClick={handleAcceptIncomingCall}
                className="flex-1 h-12 rounded-xl bg-success hover:bg-success/90 text-success-foreground font-medium transition-all hover:scale-[1.02] active:scale-[0.98] glow-success"
              >
                Accepter
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const NavButton = ({ active, onClick, icon, label }: NavButtonProps) => (
  <button
    onClick={onClick}
    className={cn(
      "relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 group",
      active
        ? "bg-primary text-primary-foreground shadow-lg glow-primary"
        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.08]"
    )}
    title={label}
  >
    {icon}
    {active && (
      <span className="absolute -left-3 w-1 h-6 bg-primary rounded-r-full" />
    )}
  </button>
);

export default Index;
