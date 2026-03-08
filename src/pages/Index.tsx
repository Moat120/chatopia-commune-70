import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import UnifiedSidebar from "@/components/UnifiedSidebar";
import PrivateChatPanel from "@/components/friends/PrivateChatPanel";
import PrivateCallPanel from "@/components/friends/PrivateCallPanel";
import GroupChatPanel from "@/components/groups/GroupChatPanel";
import GroupVoiceChannel from "@/components/groups/GroupVoiceChannel";
import SearchPalette from "@/components/chat/SearchPalette";
import { Friend } from "@/hooks/useFriends";
import { Group } from "@/hooks/useGroups";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { MessageCircle, Phone, PhoneOff } from "lucide-react";
import { playNotificationSound, RingtoneManager } from "@/hooks/useSound";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { usePresence } from "@/hooks/usePresence";
import { useCallCleanup } from "@/hooks/useCallCleanup";
import { useNotifications } from "@/hooks/useNotifications";
import { useTabTitle } from "@/hooks/useTabTitle";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";

type ViewMode = "messages" | "groups";

const Index = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  usePresence();
  useCallCleanup();
  useNotifications();
  useTabTitle();

  const ringtoneRef = useRef(new RingtoneManager());

  const [viewMode, setViewMode] = useState<ViewMode>("messages");
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
  const [searchOpen, setSearchOpen] = useState(false);

  useKeyboardShortcuts({
    onEscape: useCallback(() => {
      if (incomingCall) return;
      if (selectedFriend) setSelectedFriend(null);
      else if (selectedGroup) setSelectedGroup(null);
    }, [selectedFriend, selectedGroup, incomingCall]),
    onSearch: useCallback(() => setSearchOpen(true), []),
  });

  // Incoming calls listener
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
              setIncomingCall({ friend: caller as Friend, callId: call.id });
              playNotificationSound();
              ringtoneRef.current.start();
              toast({
                title: "Appel entrant",
                description: `${caller.username} vous appelle`,
              });
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
      ringtoneRef.current.stop();
      setIncomingCall(null);
    }
  };

  const handleDeclineIncomingCall = async () => {
    if (incomingCall) {
      await supabase
        .from("private_calls")
        .update({ status: "declined", ended_at: new Date().toISOString() })
        .eq("id", incomingCall.callId);
      ringtoneRef.current.stop();
      setIncomingCall(null);
    }
  };

  const handleStartGroupCall = (group: Group) => {
    setActiveGroupCall(group);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="h-screen flex bg-background overflow-hidden">
        {/* Unified Sidebar */}
        <UnifiedSidebar
          tab={viewMode}
          onTabChange={setViewMode}
          selectedFriend={selectedFriend}
          onSelectFriend={setSelectedFriend}
          selectedGroup={selectedGroup}
          onSelectGroup={setSelectedGroup}
          onStartCall={handleStartCall}
          onStartGroupCall={handleStartGroupCall}
          onOpenSearch={() => setSearchOpen(true)}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {viewMode === "messages" && selectedFriend ? (
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

        {/* Search Palette */}
        <SearchPalette
          open={searchOpen}
          onOpenChange={setSearchOpen}
          onSelectFriend={(friend) => {
            setViewMode("messages");
            setSelectedGroup(null);
            setSelectedFriend(friend);
          }}
          onSelectGroup={(group) => {
            setViewMode("groups");
            setSelectedFriend(null);
            setSelectedGroup(group);
          }}
        />
      </div>
    </TooltipProvider>
  );
};

/* ─── Empty State ─── */
const EmptyState = ({ viewMode }: { viewMode: ViewMode }) => (
  <div className="flex-1 flex items-center justify-center h-full bg-background">
    <div className="text-center animate-reveal">
      <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-muted/10 border border-white/[0.04] flex items-center justify-center">
        <MessageCircle className="h-9 w-9 text-muted-foreground/15" />
      </div>
      <h2 className="text-xl font-semibold mb-2 text-foreground/80">
        {viewMode === "messages" ? "Messages" : "Groupes"}
      </h2>
      <p className="text-muted-foreground/40 max-w-xs text-sm">
        {viewMode === "messages"
          ? "Sélectionne un ami pour commencer une conversation"
          : "Sélectionne un groupe ou crée-en un nouveau"}
      </p>
    </div>
  </div>
);

/* ─── Incoming Call Modal ─── */
const IncomingCallModal = ({
  friend,
  onAccept,
  onDecline,
}: {
  friend: Friend;
  onAccept: () => void;
  onDecline: () => void;
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-2xl animate-fade-in">
    <div className="card-modern p-8 w-[380px] animate-scale-in">
      <div className="flex flex-col items-center text-center mb-8">
        <div className="relative mb-5">
          <div className="absolute inset-0 rounded-full border-2 border-success/50 animate-speaking-ring" />
          <div className="absolute inset-0 rounded-full border-2 border-success/30 animate-speaking-ring" style={{ animationDelay: "0.5s" }} />
          <img
            src={friend.avatar_url || ""}
            alt=""
            className="h-28 w-28 rounded-full bg-muted ring-4 ring-success/20 relative z-10 object-cover"
          />
          <span className="absolute -top-1 -right-1 w-9 h-9 bg-success rounded-xl flex items-center justify-center z-20 shadow-lg">
            <Phone className="h-4 w-4 text-success-foreground" />
          </span>
        </div>
        <p className="text-xl font-bold mb-1">{friend.username}</p>
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <span className="flex gap-1">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </span>
          Appel entrant
        </p>
      </div>
      <div className="flex gap-3">
        <Button
          onClick={onDecline}
          className="flex-1 h-12 rounded-xl bg-destructive/90 hover:bg-destructive text-destructive-foreground font-semibold"
        >
          <PhoneOff className="h-4 w-4 mr-2" />
          Refuser
        </Button>
        <Button
          onClick={onAccept}
          className="flex-1 h-12 rounded-xl bg-success hover:bg-success/90 text-success-foreground font-semibold"
        >
          <Phone className="h-4 w-4 mr-2" />
          Accepter
        </Button>
      </div>
    </div>
  </div>
);

export default Index;
