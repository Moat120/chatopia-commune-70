import { useMemo, useState, useCallback } from "react";
import { Volume2, Users, Sparkles } from "lucide-react";
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
      toast({ title: "Erreur", description: error, variant: "destructive" });
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
      toast({ title: "Erreur de partage", description: error, variant: "destructive" });
    },
  });

  const activeScreens = useMemo(() => {
    const screens = [];
    if (isSharing && localStream && user && profile) {
      screens.push({ odId: user.id, username: profile.username, stream: localStream, isLocal: true });
    }
    remoteStreams.forEach((stream, odId) => {
      const sharer = screenSharers.find(s => s.odId === odId);
      screens.push({ odId, username: sharer?.username || "Utilisateur", stream, isLocal: false });
    });
    return screens;
  }, [isSharing, localStream, remoteStreams, screenSharers, user, profile]);

  const handleJoin = async () => {
    await join();
    toast({ title: "Connecté", description: `Tu as rejoint l'appel de ${group.name}` });
  };

  const handleLeave = async () => {
    setIsDeafened(false);
    if (isSharing) await stopScreenShare();
    await cleanupScreenShare();
    await leave();
    onEnd();
  };

  const handleToggleDeafen = useCallback(() => {
    setIsDeafened(prev => !prev);
    document.querySelectorAll('audio').forEach(audio => {
      if (audio.srcObject) { audio.muted = !isDeafened; }
    });
  }, [isDeafened]);

  const handleToggleScreenShare = () => {
    if (isSharing) { stopScreenShare(); } else { setQualityDialogOpen(true); }
  };

  const handleSelectQuality = async (quality: ScreenQuality) => {
    const preset = QUALITY_PRESETS[quality];
    const stream = await startScreenShare(quality);
    if (stream) {
      toast({ title: "Partage d'écran", description: `Tu partages ton écran en ${preset.height}p ${preset.frameRate}fps` });
    }
  };

  const hasActiveScreenShare = activeScreens.length > 0;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="fixed inset-0 z-50 flex flex-col call-bg">
        <div className="absolute inset-0 noise pointer-events-none" />

        {/* Header */}
        <div className={cn(
          "shrink-0 px-5 py-4 flex items-center justify-between relative z-10",
          "border-b border-white/[0.04] glass-solid"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              "bg-gradient-to-br from-primary/25 to-transparent",
              "border border-primary/25",
              isConnected && "border-success/30"
            )}>
              <Volume2 className={cn("h-5 w-5", isConnected ? "text-success" : "text-primary")} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">{group.name}</h2>
              <p className="text-xs text-muted-foreground/50">
                {isConnected ? `${connectedUsers.length} participant${connectedUsers.length > 1 ? 's' : ''}` : "Rejoindre l'appel"}
              </p>
            </div>
          </div>

          {isConnected && (
            <ConnectionQualityIndicator quality={connectionQuality} ping={ping} showPing={true} />
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden min-h-0 relative z-10">
          {/* Screen Share Area */}
          {hasActiveScreenShare && (
            <div className="flex-1 min-w-0 bg-black/30">
              <MultiScreenShareView screens={activeScreens} onStopLocal={stopScreenShare} />
            </div>
          )}

          {/* Users Panel */}
          <div className={cn(
            "flex flex-col shrink-0",
            hasActiveScreenShare ? "w-80 border-l border-white/[0.04] glass-subtle" : "flex-1"
          )}>
            <div className="flex-1 p-5 overflow-y-auto min-h-0">
              {isConnected ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary/30 border border-white/[0.03]">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-muted-foreground">
                      {connectedUsers.length} {connectedUsers.length === 1 ? "participant" : "participants"}
                    </span>
                  </div>
                  <div className={cn("flex gap-4", hasActiveScreenShare ? "flex-col" : "flex-wrap justify-center")}>
                    {connectedUsers.map((user, index) => (
                      <div key={user.odId} className="animate-scale-in" style={{ animationDelay: `${index * 0.08}s` }}>
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
                  <div className="text-center space-y-4 animate-fade-in-up">
                    <div className="mx-auto w-20 h-20 rounded-2xl bg-secondary/30 flex items-center justify-center border border-white/[0.04]">
                      <Users className="h-10 w-10 text-muted-foreground/25" />
                    </div>
                    <p className="text-muted-foreground/50 text-sm">Rejoins l'appel pour voir les participants</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Controls Bar */}
        <div className={cn(
          "shrink-0 px-6 py-5 flex justify-center relative z-10",
          "border-t border-white/[0.04] glass-solid"
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

        <ScreenShareQualityDialog open={qualityDialogOpen} onOpenChange={setQualityDialogOpen} onSelectQuality={handleSelectQuality} />
      </div>
    </TooltipProvider>
  );
};

export default GroupVoiceChannel;
