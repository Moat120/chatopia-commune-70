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
import { MessageCircle, Users, Phone, PhoneOff, Sparkles } from "lucide-react";
import { RingtoneManager, playClickSound } from "@/hooks/useSound";
import { cn } from "@/lib/utils";
import { usePresence } from "@/hooks/usePresence";
import { useCallCleanup } from "@/hooks/useCallCleanup";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ViewMode = "friends" | "groups";

const Index = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  usePresence();
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
    <TooltipProvider delayDuration={200}>
      <div className="h-screen flex mesh-gradient-animated overflow-hidden relative">
        {/* Noise overlay */}
        <div className="absolute inset-0 noise pointer-events-none" />

        {/* Navigation Rail */}
        <div className="w-[76px] h-full flex flex-col items-center py-5 gap-2 glass-solid border-r border-white/[0.04] relative z-10">
          {/* Logo */}
          <div className="mb-4 p-2">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10 border border-white/10 flex items-center justify-center glow-primary">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
          </div>

          <div className="w-8 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-2" />

          {/* Nav buttons */}
          <NavButton
            active={viewMode === "friends"}
            onClick={() => {
              playClickSound();
              setViewMode("friends");
              setSelectedGroup(null);
            }}
            icon={<MessageCircle className="h-5 w-5" />}
            label="Messages"
          />
          <NavButton
            active={viewMode === "groups"}
            onClick={() => {
              playClickSound();
              setViewMode("groups");
              setSelectedFriend(null);
            }}
            icon={<Users className="h-5 w-5" />}
            label="Groupes"
          />
        </div>

        {/* Sidebar */}
        <div className="relative z-10">
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
        </div>

        {/* Main Content */}
        <div className="flex-1 relative z-10">
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
            <EmptyState viewMode={viewMode} />
          )}
        </div>

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
          <IncomingCallModal
            friend={incomingCall.friend}
            onAccept={handleAcceptIncomingCall}
            onDecline={handleDeclineIncomingCall}
          />
        )}
      </div>
    </TooltipProvider>
  );
};

// Empty State Component
const EmptyState = ({ viewMode }: { viewMode: ViewMode }) => (
  <div className="flex-1 flex items-center justify-center h-full">
    <div className="text-center animate-reveal">
      {/* Decorative icon container */}
      <div className="relative mb-8 inline-block">
        <div className="absolute -inset-8 bg-primary/10 rounded-full blur-3xl" />
        <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-white/[0.06] flex items-center justify-center float-subtle">
          <MessageCircle className="h-12 w-12 text-muted-foreground/30" />
        </div>
      </div>
      
      <h2 className="text-3xl font-bold mb-3 gradient-text-static">
        Bienvenue !
      </h2>
      <p className="text-muted-foreground/70 max-w-sm text-lg font-light">
        {viewMode === "friends"
          ? "Sélectionne un ami pour commencer une conversation"
          : "Sélectionne un groupe ou crée-en un nouveau"}
      </p>
    </div>
  </div>
);

// Nav Button Component
interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const NavButton = ({ active, onClick, icon, label }: NavButtonProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        onClick={onClick}
        className={cn(
          "relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-400 group",
          active
            ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg glow-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
        )}
      >
        <span className={cn(
          "transition-transform duration-300",
          active && "scale-110"
        )}>
          {icon}
        </span>
        
        {/* Active indicator pill */}
        {active && (
          <span className="absolute -left-[14px] w-1 h-7 bg-primary rounded-r-full shadow-lg shadow-primary/50" />
        )}
      </button>
    </TooltipTrigger>
    <TooltipContent side="right" className="glass-solid border-white/10 px-3 py-2">
      <p className="font-medium">{label}</p>
    </TooltipContent>
  </Tooltip>
);

// Incoming Call Modal Component
interface IncomingCallModalProps {
  friend: Friend;
  onAccept: () => void;
  onDecline: () => void;
}

const IncomingCallModal = ({ friend, onAccept, onDecline }: IncomingCallModalProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-2xl animate-fade-in">
    <div className="card-modern p-10 w-[400px] animate-scale-in border-gradient">
      <div className="flex flex-col items-center text-center mb-10">
        {/* Avatar with rings */}
        <div className="relative mb-6">
          {/* Animated rings */}
          <div className="absolute inset-0 rounded-full border-2 border-success/50 animate-speaking-ring" />
          <div className="absolute inset-0 rounded-full border-2 border-success/30 animate-speaking-ring" style={{ animationDelay: '0.5s' }} />
          <div className="absolute inset-0 rounded-full border-2 border-success/20 animate-speaking-ring" style={{ animationDelay: '1s' }} />
          
          {/* Avatar */}
          <img
            src={friend.avatar_url || ""}
            alt=""
            className="h-32 w-32 rounded-full bg-muted ring-4 ring-success/30 relative z-10 object-cover shadow-2xl"
          />
          
          {/* Phone icon badge */}
          <span className="absolute -top-2 -right-2 w-10 h-10 bg-success rounded-xl flex items-center justify-center z-20 shadow-lg glow-success ring-pulse">
            <Phone className="h-5 w-5 text-success-foreground" />
          </span>
        </div>
        
        <p className="text-2xl font-bold mb-2">{friend.username}</p>
        <p className="text-muted-foreground flex items-center gap-2">
          <span className="flex gap-1">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </span>
          Appel entrant
        </p>
      </div>
      
      <div className="flex gap-4">
        <Button
          onClick={onDecline}
          className="flex-1 h-14 rounded-2xl bg-destructive/90 hover:bg-destructive text-destructive-foreground font-semibold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] hover:shadow-[0_8px_30px_hsl(var(--destructive)/0.3)]"
        >
          <PhoneOff className="h-5 w-5 mr-2" />
          Refuser
        </Button>
        <Button
          onClick={onAccept}
          className="flex-1 h-14 rounded-2xl bg-success hover:bg-success/90 text-success-foreground font-semibold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] glow-success"
        >
          <Phone className="h-5 w-5 mr-2" />
          Accepter
        </Button>
      </div>
    </div>
  </div>
);

export default Index;
