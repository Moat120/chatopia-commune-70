import { Volume2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useVoiceChannel } from "@/hooks/useVoiceChannel";
import VoiceUserCard from "./voice/VoiceUserCard";
import VoiceControls from "./voice/VoiceControls";
import ConnectionQualityIndicator from "./voice/ConnectionQualityIndicator";
import { cn } from "@/lib/utils";

interface VoiceChannelProps {
  channelId: string;
  channelName: string;
}

const VoiceChannel = ({ channelId, channelName }: VoiceChannelProps) => {
  const { toast } = useToast();

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
  } = useVoiceChannel({
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

  const currentUserData = connectedUsers.find(u => u.odId === currentUserId);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 noise">
      <div className="w-full max-w-2xl space-y-8 animate-fade-in-up">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className={cn(
            "mx-auto w-20 h-20 rounded-3xl flex items-center justify-center",
            "bg-gradient-to-br from-primary/20 to-primary/5",
            "border border-primary/20 transition-all duration-500",
            isConnected && "glow-primary"
          )}>
            <Volume2 className={cn(
              "h-10 w-10 text-primary transition-all duration-300",
              isConnected && "float"
            )} />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">{channelName}</h2>
            <p className="text-sm text-muted-foreground">
              {isConnected 
                ? "Connecté au canal vocal" 
                : "Cliquez pour rejoindre"}
            </p>
          </div>

          {/* Connection quality */}
          {isConnected && (
            <div className="flex justify-center animate-scale-in">
              <ConnectionQualityIndicator quality={connectionQuality} />
            </div>
          )}
        </div>

        {/* Connected Users */}
        {isConnected && (
          <div className="space-y-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>
                {connectedUsers.length} {connectedUsers.length === 1 ? 'participant' : 'participants'}
              </span>
            </div>
            
            <div className="flex flex-wrap justify-center gap-4">
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
        )}

        {/* Controls */}
        <div className="flex justify-center pt-4">
          <VoiceControls
            isConnected={isConnected}
            isConnecting={isConnecting}
            isMuted={isMuted}
            onJoin={handleJoin}
            onLeave={handleLeave}
            onToggleMute={toggleMute}
          />
        </div>

        {/* Info */}
        <p className="text-xs text-muted-foreground/60 text-center">
          {isConnected 
            ? "Votre avatar s'anime lorsque vous parlez" 
            : "Détection vocale automatique activée"}
        </p>
      </div>
    </div>
  );
};

export default VoiceChannel;
