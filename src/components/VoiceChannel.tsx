import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { connect, Room, LocalTrack } from "twilio-video";

interface VoiceChannelProps {
  channelId: string;
  channelName: string;
}

const VoiceChannel = ({ channelId, channelName }: VoiceChannelProps) => {
  const [room, setRoom] = useState<Room | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const { toast } = useToast();
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLDivElement>(null);

  const connectToRoom = async () => {
    try {
      const userId = localStorage.getItem('currentUser') 
        ? JSON.parse(localStorage.getItem('currentUser')!).id 
        : crypto.randomUUID();

      // Get Twilio token from edge function (no auth required)
      const response = await fetch(
        `https://wgautxbjngwjmvxyythm.supabase.co/functions/v1/twilio-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            roomName: channelId,
            userId 
          })
        }
      );

      const data = await response.json();
      if (!response.ok) {
        console.error('Token error:', data);
        throw new Error(data.error || 'Failed to get token');
      }

      // Connect to Twilio Video room
      const room = await connect(data.token, {
        name: channelId,
        audio: true,
        video: false,
        networkQuality: { local: 1, remote: 1 },
        bandwidthProfile: {
          video: {
            mode: 'collaboration',
            renderDimensions: {
              high: { height: 1440, width: 2560 },
              standard: { height: 720, width: 1280 },
              low: { height: 360, width: 640 }
            }
          }
        },
        preferredVideoCodecs: [{ codec: 'VP8', simulcast: true }],
        maxAudioBitrate: 16000,
      });

      setRoom(room);
      setIsConnected(true);

      // Handle local tracks
      room.localParticipant.tracks.forEach((publication: any) => {
        if (publication.track) {
          handleTrackPublication(publication);
        }
      });

      // Handle remote participants
      room.participants.forEach(participant => {
        participant.tracks.forEach((publication: any) => {
          if (publication.track) {
            attachTrack(publication.track);
          }
        });

        participant.on('trackSubscribed', (track: LocalTrack) => {
          attachTrack(track);
        });
      });

      room.on('participantConnected', participant => {
        console.log(`Participant "${participant.identity}" connected`);

        participant.tracks.forEach((publication: any) => {
          if (publication.track) {
            attachTrack(publication.track);
          }
        });

        participant.on('trackSubscribed', (track: LocalTrack) => {
          attachTrack(track);
        });
      });

      room.on('participantDisconnected', participant => {
        console.log(`Participant "${participant.identity}" disconnected`);
      });

      toast({
        title: "Connecté !",
        description: `Vous êtes dans ${channelName}`,
      });
    } catch (error: any) {
      console.error('Connection error:', error);
      toast({
        title: "Erreur de connexion",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleTrackPublication = (publication: any) => {
    if (publication.track.kind === 'video' && localVideoRef.current) {
      publication.track.attach(localVideoRef.current);
    }
  };

  const attachTrack = (track: any) => {
    if (track.kind === 'video' && remoteVideoRef.current) {
      const element = track.attach();
      element.style.width = '100%';
      element.style.height = 'auto';
      remoteVideoRef.current.appendChild(element);
    }
  };

  const toggleVideo = async () => {
    if (!room) return;

    try {
      if (isVideoOn) {
        room.localParticipant.videoTracks.forEach((publication: any) => {
          publication.track.stop();
          publication.unpublish();
        });
        setIsVideoOn(false);
      } else {
        const videoTrack = await (navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 2560 },
            height: { ideal: 1440 },
            frameRate: { ideal: 60 }
          }
        }) as Promise<MediaStream>);

        const tracks = videoTrack.getVideoTracks();
        if (tracks.length > 0) {
          await room.localParticipant.publishTrack(tracks[0]);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = videoTrack;
          }
        }
        setIsVideoOn(true);
      }
    } catch (error) {
      toast({
        title: "Erreur caméra",
        description: "Impossible d'activer la caméra",
        variant: "destructive",
      });
    }
  };

  const toggleScreenShare = async () => {
    if (!room) return;

    try {
      if (isScreenSharing) {
        room.localParticipant.videoTracks.forEach((publication: any) => {
          if (publication.track.name === 'screen') {
            publication.track.stop();
            publication.unpublish();
          }
        });
        setIsScreenSharing(false);
      } else {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 2560 },
            height: { ideal: 1440 },
            frameRate: { ideal: 60 }
          }
        });

        const tracks = screenStream.getVideoTracks();
        if (tracks.length > 0) {
          await room.localParticipant.publishTrack(tracks[0], { name: 'screen' });
        }
        setIsScreenSharing(true);

        tracks[0].onended = () => {
          toggleScreenShare();
        };
      }
    } catch (error) {
      toast({
        title: "Erreur partage d'écran",
        description: "Impossible de partager l'écran",
        variant: "destructive",
      });
    }
  };

  const toggleMute = () => {
    if (room) {
      room.localParticipant.audioTracks.forEach((publication: any) => {
        if (isMuted) {
          publication.track.enable();
        } else {
          publication.track.disable();
        }
      });
      setIsMuted(!isMuted);
    }
  };

  const disconnect = () => {
    if (room) {
      room.disconnect();
      setRoom(null);
      setIsConnected(false);
      setIsVideoOn(false);
      setIsScreenSharing(false);
      
      toast({
        title: "Déconnecté",
        description: "Vous avez quitté le canal vocal",
      });
    }
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return (
    <div className="p-4 space-y-4">
      <Card className="p-4 bg-card">
        <h3 className="font-semibold mb-4">Canal vocal : {channelName}</h3>
        
        <div className="space-y-4">
          {(isVideoOn || isScreenSharing) && (
            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain"
              />
            </div>
          )}

          <div ref={remoteVideoRef} className="grid grid-cols-2 gap-2">
            {/* Remote participant videos will be added here */}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {!isConnected ? (
            <Button onClick={connectToRoom} className="flex-1">
              Rejoindre le canal vocal
            </Button>
          ) : (
            <>
              <Button
                onClick={toggleMute}
                variant={isMuted ? "destructive" : "secondary"}
                size="icon"
                title={isMuted ? "Activer le micro" : "Couper le micro"}
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>
              
              <Button
                onClick={toggleVideo}
                variant={isVideoOn ? "secondary" : "outline"}
                size="icon"
                title={isVideoOn ? "Désactiver la caméra" : "Activer la caméra"}
              >
                {isVideoOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </Button>
              
              <Button
                onClick={toggleScreenShare}
                variant={isScreenSharing ? "secondary" : "outline"}
                size="icon"
                title={isScreenSharing ? "Arrêter le partage" : "Partager l'écran"}
              >
                <Monitor className="w-4 h-4" />
              </Button>
              
              <Button
                onClick={disconnect}
                variant="destructive"
                size="icon"
                title="Quitter le canal"
              >
                <PhoneOff className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
        
        {isConnected && (
          <div className="mt-4 space-y-2">
            <div className="text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                Connecté au canal vocal
              </p>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>🎤 Micro: {isMuted ? "Coupé" : "Actif"}</p>
              {isVideoOn && <p>📹 Caméra: Active (1440p 60fps)</p>}
              {isScreenSharing && <p>🖥️ Partage d'écran: Actif (1440p 60fps)</p>}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default VoiceChannel;