import { useMemo, useState, useCallback } from "react";
import { Volume2, Users, Sparkles, MicOff } from "lucide-react";
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
import { useVoicePresence } from "@/hooks/useVoicePresence";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
    noiseEngine,
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

  // Observe participants when not connected
  const { participants: presenceParticipants } = useVoicePresence(isConnected ? null : group.id);

  const effectiveConnectedUsers = useMemo(() => {
    if (connectedUsers.length > 0) return connectedUsers;
    if (isConnected && user && profile) {
      return [{
        odId: user.id,
        username: profile.username,
        avatarUrl: profile.avatar_url || undefined,
        isSpeaking: false,
        isMuted,
      }];
    }
    return connectedUsers;
  }, [connectedUsers, isConnected, user, profile, isMuted]);

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
      <div className="fixed inset-0 z-50 flex flex-col call-bg animate-fade-in">
        <div className="absolute inset-0 noise pointer-events-none" />

        {/* Header */}
        <div className={cn(
          "shrink-0 px-5 py-3.5 flex items-center justify-between relative z-10",
          "border-b border-white/[0.04] glass-solid"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center",
              "bg-gradient-to-br from-primary/20 to-transparent",
              "border border-primary/20 transition-all duration-500",
              isConnected && "border-success/25 from-success/15"
            )}>
              <Volume2 className={cn("h-4 w-4 transition-colors duration-500", isConnected ? "text-success" : "text-primary/80")} />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">{group.name}</h2>
              <p className="text-[11px] text-muted-foreground/40 flex items-center gap-1.5">
                {isConnected 
                  ? `${effectiveConnectedUsers.length} participant${effectiveConnectedUsers.length > 1 ? 's' : ''}` 
                  : presenceParticipants.length > 0 
                    ? `${presenceParticipants.length} en vocal`
                    : "Aucun participant"}
                {isConnected && noiseEngine && (
                  <span className="text-[10px] text-success/50 flex items-center gap-1">
                    <Sparkles className="h-2.5 w-2.5" />
                    {noiseEngine}
                  </span>
                )}
              </p>
            </div>
          </div>

          {isConnected && (
            <ConnectionQualityIndicator quality={connectionQuality} ping={ping} showPing={true} />
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden min-h-0 relative z-10">
          {hasActiveScreenShare && (
            <div className="flex-1 min-w-0 bg-black/20">
              <MultiScreenShareView screens={activeScreens} onStopLocal={stopScreenShare} />
            </div>
          )}

          {/* Users Panel */}
          <div className={cn(
            "flex flex-col shrink-0",
            hasActiveScreenShare ? "w-72 border-l border-white/[0.04] glass-subtle" : "flex-1"
          )}>
            <div className="flex-1 p-4 overflow-y-auto min-h-0">
              {isConnected ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/20 border border-white/[0.03]">
                    <Users className="h-3.5 w-3.5 text-muted-foreground/50" />
                    <span className="text-xs font-medium text-muted-foreground/50">
                      {effectiveConnectedUsers.length} connecté{effectiveConnectedUsers.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className={cn("flex gap-3", hasActiveScreenShare ? "flex-col" : "flex-wrap justify-center")}>
                    {effectiveConnectedUsers.map((user, index) => (
                      <div key={user.odId} className="animate-scale-in" style={{ animationDelay: `${index * 0.06}s` }}>
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
                <div className="h-full flex flex-col">
                  {presenceParticipants.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/20 border border-white/[0.03]">
                        <Users className="h-3.5 w-3.5 text-muted-foreground/50" />
                        <span className="text-xs font-medium text-muted-foreground/50">
                          {presenceParticipants.length} en vocal
                        </span>
                      </div>
                      <div className="flex flex-wrap justify-center gap-3">
                        {presenceParticipants.map((p, index) => (
                          <div key={p.odId} className="animate-scale-in flex flex-col items-center gap-2 p-3 rounded-xl bg-secondary/15 border border-white/[0.03]" style={{ animationDelay: `${index * 0.06}s` }}>
                            <div className="relative">
                              <Avatar className={cn("h-12 w-12 ring-2 transition-all duration-300", p.isSpeaking ? "ring-success/40" : "ring-transparent")}>
                                <AvatarImage src={p.avatarUrl || ""} className="object-cover" />
                                <AvatarFallback className="bg-primary/10 text-primary font-bold text-base">
                                  {p.username[0]?.toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              {p.isMuted && (
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-destructive/80 flex items-center justify-center border-2 border-background">
                                  <MicOff className="h-2 w-2 text-white" />
                                </div>
                              )}
                            </div>
                            <span className="text-[11px] font-medium text-muted-foreground/60">{p.username}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center space-y-3 animate-reveal">
                        <div className="mx-auto w-16 h-16 rounded-2xl bg-secondary/20 flex items-center justify-center border border-white/[0.03]">
                          <Users className="h-8 w-8 text-muted-foreground/15" />
                        </div>
                        <div>
                          <p className="text-muted-foreground/40 text-sm font-medium">Personne n'est en vocal</p>
                          <p className="text-muted-foreground/25 text-xs mt-0.5">Rejoins pour démarrer</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Controls Bar */}
        <div className={cn(
          "shrink-0 px-6 py-4 flex justify-center relative z-10",
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
