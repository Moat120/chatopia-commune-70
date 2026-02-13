import { useState, useCallback } from "react";
import { Volume2, Users, Zap, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useWebRTCVoice } from "@/hooks/useWebRTCVoice";
import { useSimpleLatency } from "@/hooks/useConnectionLatency";
import VoiceUserCard from "@/components/voice/VoiceUserCard";
import VoiceControls from "@/components/voice/VoiceControls";
import ConnectionQualityIndicator from "@/components/voice/ConnectionQualityIndicator";
import { TooltipProvider } from "@/components/ui/tooltip";

interface VoiceChannelProps {
  channelId: string;
  channelName: string;
}

const VoiceChannel = ({ channelId, channelName }: VoiceChannelProps) => {
  const { toast } = useToast();
  const { ping } = useSimpleLatency();
  const [isDeafened, setIsDeafened] = useState(false);

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
    toggleMute
  } = useWebRTCVoice({
    channelId,
    onError: (error) => {
      toast({
        title: "Erreur",
        description: error,
        variant: "destructive",
      });
    }
  });

  const handleJoin = async () => {
    await join();
    toast({
      title: "Connecté",
      description: `Vous avez rejoint ${channelName}`,
    });
  };

  const handleLeave = async () => {
    setIsDeafened(false);
    await leave();
    toast({
      title: "Déconnecté",
      description: "Vous avez quitté le canal vocal",
    });
  };

  const handleToggleDeafen = useCallback(() => {
    setIsDeafened(prev => !prev);
    document.querySelectorAll('audio').forEach(audio => {
      if (audio.srcObject) {
        audio.muted = !isDeafened;
      }
    });
  }, [isDeafened]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
        <div className="absolute inset-0 call-bg" />
        <div className="absolute inset-0 noise pointer-events-none" />

        {/* Header Bar */}
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
              <Volume2 className={cn(
                "h-5 w-5",
                isConnected ? "text-success" : "text-primary"
              )} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">{channelName}</h2>
              <p className="text-xs text-muted-foreground/50">
                {isConnected 
                  ? `${connectedUsers.length} connecté${connectedUsers.length > 1 ? 's' : ''}`
                  : "Canal vocal"}
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

        {/* Participants Area */}
        <div className="flex-1 min-h-0 overflow-y-auto relative z-10 p-6">
          {isConnected ? (
            <div className="flex flex-wrap justify-center gap-5 content-center min-h-full">
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
                    volume={userVolumes[user.odId]}
                    onVolumeChange={(v) => setUserVolume(user.odId, v)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-5 animate-reveal">
                <div className={cn(
                  "mx-auto w-24 h-24 rounded-3xl flex items-center justify-center",
                  "bg-gradient-to-br from-primary/20 to-transparent",
                  "border border-primary/20"
                )}>
                  <Volume2 className="h-12 w-12 text-primary/40" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold gradient-text-static">{channelName}</h3>
                  <p className="text-sm text-muted-foreground/50">
                    Cliquez pour rejoindre la conversation
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Controls Bar */}
        <div className={cn(
          "shrink-0 px-6 py-5 flex justify-center relative z-10",
          "border-t border-white/[0.04] glass-solid"
        )}>
          <VoiceControls
            isConnected={isConnected}
            isConnecting={isConnecting}
            isMuted={isMuted}
            isDeafened={isDeafened}
            onJoin={handleJoin}
            onLeave={handleLeave}
            onToggleMute={toggleMute}
            onToggleDeafen={handleToggleDeafen}
          />
        </div>
      </div>
    </TooltipProvider>
  );
};

export default VoiceChannel;
