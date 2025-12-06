import { useMemo, useState } from "react";
import { Volume2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useWebRTCVoice } from "@/hooks/useWebRTCVoice";
import { useWebRTCScreenShare, ScreenQuality, QUALITY_PRESETS } from "@/hooks/useWebRTCScreenShare";
import { getCurrentUser } from "@/lib/localStorage";
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
  const currentUser = getCurrentUser();
  const [qualityDialogOpen, setQualityDialogOpen] = useState(false);

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
    
    // Add local screen if sharing
    if (isSharing && localStream) {
      screens.push({
        odId: currentUser.id,
        username: currentUser.username,
        stream: localStream,
        isLocal: true,
      });
    }
    
    // Add remote screens
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
  }, [isSharing, localStream, remoteStreams, screenSharers, currentUser]);

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
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border/50 flex items-center justify-between shrink-0">
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
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Screen Share Area */}
        {hasActiveScreenShare && (
          <div className="flex-1 min-w-0">
            <MultiScreenShareView 
              screens={activeScreens}
              onStopLocal={stopScreenShare}
            />
          </div>
        )}

        {/* Users Panel */}
        <div
          className={cn(
            "flex flex-col shrink-0",
            hasActiveScreenShare ? "w-72 border-l border-border/50" : "flex-1"
          )}
        >
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
                    "flex flex-wrap gap-3",
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
      <div className="p-6 border-t border-border/50 flex justify-center shrink-0">
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
