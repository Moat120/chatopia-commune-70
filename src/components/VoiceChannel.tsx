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
      <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
        <div className="absolute inset-0 call-bg" />
        <div className="absolute inset-0 noise pointer-events-none" />

        <div className="relative w-full max-w-3xl space-y-10 animate-reveal">
          {/* Header */}
          <div className="text-center space-y-6">
            <div className="relative inline-block">
              <div className={cn(
                "absolute -inset-8 rounded-full blur-3xl transition-all duration-700",
                isConnected ? "bg-success/20" : "bg-primary/15"
              )} />
              
              <div className={cn(
                "relative mx-auto w-28 h-28 rounded-[2rem] flex items-center justify-center",
                "bg-gradient-to-br from-primary/25 via-primary/15 to-transparent",
                "border border-primary/25 backdrop-blur-xl",
                "transition-all duration-700 ease-out",
                "shadow-xl",
                isConnected && "shadow-2xl shadow-success/20 border-success/30"
              )}>
                <Volume2 className={cn(
                  "h-14 w-14 transition-all duration-500",
                  isConnected ? "text-success" : "text-primary"
                )} />
                
                <Sparkles className="absolute top-3 right-3 w-5 h-5 text-primary/50 animate-pulse" />
                
                {isConnected && (
                  <>
                    <div className="absolute inset-0 rounded-[2rem] border-2 border-success/30 animate-speaking-ring" />
                    <div className="absolute inset-0 rounded-[2rem] border-2 border-success/20 animate-speaking-ring" style={{ animationDelay: '0.6s' }} />
                  </>
                )}
              </div>
            </div>
            
            <div className="space-y-3">
              <h2 className="text-4xl font-bold tracking-tight gradient-text-static">
                {channelName}
              </h2>
              <p className="text-muted-foreground/60 text-lg font-light">
                {isConnected 
                  ? "Vous êtes connecté au canal vocal" 
                  : "Cliquez pour rejoindre la conversation"}
              </p>
            </div>

            {isConnected && (
              <div className="flex justify-center animate-scale-in">
                <ConnectionQualityIndicator 
                  quality={connectionQuality} 
                  ping={ping}
                  showPing={true}
                />
              </div>
            )}
          </div>

          {/* Connected Users */}
          {isConnected && (
            <div className="space-y-6 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
              <div className="flex items-center justify-center">
                <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-2xl bg-secondary/30 backdrop-blur-xl border border-white/[0.04]">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-muted-foreground">
                    {connectedUsers.length} {connectedUsers.length === 1 ? 'participant' : 'participants'}
                  </span>
                </div>
              </div>
              
              <div className="flex flex-wrap justify-center gap-5">
                {connectedUsers.map((user, index) => (
                  <div 
                    key={user.odId}
                    className="animate-scale-in"
                    style={{ animationDelay: `${index * 0.1}s` }}
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
            </div>
          )}

          {/* Controls */}
          <div className="flex justify-center pt-6">
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

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/40 font-medium">
            <Zap className="h-3.5 w-3.5" />
            <span>
              {isConnected 
                ? "Votre avatar s'anime quand vous parlez" 
                : "Détection vocale automatique • Push-to-Talk disponible"}
            </span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default VoiceChannel;
