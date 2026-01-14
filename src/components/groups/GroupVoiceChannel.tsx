import { useMemo, useState } from "react";
import { Volume2, Users, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useWebRTCVoice } from "@/hooks/useWebRTCVoice";
import { useWebRTCScreenShare, ScreenQuality, QUALITY_PRESETS } from "@/hooks/useWebRTCScreenShare";
import { useSimpleLatency } from "@/hooks/useConnectionLatency";
import { useAuth } from "@/contexts/AuthContext";
import VoiceUserCard from "@/components/voice/VoiceUserCard";
import VoiceControlsWithScreenShare from "@/components/voice/VoiceControlsWithScreenShare";
import ConnectionQualityIndicator from "@/components/voice/ConnectionQualityIndicator";
import MultiScreenShareView from "@/components/voice/MultiScreenShareView";
import ScreenShareQualityDialog from "@/components/voice/ScreenShareQualityDialog";
import { Group } from "@/hooks/useGroups";
import { cn } from "@/lib/utils";

interface GroupVoiceChannelProps {
  group: Group;
  onEnd: () => void;
}

const GroupVoiceChannel = ({ group, onEnd }: GroupVoiceChannelProps) => {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [qualityDialogOpen, setQualityDialogOpen] = useState(false);
  const { ping } = useSimpleLatency();

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
  } = useWebRTCVoice({
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
    localStream,
    screenSharers,
    remoteStreams,
    startScreenShare,
    stopScreenShare,
    cleanup: cleanupScreenShare,
  } = useWebRTCScreenShare({
    channelId: `group-${group.id}`,
    onError: (error) => {
      toast({
        title: "Erreur de partage",
        description: error,
        variant: "destructive",
      });
    },
  });

  // Build screens array for multi-view
  const activeScreens = useMemo(() => {
    const screens = [];
    
    if (isSharing && localStream && user && profile) {
      screens.push({
        odId: user.id,
        username: profile.username,
        stream: localStream,
        isLocal: true,
      });
    }
    
    remoteStreams.forEach((stream, odId) => {
      const sharer = screenSharers.find(s => s.odId === odId);
      screens.push({
        odId,
        username: sharer?.username || "Utilisateur",
        stream,
        isLocal: false,
      });
    });
    
    return screens;
  }, [isSharing, localStream, remoteStreams, screenSharers, user, profile]);

  const handleJoin = async () => {
    await join();
    toast({
      title: "Connecté",
      description: `Tu as rejoint l'appel de ${group.name}`,
    });
  };

  const handleLeave = async () => {
    if (isSharing) await stopScreenShare();
    await cleanupScreenShare();
    await leave();
    onEnd();
  };

  const handleToggleScreenShare = () => {
    if (isSharing) {
      stopScreenShare();
    } else {
      setQualityDialogOpen(true);
    }
  };

  const handleSelectQuality = async (quality: ScreenQuality) => {
    const preset = QUALITY_PRESETS[quality];
    const stream = await startScreenShare(quality);
    if (stream) {
      toast({
        title: "Partage d'écran",
        description: `Tu partages ton écran en ${preset.height}p ${preset.frameRate}fps`,
      });
    }
  };

  const hasActiveScreenShare = activeScreens.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-background/98 backdrop-blur-2xl flex flex-col">
      {/* Header with glassmorphism */}
      <div className={cn(
        "p-5 flex items-center justify-between shrink-0",
        "border-b border-white/[0.05]",
        "bg-gradient-to-r from-secondary/30 via-transparent to-secondary/30",
        "backdrop-blur-xl"
      )}>
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center",
              "bg-gradient-to-br from-primary/25 via-primary/15 to-transparent",
              "border border-primary/20 backdrop-blur-xl",
              "transition-all duration-500",
              "shadow-lg shadow-primary/10",
              isConnected && "shadow-xl shadow-primary/20"
            )}
          >
            <Volume2 className={cn(
              "h-7 w-7 text-primary",
              isConnected && "animate-pulse"
            )} />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">{group.name}</h2>
            <p className="text-sm text-muted-foreground/60">
              {isConnected ? "Appel en cours" : "Rejoindre l'appel"}
            </p>
          </div>
        </div>

        {isConnected && (
          <ConnectionQualityIndicator 
            quality={connectionQuality} 
            ping={ping}
            showPing={true}
          />
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Screen Share Area */}
        {hasActiveScreenShare && (
          <div className="flex-1 min-w-0 bg-black/20">
            <MultiScreenShareView 
              screens={activeScreens}
              onStopLocal={stopScreenShare}
            />
          </div>
        )}

        {/* Users Panel */}
        <div
          className={cn(
            "flex flex-col shrink-0 bg-gradient-to-b from-secondary/20 to-transparent",
            hasActiveScreenShare 
              ? "w-80 border-l border-white/[0.05]" 
              : "flex-1"
          )}
        >
          <div className="flex-1 p-5 overflow-auto">
            {isConnected ? (
              <div className="space-y-5">
                {/* Participants header */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary/20 backdrop-blur-sm border border-white/[0.03]">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">
                    {connectedUsers.length}{" "}
                    {connectedUsers.length === 1 ? "participant" : "participants"}
                  </span>
                </div>

                {/* User cards */}
                <div
                  className={cn(
                    "flex gap-4",
                    hasActiveScreenShare ? "flex-col" : "flex-wrap justify-center"
                  )}
                >
                  {connectedUsers.map((user, index) => (
                    <div
                      key={user.odId}
                      className="animate-scale-in"
                      style={{ animationDelay: `${index * 0.06}s` }}
                    >
                      <VoiceUserCard
                        username={user.username}
                        avatarUrl={user.avatarUrl}
                        isSpeaking={user.isSpeaking}
                        isMuted={user.isMuted}
                        isCurrentUser={user.odId === currentUserId}
                        audioLevel={user.odId === currentUserId ? audioLevel : 0}
                        compact={hasActiveScreenShare}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-5">
                  <div className="mx-auto w-20 h-20 rounded-3xl bg-secondary/30 flex items-center justify-center border border-white/[0.05]">
                    <Users className="h-10 w-10 text-muted-foreground/30" />
                  </div>
                  <p className="text-muted-foreground/60 text-sm">
                    Rejoins l'appel pour voir les participants
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className={cn(
        "p-8 flex justify-center shrink-0",
        "border-t border-white/[0.05]",
        "bg-gradient-to-t from-secondary/20 to-transparent"
      )}>
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

      {/* Quality Selection Dialog */}
      <ScreenShareQualityDialog
        open={qualityDialogOpen}
        onOpenChange={setQualityDialogOpen}
        onSelectQuality={handleSelectQuality}
      />
    </div>
  );
};

export default GroupVoiceChannel;
