import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import FriendsSidebar from "@/components/friends/FriendsSidebar";
import PrivateChatPanel from "@/components/friends/PrivateChatPanel";
import PrivateCallPanel from "@/components/friends/PrivateCallPanel";
import { Friend } from "@/hooks/useFriends";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle } from "lucide-react";

const Index = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [activeCall, setActiveCall] = useState<{
    friend: Friend;
    isIncoming: boolean;
    callId?: string;
  } | null>(null);
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

  return (
    <div className="h-screen flex bg-background noise">
      {/* Friends Sidebar */}
      <FriendsSidebar
        selectedFriend={selectedFriend}
        onSelectFriend={setSelectedFriend}
        onStartCall={handleStartCall}
      />

      {/* Main Content */}
      {selectedFriend ? (
        <PrivateChatPanel
          friend={selectedFriend}
          onClose={() => setSelectedFriend(null)}
          onStartCall={() => handleStartCall(selectedFriend)}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <MessageCircle className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <h2 className="text-xl font-semibold mb-2">Bienvenue !</h2>
            <p className="text-sm">
              Sélectionne un ami pour commencer une conversation
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
