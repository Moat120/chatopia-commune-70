import { Volume2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useVoiceChannel } from "@/hooks/useVoiceChannel";
import VoiceUserCard from "./voice/VoiceUserCard";
import VoiceControls from "./voice/VoiceControls";

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

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Volume2 className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{channelName}</h2>
          <p className="text-sm text-muted-foreground">
            {isConnected 
              ? "Vous êtes connecté au canal vocal" 
              : "Cliquez pour rejoindre le canal"}
          </p>
        </div>
      </div>

      {/* Connected Users */}
      {isConnected && (
        <div className="w-full max-w-2xl space-y-4">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>
              {connectedUsers.length} {connectedUsers.length === 1 ? 'participant' : 'participants'}
            </span>
          </div>
          
          <div className="flex flex-wrap justify-center gap-4">
            {connectedUsers.map((user) => (
              <VoiceUserCard
                key={user.odId}
                username={user.username}
                avatarUrl={user.avatarUrl}
                isSpeaking={user.isSpeaking}
                isMuted={user.isMuted}
                isCurrentUser={user.odId === currentUserId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <VoiceControls
        isConnected={isConnected}
        isConnecting={isConnecting}
        isMuted={isMuted}
        onJoin={handleJoin}
        onLeave={handleLeave}
        onToggleMute={toggleMute}
      />

      {/* Info */}
      <p className="text-xs text-muted-foreground text-center max-w-sm">
        {isConnected 
          ? "Votre avatar s'illumine en vert lorsque vous parlez" 
          : "Le canal utilise la détection vocale automatique"}
      </p>
    </div>
  );
};

export default VoiceChannel;
