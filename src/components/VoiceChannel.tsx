import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getCurrentUser } from "@/lib/localStorage";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";

interface VoiceChannelProps {
  channelId: string;
  channelName: string;
}

interface UserPresence {
  userId: string;
  username: string;
  avatar_url?: string;
  channelId: string;
  joinedAt: number;
  isSpeaking?: boolean;
}

const VoiceChannel = ({ channelId, channelName }: VoiceChannelProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState<UserPresence[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const { toast } = useToast();

  const updateConnectedUsers = () => {
    const channelKey = `voice_channel_${channelId}`;
    const users = JSON.parse(localStorage.getItem(channelKey) || '[]');
    setConnectedUsers(users);
  };

  const joinChannel = async () => {
    try {
      const user = getCurrentUser();
      
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      localStreamRef.current = stream;
      audioContextRef.current = new AudioContext();

      // Store presence in localStorage
      const presence: UserPresence = {
        userId: user.id,
        username: user.username,
        avatar_url: user.avatar_url,
        channelId,
        joinedAt: Date.now(),
      };

      const channelKey = `voice_channel_${channelId}`;
      const currentUsers = JSON.parse(localStorage.getItem(channelKey) || '[]');
      
      // Remove any existing entry for this user
      const filteredUsers = currentUsers.filter((u: UserPresence) => u.userId !== user.id);
      filteredUsers.push(presence);
      
      localStorage.setItem(channelKey, JSON.stringify(filteredUsers));

      // Notify other windows
      window.dispatchEvent(new StorageEvent('storage', { 
        key: channelKey,
        newValue: JSON.stringify(filteredUsers)
      }));

      setIsConnected(true);
      updateConnectedUsers();

      toast({
        title: "Connecté au canal vocal",
        description: `Vous êtes maintenant dans ${channelName}`,
      });

    } catch (error) {
      console.error('Error joining channel:', error);
      toast({
        title: "Erreur",
        description: "Impossible d'accéder au microphone",
        variant: "destructive",
      });
    }
  };

  const leaveChannel = () => {
    // Stop all tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    // Remove from localStorage
    const user = getCurrentUser();
    const channelKey = `voice_channel_${channelId}`;
    const currentUsers = JSON.parse(localStorage.getItem(channelKey) || '[]');
    const updatedUsers = currentUsers.filter((u: UserPresence) => u.userId !== user.id);
    localStorage.setItem(channelKey, JSON.stringify(updatedUsers));

    // Notify other windows
    window.dispatchEvent(new StorageEvent('storage', { 
      key: channelKey,
      newValue: JSON.stringify(updatedUsers)
    }));

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsConnected(false);
    setIsMuted(false);
    setConnectedUsers([]);

    toast({
      title: "Déconnecté",
      description: "Vous avez quitté le canal vocal",
    });
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Listen for other users joining/leaving
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      const channelKey = `voice_channel_${channelId}`;
      if (e.key === channelKey) {
        updateConnectedUsers();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Initial load
    if (isConnected) {
      updateConnectedUsers();
    }
    
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [channelId, isConnected]);

  useEffect(() => {
    return () => {
      if (isConnected) {
        leaveChannel();
      }
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col p-8 space-y-6">
      <div className="text-center space-y-2">
        <Volume2 className="w-16 h-16 mx-auto text-primary" />
        <h3 className="text-xl font-semibold">{channelName}</h3>
        <p className="text-sm text-muted-foreground">
          {isConnected ? "Connecté au canal vocal" : "Rejoignez le canal pour commencer"}
        </p>
      </div>

      {isConnected && (
        <div className="flex flex-col items-center gap-6 w-full max-w-4xl mx-auto">
          <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg">
            <div className={`w-3 h-3 rounded-full ${isMuted ? 'bg-destructive' : 'bg-green-500'} animate-pulse`} />
            <span className="text-sm font-medium">
              {isMuted ? 'Microphone coupé' : 'Microphone actif'}
            </span>
          </div>

          {connectedUsers.length > 0 && (
            <div className="w-full space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                {connectedUsers.length} {connectedUsers.length === 1 ? 'utilisateur' : 'utilisateurs'} dans le canal
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {connectedUsers.map(user => (
                  <Card key={user.userId} className="p-4 flex flex-col items-center gap-3 hover:bg-accent/50 transition-colors">
                    <div className="relative">
                      <Avatar className="w-20 h-20 border-2 border-primary">
                        <AvatarImage src={user.avatar_url} />
                        <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                          {user.username.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-background ${
                        user.userId === getCurrentUser().id && !isMuted ? 'bg-green-500 animate-pulse' : 'bg-green-500'
                      }`} />
                    </div>
                    <div className="text-center w-full">
                      <p className="text-sm font-medium truncate">{user.username}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.userId === getCurrentUser().id ? '(Vous)' : ''}
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-4">
        {!isConnected ? (
          <Button
            onClick={joinChannel}
            size="lg"
            className="gap-2"
          >
            <Volume2 className="w-5 h-5" />
            Rejoindre le canal
          </Button>
        ) : (
          <>
            <Button
              onClick={toggleMute}
              variant={isMuted ? "destructive" : "secondary"}
              size="lg"
              className="gap-2"
            >
              {isMuted ? (
                <>
                  <MicOff className="w-5 h-5" />
                  Réactiver le micro
                </>
              ) : (
                <>
                  <Mic className="w-5 h-5" />
                  Couper le micro
                </>
              )}
            </Button>

            <Button
              onClick={leaveChannel}
              variant="destructive"
              size="lg"
              className="gap-2"
            >
              <PhoneOff className="w-5 h-5" />
              Quitter
            </Button>
          </>
        )}
      </div>

      <div className="text-xs text-muted-foreground text-center max-w-md">
        Audio vocal simplifié avec WebRTC natif
      </div>
    </div>
  );
};

export default VoiceChannel;
