import { useMemo, useState, useCallback } from "react";
import { Volume2, Users, Zap, Sparkles } from "lucide-react";
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
import { TooltipProvider } from "@/components/ui/tooltip";
import { playClickSound } from "@/hooks/useSound";

interface GroupVoiceChannelProps {
  group: Group;
  onEnd: () => void;
}

const GroupVoiceChannel = ({ group, onEnd }: GroupVoiceChannelProps) => {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [qualityDialogOpen, setQualityDialogOpen] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const { ping } = useSimpleLatency();

  const {
    isConnected,
    isConnecting,
    isMuted,
    connectedUsers,
    currentUserId,
    connectionQuality,
    audioLevel,
    userVolumes,
    setUserVolume,
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
    playClickSound();
    await join();
    toast({
      title: "Connecté",
      description: `Tu as rejoint l'appel de ${group.name}`,
    });
  };

  const handleLeave = async () => {
    playClickSound();
    setIsDeafened(false);
    if (isSharing) await stopScreenShare();
    await cleanupScreenShare();
    await leave();
    onEnd();
  };

  const handleToggleDeafen = useCallback(() => {
    playClickSound();
    setIsDeafened(prev => !prev);
    document.querySelectorAll('audio').forEach(audio => {
      if (audio.srcObject) {
        audio.muted = !isDeafened;
      }
    });
  }, [isDeafened]);

  const handleToggleScreenShare = () => {
    playClickSound();
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
    <TooltipProvider delayDuration={200}>
      <div className="fixed inset-0 z-50 flex flex-col call-bg">
        {/* Noise texture */}
        <div className="absolute inset-0 noise pointer-events-none" />

        {/* Header */}
        <div className={cn(
          "p-5 flex items-center justify-between shrink-0 relative z-10",
          "border-b border-white/[0.04]",
          "glass-solid"
        )}>
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center",
                "bg-gradient-to-br from-primary/25 via-primary/15 to-transparent",
                "border border-primary/25 backdrop-blur-xl",
                "transition-all duration-500",
                "shadow-lg",
                isConnected && "shadow-xl shadow-success/15 border-success/30"
              )}>
                <Volume2 className={cn(
                  "h-7 w-7 transition-colors duration-300",
                  isConnected ? "text-success" : "text-primary"
                )} />
              </div>
              {isConnected && (
                <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-success animate-pulse" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">{group.name}</h2>
              <p className="text-sm text-muted-foreground/50 font-medium">
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
        <div className="flex-1 flex overflow-hidden min-h-0 relative z-10">
          {/* Screen Share Area */}
          {hasActiveScreenShare && (
            <div className="flex-1 min-w-0 bg-black/30">
              <MultiScreenShareView 
                screens={activeScreens}
                onStopLocal={stopScreenShare}
              />
            </div>
          )}

          {/* Users Panel */}
          <div
            className={cn(
              "flex flex-col shrink-0 glass-subtle",
              hasActiveScreenShare 
                ? "w-80 border-l border-white/[0.04]" 
                : "flex-1"
            )}
          >
            <div className="flex-1 p-5 overflow-auto">
              {isConnected ? (
                <div className="space-y-5">
                  {/* Participants header */}
                  <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-secondary/30 backdrop-blur-xl border border-white/[0.03]">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-muted-foreground">
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
                        style={{ animationDelay: `${index * 0.08}s` }}
                      >
                        <VoiceUserCard
                          username={user.username}
                          avatarUrl={user.avatarUrl}
                          isSpeaking={user.isSpeaking}
                          isMuted={user.isMuted}
                          isCurrentUser={user.odId === currentUserId}
                          audioLevel={user.odId === currentUserId ? audioLevel : 0}
                          compact={hasActiveScreenShare}
                          volume={userVolumes[user.odId]}
                          onVolumeChange={(v) => setUserVolume(user.odId, v)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center space-y-5 animate-fade-in-up">
                    <div className="mx-auto w-24 h-24 rounded-3xl bg-secondary/30 flex items-center justify-center border border-white/[0.04]">
                      <Users className="h-12 w-12 text-muted-foreground/25" />
                    </div>
                    <p className="text-muted-foreground/50 text-sm font-medium">
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
          "p-8 flex justify-center shrink-0 relative z-10",
          "border-t border-white/[0.04]",
          "glass-solid"
        )}>
          <VoiceControlsWithScreenShare
            isConnected={isConnected}
            isConnecting={isConnecting}
            isMuted={isMuted}
            isScreenSharing={isSharing}
            isDeafened={isDeafened}
            onJoin={handleJoin}
            onLeave={handleLeave}
            onToggleMute={toggleMute}
            onToggleScreenShare={handleToggleScreenShare}
            onToggleDeafen={handleToggleDeafen}
          />
        </div>

        {/* Quality Selection Dialog */}
        <ScreenShareQualityDialog
          open={qualityDialogOpen}
          onOpenChange={setQualityDialogOpen}
          onSelectQuality={handleSelectQuality}
        />
      </div>
    </TooltipProvider>
  );
};

export default GroupVoiceChannel;
