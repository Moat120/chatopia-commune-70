import { useState, useEffect, useRef } from "react";
import { Friend } from "@/hooks/useFriends";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useScreenShare } from "@/hooks/useScreenShare";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Mic, MicOff, Loader2, Monitor, MonitorOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import ScreenShareView from "@/components/voice/ScreenShareView";

interface PrivateCallPanelProps {
  friend: Friend;
  onEnd: () => void;
  isIncoming?: boolean;
  callId?: string;
}

const PrivateCallPanel = ({
  friend,
  onEnd,
  isIncoming = false,
  callId: initialCallId,
}: PrivateCallPanelProps) => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [callStatus, setCallStatus] = useState<
    "ringing" | "connecting" | "active" | "ended"
  >(isIncoming ? "ringing" : "connecting");
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [callId, setCallId] = useState(initialCallId);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const durationInterval = useRef<NodeJS.Timeout | null>(null);

  const {
    isSharing,
    stream: screenStream,
    startScreenShare,
    stopScreenShare,
  } = useScreenShare({
    onError: (error) => {
      toast({
        title: "Erreur de partage",
        description: error,
        variant: "destructive",
      });
    },
  });

  // Start outgoing call
  useEffect(() => {
    if (!isIncoming && user && !callId) {
      const startCall = async () => {
        const { data, error } = await supabase
          .from("private_calls")
          .insert({
            caller_id: user.id,
            callee_id: friend.id,
            status: "ringing",
          })
          .select()
          .single();

        if (error) {
          toast({ title: "Erreur", description: "Impossible de démarrer l'appel", variant: "destructive" });
          onEnd();
          return;
        }

        setCallId(data.id);
      };

      startCall();
    }
  }, [isIncoming, user, friend.id, callId]);

  // Subscribe to call status changes
  useEffect(() => {
    if (!callId) return;

    const channel = supabase
      .channel(`call-${callId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "private_calls",
          filter: `id=eq.${callId}`,
        },
        (payload) => {
          const newStatus = payload.new.status as string;
          if (newStatus === "active") {
            setCallStatus("active");
            startAudio();
          } else if (newStatus === "ended" || newStatus === "declined" || newStatus === "missed") {
            setCallStatus("ended");
            cleanup();
            setTimeout(onEnd, 1000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [callId]);

  // Duration timer
  useEffect(() => {
    if (callStatus === "active") {
      durationInterval.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    }

    return () => {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    };
  }, [callStatus]);

  const startAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;

      const detectVoice = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setIsSpeaking(average > 30);
        if (callStatus === "active") {
          requestAnimationFrame(detectVoice);
        }
      };
      detectVoice();
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  };

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (isSharing) {
      stopScreenShare();
    }
  };

  const acceptCall = async () => {
    if (!callId) return;
    setCallStatus("connecting");
    
    await supabase
      .from("private_calls")
      .update({ status: "active", started_at: new Date().toISOString() })
      .eq("id", callId);
  };

  const declineCall = async () => {
    if (!callId) return;
    
    await supabase
      .from("private_calls")
      .update({ status: "declined", ended_at: new Date().toISOString() })
      .eq("id", callId);
    
    cleanup();
    onEnd();
  };

  const endCall = async () => {
    if (!callId) return;

    await supabase
      .from("private_calls")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", callId);

    cleanup();
    onEnd();
  };

  const toggleMute = () => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const handleToggleScreenShare = async () => {
    if (isSharing) {
      stopScreenShare();
    } else {
      const stream = await startScreenShare();
      if (stream) {
        toast({
          title: "Partage d'écran",
          description: "Tu partages ton écran en 1080p 60fps",
        });
      }
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex">
      {/* Screen Share Area */}
      {isSharing && screenStream && (
        <div className="flex-1 p-4">
          <ScreenShareView
            stream={screenStream}
            username={profile?.username || "Toi"}
            isLocal
            onStop={stopScreenShare}
          />
        </div>
      )}

      {/* Call UI */}
      <div className={cn(
        "flex flex-col items-center justify-center",
        isSharing ? "w-96 border-l border-border/50 p-8" : "flex-1"
      )}>
        <div className="text-center space-y-8">
          {/* Avatar with speaking indicator */}
          <div className="relative inline-block">
            <div
              className={cn(
                "absolute inset-0 rounded-full transition-all duration-300",
                callStatus === "active" && isSpeaking && "animate-speaking-ring"
              )}
              style={{
                background: isSpeaking
                  ? "radial-gradient(circle, hsl(var(--success) / 0.4), transparent 70%)"
                  : "transparent",
                transform: isSpeaking ? "scale(1.3)" : "scale(1)",
              }}
            />
            <Avatar className="h-32 w-32 ring-4 ring-primary/20">
              <AvatarImage src={friend.avatar_url || ""} />
              <AvatarFallback className="text-4xl bg-muted">
                {friend.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Name and Status */}
          <div>
            <h2 className="text-2xl font-bold">{friend.username}</h2>
            <p className="text-muted-foreground mt-1">
              {callStatus === "ringing" && (isIncoming ? "Appel entrant..." : "Appel en cours...")}
              {callStatus === "connecting" && "Connexion..."}
              {callStatus === "active" && formatDuration(duration)}
              {callStatus === "ended" && "Appel terminé"}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            {callStatus === "ringing" && isIncoming ? (
              <>
                <Button
                  size="lg"
                  variant="destructive"
                  className="h-16 w-16 rounded-full"
                  onClick={declineCall}
                >
                  <PhoneOff className="h-6 w-6" />
                </Button>
                <Button
                  size="lg"
                  className="h-16 w-16 rounded-full bg-success hover:bg-success/90"
                  onClick={acceptCall}
                >
                  <Phone className="h-6 w-6" />
                </Button>
              </>
            ) : callStatus === "active" ? (
              <>
                <Button
                  size="lg"
                  variant={isMuted ? "destructive" : "secondary"}
                  className="h-14 w-14 rounded-full"
                  onClick={toggleMute}
                >
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>
                <Button
                  size="lg"
                  variant={isSharing ? "default" : "secondary"}
                  className={cn(
                    "h-14 w-14 rounded-full",
                    isSharing && "bg-primary text-primary-foreground"
                  )}
                  onClick={handleToggleScreenShare}
                >
                  {isSharing ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
                </Button>
                <Button
                  size="lg"
                  variant="destructive"
                  className="h-16 w-16 rounded-full"
                  onClick={endCall}
                >
                  <PhoneOff className="h-6 w-6" />
                </Button>
              </>
            ) : callStatus === "connecting" || (callStatus === "ringing" && !isIncoming) ? (
              <Button
                size="lg"
                variant="destructive"
                className="h-16 w-16 rounded-full"
                onClick={endCall}
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
            ) : null}
          </div>

          {/* Loading indicator for connecting */}
          {(callStatus === "connecting" || (callStatus === "ringing" && !isIncoming)) && (
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          )}
        </div>
      </div>
    </div>
  );
};

export default PrivateCallPanel;
