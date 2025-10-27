import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getCurrentUser } from "@/lib/localStorage";

interface VoiceChannelProps {
  channelId: string;
  channelName: string;
}

interface PeerConnection {
  userId: string;
  username: string;
  connection: RTCPeerConnection;
  stream?: MediaStream;
}

const VoiceChannel = ({ channelId, channelName }: VoiceChannelProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [peers, setPeers] = useState<PeerConnection[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const { toast } = useToast();

  const createPeerConnection = (userId: string, username: string): RTCPeerConnection => {
    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    };

    const pc = new RTCPeerConnection(configuration);

    // Add local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
      console.log('Received remote track from', username);
      const [remoteStream] = event.streams;
      
      setPeers(prevPeers => {
        const existingPeer = prevPeers.find(p => p.userId === userId);
        if (existingPeer) {
          return prevPeers.map(p => 
            p.userId === userId ? { ...p, stream: remoteStream } : p
          );
        }
        return [...prevPeers, { userId, username, connection: pc, stream: remoteStream }];
      });

      // Play audio
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.autoplay = true;
      audio.play().catch(e => console.error('Error playing audio:', e));
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        setPeers(prevPeers => prevPeers.filter(p => p.userId !== userId));
      }
    };

    return pc;
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
      const presence = {
        userId: user.id,
        username: user.username,
        channelId,
        joinedAt: Date.now(),
      };

      const channelKey = `voice_channel_${channelId}`;
      const currentUsers = JSON.parse(localStorage.getItem(channelKey) || '[]');
      currentUsers.push(presence);
      localStorage.setItem(channelKey, JSON.stringify(currentUsers));

      // Notify other windows
      window.dispatchEvent(new StorageEvent('storage', { 
        key: channelKey,
        newValue: JSON.stringify(currentUsers)
      }));

      setIsConnected(true);

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

    // Close all peer connections
    peers.forEach(peer => {
      peer.connection.close();
    });
    setPeers([]);

    // Remove from localStorage
    const user = getCurrentUser();
    const channelKey = `voice_channel_${channelId}`;
    const currentUsers = JSON.parse(localStorage.getItem(channelKey) || '[]');
    const updatedUsers = currentUsers.filter((u: any) => u.userId !== user.id);
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
      if (e.key === channelKey && isConnected) {
        const users = JSON.parse(e.newValue || '[]');
        const currentUser = getCurrentUser();
        
        // Update peer list (simplified - no actual P2P in this demo)
        const otherUsers = users.filter((u: any) => u.userId !== currentUser.id);
        console.log('Other users in channel:', otherUsers);
      }
    };

    window.addEventListener('storage', handleStorageChange);
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
    <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-6">
      <div className="text-center space-y-2">
        <Volume2 className="w-16 h-16 mx-auto text-primary" />
        <h3 className="text-xl font-semibold">{channelName}</h3>
        <p className="text-sm text-muted-foreground">
          {isConnected ? "Connecté au canal vocal" : "Rejoignez le canal pour commencer"}
        </p>
      </div>

      {isConnected && (
        <div className="flex flex-col items-center gap-4 w-full max-w-md">
          <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg">
            <div className={`w-3 h-3 rounded-full ${isMuted ? 'bg-destructive' : 'bg-green-500'} animate-pulse`} />
            <span className="text-sm font-medium">
              {isMuted ? 'Microphone coupé' : 'Microphone actif'}
            </span>
          </div>

          {peers.length > 0 && (
            <div className="w-full space-y-2">
              <p className="text-sm text-muted-foreground text-center">
                {peers.length} {peers.length === 1 ? 'utilisateur connecté' : 'utilisateurs connectés'}
              </p>
              <div className="space-y-2">
                {peers.map(peer => (
                  <div key={peer.userId} className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded">
                    <Volume2 className="w-4 h-4 text-primary" />
                    <span className="text-sm">{peer.username}</span>
                  </div>
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
