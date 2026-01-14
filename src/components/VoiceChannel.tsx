import { Volume2, Users, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useWebRTCVoice } from "@/hooks/useWebRTCVoice";
import { useSimpleLatency } from "@/hooks/useConnectionLatency";
import VoiceUserCard from "@/components/voice/VoiceUserCard";
import VoiceControls from "@/components/voice/VoiceControls";
import ConnectionQualityIndicator from "@/components/voice/ConnectionQualityIndicator";

interface VoiceChannelProps {
  channelId: string;
  channelName: string;
}

const VoiceChannel = ({ channelId, channelName }: VoiceChannelProps) => {
  const { toast } = useToast();
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
    await leave();
    toast({
      title: "Déconnecté",
      description: "Vous avez quitté le canal vocal",
    });
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.02] via-transparent to-transparent pointer-events-none" />
      
      {/* Mesh pattern overlay */}
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 50%, hsl(var(--primary) / 0.03) 0%, transparent 50%)`,
          }}
        />
      </div>

      <div className="relative w-full max-w-3xl space-y-10 animate-fade-in-up">
        {/* Header */}
        <div className="text-center space-y-6">
          {/* Icon with glow */}
          <div className={cn(
            "mx-auto w-24 h-24 rounded-[2rem] flex items-center justify-center",
            "bg-gradient-to-br from-primary/20 via-primary/10 to-transparent",
            "border border-primary/20 backdrop-blur-xl",
            "transition-all duration-700 ease-out",
            "shadow-xl shadow-primary/10",
            isConnected && "shadow-2xl shadow-primary/20 scale-105"
          )}>
            <Volume2 className={cn(
              "h-12 w-12 text-primary transition-all duration-500",
              isConnected && "animate-pulse"
            )} />
            
            {/* Decorative rings */}
            {isConnected && (
              <>
                <div className="absolute inset-0 rounded-[2rem] border border-primary/10 animate-ping opacity-30" />
                <div className="absolute inset-2 rounded-[1.5rem] border border-primary/5 animate-ping opacity-20" style={{ animationDelay: '0.5s' }} />
              </>
            )}
          </div>
          
          <div className="space-y-3">
            <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              {channelName}
            </h2>
            <p className="text-sm text-muted-foreground/70">
              {isConnected 
                ? "Vous êtes connecté au canal vocal" 
                : "Cliquez pour rejoindre la conversation"}
            </p>
          </div>

          {/* Connection quality & ping */}
          {isConnected && (
            <div className="flex justify-center gap-4 animate-scale-in">
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
            {/* Participants count */}
            <div className="flex items-center justify-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/30 backdrop-blur-xl border border-white/[0.05]">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  {connectedUsers.length} {connectedUsers.length === 1 ? 'participant' : 'participants'}
                </span>
              </div>
            </div>
            
            {/* User cards grid */}
            <div className="flex flex-wrap justify-center gap-4">
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
            onJoin={handleJoin}
            onLeave={handleLeave}
            onToggleMute={toggleMute}
          />
        </div>

        {/* Info text */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/40">
          <Zap className="h-3 w-3" />
          <span>
            {isConnected 
              ? "Votre avatar s'anime quand vous parlez" 
              : "Détection vocale automatique • Push-to-Talk disponible"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default VoiceChannel;
