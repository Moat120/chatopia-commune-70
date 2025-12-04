import { useState, useEffect } from "react";
import { Volume2, Users, Monitor } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useVoiceChannel } from "@/hooks/useVoiceChannel";
import { useScreenShare } from "@/hooks/useScreenShare";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUser } from "@/lib/localStorage";
import VoiceUserCard from "@/components/voice/VoiceUserCard";
import VoiceControlsWithScreenShare from "@/components/voice/VoiceControlsWithScreenShare";
import ConnectionQualityIndicator from "@/components/voice/ConnectionQualityIndicator";
import ScreenShareView from "@/components/voice/ScreenShareView";
import { Group } from "@/hooks/useGroups";
import { cn } from "@/lib/utils";

interface GroupVoiceChannelProps {
  group: Group;
  onEnd: () => void;
}

interface ScreenShareInfo {
  odId: string;
  username: string;
  isSharing: boolean;
}

const GroupVoiceChannel = ({ group, onEnd }: GroupVoiceChannelProps) => {
  const { toast } = useToast();
  const currentUser = getCurrentUser();
  const [screenSharers, setScreenSharers] = useState<ScreenShareInfo[]>([]);

  const {
    isConnected,
    isConnecting,
    isMuted,
    connectedUsers,
    currentUserId,
    connectionQuality,
    audioLevel,
    join,
    leave,
    toggleMute,
  } = useVoiceChannel({
    channelId: `group-${group.id}`,
    onError: (error) => {
      toast({
        title: "Erreur",
        description: error,
        variant: "destructive",
      });
    },
  });

  const {
    isSharing,
    stream: localScreenStream,
    startScreenShare,
    stopScreenShare,
  } = useScreenShare({
    onError: (error) => {
      toast({
        title: "Erreur de partage",
        description: error,
        variant: "destructive",
      });
    },
  });

  // Broadcast screen share status
  useEffect(() => {
    if (!isConnected) return;

    const channel = supabase.channel(`screen-share-${group.id}`, {
      config: { presence: { key: currentUser.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const sharers: ScreenShareInfo[] = [];

        Object.values(state).forEach((presences: any[]) => {
          presences.forEach((presence) => {
            if (presence.isSharing) {
              sharers.push({
                odId: presence.odId,
                username: presence.username,
                isSharing: true,
              });
            }
          });
        });

        setScreenSharers(sharers);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            odId: currentUser.id,
            username: currentUser.username,
            isSharing: isSharing,
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isConnected, group.id, currentUser, isSharing]);

  // Update screen share presence
  useEffect(() => {
    const channel = supabase.channel(`screen-share-${group.id}`);
    if (isConnected) {
      channel.track({
        odId: currentUser.id,
        username: currentUser.username,
        isSharing: isSharing,
      });
    }
  }, [isSharing, isConnected, group.id, currentUser]);

  const handleJoin = async () => {
    await join();
    toast({
      title: "Connecté",
      description: `Tu as rejoint l'appel de ${group.name}`,
    });
  };

  const handleLeave = async () => {
    if (isSharing) stopScreenShare();
    await leave();
    onEnd();
  };

  const handleToggleScreenShare = async () => {
    if (isSharing) {
      stopScreenShare();
    } else {
      const stream = await startScreenShare();
      if (stream) {
        toast({
          title: "Partage d'écran",
          description: "Tu partages ton écran en 1080p 60fps",
        });
      }
    }
  };

  const hasActiveScreenShare = screenSharers.length > 0 || isSharing;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center",
              "bg-gradient-to-br from-primary/20 to-primary/5",
              "border border-primary/20",
              isConnected && "glow-primary"
            )}
          >
            <Volume2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold">{group.name}</h2>
            <p className="text-sm text-muted-foreground">
              {isConnected ? "Appel en cours" : "Rejoindre l'appel"}
            </p>
          </div>
        </div>

        {isConnected && <ConnectionQualityIndicator quality={connectionQuality} />}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Screen Share Area */}
        {hasActiveScreenShare && (
          <div className="flex-1 p-4">
            {isSharing ? (
              <ScreenShareView
                stream={localScreenStream}
                username={currentUser.username}
                isLocal
                onStop={stopScreenShare}
              />
            ) : screenSharers.length > 0 ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center space-y-4">
                  <Monitor className="h-16 w-16 mx-auto text-primary" />
                  <p className="text-lg font-medium">
                    {screenSharers[0].username} partage son écran
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Le partage d'écran P2P sera bientôt disponible
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Users Panel */}
        <div
          className={cn(
            "flex flex-col",
            hasActiveScreenShare ? "w-80 border-l border-border/50" : "flex-1"
          )}
        >
          {/* Connected Users */}
          <div className="flex-1 p-4 overflow-auto">
            {isConnected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>
                    {connectedUsers.length}{" "}
                    {connectedUsers.length === 1 ? "participant" : "participants"}
                  </span>
                </div>

                <div
                  className={cn(
                    "flex flex-wrap gap-4",
                    hasActiveScreenShare ? "flex-col" : "justify-center"
                  )}
                >
                  {connectedUsers.map((user, index) => (
                    <div
                      key={user.odId}
                      className="animate-scale-in"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      <VoiceUserCard
                        username={user.username}
                        avatarUrl={user.avatarUrl}
                        isSpeaking={user.isSpeaking}
                        isMuted={user.isMuted}
                        isCurrentUser={user.odId === currentUserId}
                        audioLevel={user.odId === currentUserId ? audioLevel : 0}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-4">
                  <Users className="h-16 w-16 mx-auto text-muted-foreground/20" />
                  <p className="text-muted-foreground">
                    Rejoins l'appel pour voir les participants
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="p-6 border-t border-border/50 flex justify-center">
        <VoiceControlsWithScreenShare
          isConnected={isConnected}
          isConnecting={isConnecting}
          isMuted={isMuted}
          isScreenSharing={isSharing}
          onJoin={handleJoin}
          onLeave={handleLeave}
          onToggleMute={toggleMute}
          onToggleScreenShare={handleToggleScreenShare}
        />
      </div>
    </div>
  );
};

export default GroupVoiceChannel;
