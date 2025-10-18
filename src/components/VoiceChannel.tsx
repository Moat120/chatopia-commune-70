import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";

interface VoiceChannelProps {
  channelId: string;
  channelName: string;
}

const VoiceChannel = ({ channelId, channelName }: VoiceChannelProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const { toast } = useToast();
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const startVoiceConnection = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false 
      });
      
      localStreamRef.current = stream;
      setIsConnected(true);
      
      toast({
        title: "Connecté !",
        description: `Vous êtes maintenant dans ${channelName}`,
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'accéder au microphone",
        variant: "destructive",
      });
    }
  };

  const startVideo = async () => {
    if (!localStreamRef.current) {
      await startVoiceConnection();
    }

    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ 
        video: {
          width: { ideal: 2560 },
          height: { ideal: 1440 },
          frameRate: { ideal: 60 }
        } 
      });
      
      videoStream.getVideoTracks().forEach(track => {
        localStreamRef.current?.addTrack(track);
      });
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      
      setIsVideoOn(true);
      
      toast({
        title: "Caméra activée",
        description: "Votre vidéo est maintenant partagée",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'accéder à la caméra",
        variant: "destructive",
      });
    }
  };

  const stopVideo = () => {
    localStreamRef.current?.getVideoTracks().forEach(track => track.stop());
    setIsVideoOn(false);
  };

  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 2560 },
          height: { ideal: 1440 },
          frameRate: { ideal: 60 }
        },
        audio: true
      });
      
      screenStreamRef.current = screenStream;
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenStream;
      }
      
      setIsScreenSharing(true);
      
      screenStream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
      
      toast({
        title: "Partage d'écran activé",
        description: "Vous partagez maintenant votre écran en 1440p 60fps",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de partager l'écran",
        variant: "destructive",
      });
    }
  };

  const stopScreenShare = () => {
    screenStreamRef.current?.getTracks().forEach(track => track.stop());
    setIsScreenSharing(false);
    
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  };

  const disconnect = () => {
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    screenStreamRef.current?.getTracks().forEach(track => track.stop());
    setIsConnected(false);
    setIsVideoOn(false);
    setIsScreenSharing(false);
    
    toast({
      title: "Déconnecté",
      description: "Vous avez quitté le canal vocal",
    });
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
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
        
        {(isVideoOn || isScreenSharing) && (
          <div className="mb-4 relative aspect-video bg-black rounded-lg overflow-hidden">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!isConnected ? (
            <Button onClick={startVoiceConnection} className="flex-1">
              Rejoindre le canal vocal
            </Button>
          ) : (
            <>
              <Button
                onClick={toggleMute}
                variant={isMuted ? "destructive" : "secondary"}
                size="icon"
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>
              
              <Button
                onClick={isVideoOn ? stopVideo : startVideo}
                variant={isVideoOn ? "secondary" : "outline"}
                size="icon"
              >
                {isVideoOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </Button>
              
              <Button
                onClick={isScreenSharing ? stopScreenShare : startScreenShare}
                variant={isScreenSharing ? "secondary" : "outline"}
                size="icon"
              >
                <Monitor className="w-4 h-4" />
              </Button>
              
              <Button
                onClick={disconnect}
                variant="destructive"
                size="icon"
              >
                <PhoneOff className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
        
        {isConnected && (
          <div className="mt-4 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Qualité: {isScreenSharing ? "1440p 60fps (partage d'écran)" : isVideoOn ? "1440p 60fps (caméra)" : "Audio seulement"}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};

export default VoiceChannel;