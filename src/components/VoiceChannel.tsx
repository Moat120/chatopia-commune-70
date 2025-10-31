import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getCurrentUser } from "@/lib/localStorage";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

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
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const channelRef = useRef<any>(null);
  const { toast } = useToast();

  const ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  const createPeerConnection = (userId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Add local stream tracks to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
      console.log('Received remote track from', userId);
      const remoteAudio = new Audio();
      remoteAudio.srcObject = event.streams[0];
      remoteAudio.play();
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: {
            candidate: event.candidate,
            from: getCurrentUser().id,
            to: userId
          }
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${userId}:`, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        peersRef.current.delete(userId);
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

      // Join Supabase Realtime channel for signaling
      const channel = supabase.channel(`voice_${channelId}`, {
        config: { presence: { key: user.id } }
      });

      channelRef.current = channel;

      // Track presence
      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const users: UserPresence[] = [];
          
          Object.keys(state).forEach((key) => {
            const presences = state[key];
            presences.forEach((presence: any) => {
              users.push(presence);
            });
          });
          
          setConnectedUsers(users);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          console.log('User joined:', newPresences);
          // Create peer connection for new user
          newPresences.forEach(async (presence: any) => {
            if (presence.userId !== user.id && !peersRef.current.has(presence.userId)) {
              const pc = createPeerConnection(presence.userId);
              peersRef.current.set(presence.userId, pc);
              
              // Create and send offer
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              
              channel.send({
                type: 'broadcast',
                event: 'offer',
                payload: {
                  offer,
                  from: user.id,
                  to: presence.userId
                }
              });
            }
          });
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          console.log('User left:', leftPresences);
          leftPresences.forEach((presence: any) => {
            const pc = peersRef.current.get(presence.userId);
            if (pc) {
              pc.close();
              peersRef.current.delete(presence.userId);
            }
          });
        })
        .on('broadcast', { event: 'offer' }, async ({ payload }) => {
          if (payload.to === user.id) {
            console.log('Received offer from', payload.from);
            const pc = createPeerConnection(payload.from);
            peersRef.current.set(payload.from, pc);
            
            await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            channel.send({
              type: 'broadcast',
              event: 'answer',
              payload: {
                answer,
                from: user.id,
                to: payload.from
              }
            });
          }
        })
        .on('broadcast', { event: 'answer' }, async ({ payload }) => {
          if (payload.to === user.id) {
            console.log('Received answer from', payload.from);
            const pc = peersRef.current.get(payload.from);
            if (pc) {
              await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
            }
          }
        })
        .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
          if (payload.to === user.id) {
            console.log('Received ICE candidate from', payload.from);
            const pc = peersRef.current.get(payload.from);
            if (pc && payload.candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            }
          }
        });

      await channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            userId: user.id,
            username: user.username,
            avatar_url: user.avatar_url,
            channelId,
            joinedAt: Date.now(),
          });
          
          setIsConnected(true);
          
          toast({
            title: "Connecté au canal vocal",
            description: `Vous êtes maintenant dans ${channelName}`,
          });
        }
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

  const leaveChannel = async () => {
    // Stop all tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    // Close all peer connections
    peersRef.current.forEach(pc => pc.close());
    peersRef.current.clear();

    // Unsubscribe from channel
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
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
