import { useState, useEffect, useRef, useMemo } from "react";
import { Friend } from "@/hooks/useFriends";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWebRTCScreenShare, ScreenQuality, QUALITY_PRESETS } from "@/hooks/useWebRTCScreenShare";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Mic, MicOff, Loader2, Monitor, MonitorOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { RingtoneManager } from "@/hooks/useSound";
import { getAudioConstraints } from "@/components/SettingsDialog";
import MultiScreenShareView from "@/components/voice/MultiScreenShareView";
import ScreenShareQualityDialog from "@/components/voice/ScreenShareQualityDialog";

interface PrivateCallPanelProps {
  friend: Friend;
  onEnd: () => void;
  isIncoming?: boolean;
  callId?: string;
}

// Optimized ICE servers for low latency
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

// Optimized RTC config
const RTC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 10,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

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
  const [friendSpeaking, setFriendSpeaking] = useState(false);
  const [qualityDialogOpen, setQualityDialogOpen] = useState(false);
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const signalingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const durationInterval = useRef<NodeJS.Timeout | null>(null);
  const ringtoneManager = useRef<RingtoneManager>(new RingtoneManager());

  // Play ringtone for incoming calls
  useEffect(() => {
    if (isIncoming && callStatus === "ringing") {
      ringtoneManager.current.start(2000);
    } else {
      ringtoneManager.current.stop();
    }

    return () => {
      ringtoneManager.current.stop();
    };
  }, [isIncoming, callStatus]);

  const channelId = useMemo(() => `private-call-${[user?.id, friend.id].sort().join('-')}`, [user?.id, friend.id]);

  const {
    isSharing,
    localStream: screenStream,
    screenSharers,
    remoteStreams,
    startScreenShare,
    stopScreenShare,
    cleanup: cleanupScreenShare,
  } = useWebRTCScreenShare({
    channelId,
    onError: (error) => {
      toast({
        title: "Erreur de partage",
        description: error,
        variant: "destructive",
      });
    },
  });

  // Build screens array
  const activeScreens = useMemo(() => {
    const screens = [];
    
    if (isSharing && screenStream) {
      screens.push({
        odId: user?.id || '',
        username: profile?.username || "Toi",
        stream: screenStream,
        isLocal: true,
      });
    }
    
    remoteStreams.forEach((stream, odId) => {
      screens.push({
        odId,
        username: friend.username,
        stream,
        isLocal: false,
      });
    });
    
    return screens;
  }, [isSharing, screenStream, remoteStreams, user?.id, profile?.username, friend.username]);

  // Optimized WebRTC peer connection for low latency
  const setupPeerConnection = () => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnectionRef.current = pc;

    // Handle incoming audio with immediate playback
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      
      if (!remoteAudioRef.current) {
        remoteAudioRef.current = new Audio();
        remoteAudioRef.current.autoplay = true;
        (remoteAudioRef.current as any).playsInline = true;
      }
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(() => {});

      // Optimized friend speaking detection
      const audioContext = new AudioContext({ sampleRate: 48000 });
      const source = audioContext.createMediaStreamSource(remoteStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const detectFriendSpeaking = () => {
        if (callStatus !== "active") return;
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setFriendSpeaking(avg > 15);
        requestAnimationFrame(detectFriendSpeaking);
      };
      detectFriendSpeaking();
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && signalingChannelRef.current) {
        signalingChannelRef.current.send({
          type: 'broadcast',
          event: 'webrtc-signal',
          payload: {
            type: 'ice-candidate',
            from: user?.id,
            to: friend.id,
            data: event.candidate
          }
        });
      }
    };

    return pc;
  };

  // Handle signaling messages
  const handleSignal = async (payload: any) => {
    if (payload.to !== user?.id) return;
    
    console.log('[PrivateCall] Signal received:', payload.type);
    
    let pc = peerConnectionRef.current;

    if (payload.type === 'offer') {
      // When receiving offer, we need to get microphone first
      try {
        if (!localStreamRef.current) {
          console.log('[PrivateCall] Getting microphone for callee...');
          const audioConstraints = getAudioConstraints();
          const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: audioConstraints,
          });
          localStreamRef.current = stream;
          
          // Start voice detection for callee
          audioContextRef.current = new AudioContext();
          analyserRef.current = audioContextRef.current.createAnalyser();
          const source = audioContextRef.current.createMediaStreamSource(stream);
          source.connect(analyserRef.current);
          analyserRef.current.fftSize = 256;

          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          const detectVoice = () => {
            if (!analyserRef.current || callStatus === "ended") return;
            analyserRef.current.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
            setIsSpeaking(average > 15 && !isMuted);
            animationRef.current = requestAnimationFrame(detectVoice);
          };
          detectVoice();
        }

        if (!pc) pc = setupPeerConnection();
        
        // Add local tracks BEFORE setting remote description
        localStreamRef.current.getTracks().forEach(track => {
          if (!pc!.getSenders().find(s => s.track === track)) {
            pc!.addTrack(track, localStreamRef.current!);
          }
        });

        await pc.setRemoteDescription(new RTCSessionDescription(payload.data));
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        signalingChannelRef.current?.send({
          type: 'broadcast',
          event: 'webrtc-signal',
          payload: {
            type: 'answer',
            from: user?.id,
            to: friend.id,
            data: answer
          }
        });
      } catch (error) {
        console.error('[PrivateCall] Error handling offer:', error);
      }
    } else if (payload.type === 'answer') {
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.data));
    } else if (payload.type === 'ice-candidate') {
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.data));
        } catch (error) {
          console.error('[PrivateCall] ICE error:', error);
        }
      }
    }
  };

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

  // Setup signaling channel
  useEffect(() => {
    if (!user) return;

    const signalingChannel = supabase.channel(`private-signaling-${channelId}`);
    signalingChannelRef.current = signalingChannel;

    signalingChannel.on('broadcast', { event: 'webrtc-signal' }, ({ payload }) => {
      handleSignal(payload);
    });

    signalingChannel.subscribe();

    return () => {
      supabase.removeChannel(signalingChannel);
    };
  }, [user, channelId]);

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
            startAudioAndConnect();
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

  const startAudioAndConnect = async () => {
    try {
      const audioConstraints = getAudioConstraints();
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          ...audioConstraints,
          channelCount: 1,
        },
      });
      localStreamRef.current = stream;

      // Optimized voice detection
      audioContextRef.current = new AudioContext({ sampleRate: 48000 });
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 128;
      analyserRef.current.smoothingTimeConstant = 0.3;

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      const detectVoice = () => {
        if (!analyserRef.current || callStatus === "ended") return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setIsSpeaking(average > 15 && !isMuted);
        animationRef.current = requestAnimationFrame(detectVoice);
      };
      detectVoice();

      // Setup peer connection with optimized settings
      const pc = setupPeerConnection();
      stream.getTracks().forEach(track => {
        const sender = pc.addTrack(track, stream);
        // Optimize audio for low latency
        if (track.kind === 'audio') {
          const params = sender.getParameters();
          if (params.encodings && params.encodings.length > 0) {
            params.encodings[0].maxBitrate = 128000;
            params.encodings[0].priority = "high";
            params.encodings[0].networkPriority = "high";
            sender.setParameters(params).catch(() => {});
          }
        }
      });

      // Only caller creates offer
      if (!isIncoming) {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
        });
        await pc.setLocalDescription(offer);
        
        signalingChannelRef.current?.send({
          type: 'broadcast',
          event: 'webrtc-signal',
          payload: {
            type: 'offer',
            from: user?.id,
            to: friend.id,
            data: offer
          }
        });
      }
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible d'accéder au microphone", variant: "destructive" });
    }
  };

  const cleanup = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (audioContextRef.current?.state !== 'closed') {
      audioContextRef.current?.close();
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    if (isSharing) {
      stopScreenShare();
    }
    cleanupScreenShare();
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
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const handleToggleScreenShare = () => {
    if (isSharing) {
      stopScreenShare();
    } else {
      setQualityDialogOpen(true);
    }
  };

  const handleSelectQuality = async (quality: ScreenQuality) => {
    const preset = QUALITY_PRESETS[quality];
    const stream = await startScreenShare(quality);
    if (stream) {
      toast({
        title: "Partage d'écran",
        description: `Tu partages ton écran en ${preset.height}p ${preset.frameRate}fps`,
      });
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const hasScreenShare = activeScreens.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex">
      {/* Screen Share Area */}
      {hasScreenShare && (
        <div className="flex-1 min-w-0">
          <MultiScreenShareView
            screens={activeScreens}
            onStopLocal={stopScreenShare}
          />
        </div>
      )}

      {/* Call UI */}
      <div className={cn(
        "flex flex-col items-center justify-center",
        hasScreenShare ? "w-96 border-l border-border/50 p-8 shrink-0" : "flex-1"
      )}>
        <div className="text-center space-y-8">
          {/* Both Avatars - side by side */}
          <div className="flex items-center justify-center gap-8">
            {/* My Avatar */}
            <div className="relative">
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
              <Avatar className={cn(
                "ring-4",
                isSpeaking ? "ring-success/50" : "ring-primary/20",
                hasScreenShare ? "h-20 w-20" : "h-28 w-28"
              )}>
                <AvatarImage src={profile?.avatar_url || ""} />
                <AvatarFallback className={cn("bg-muted", hasScreenShare ? "text-2xl" : "text-3xl")}>
                  {profile?.username?.[0]?.toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <p className="text-xs text-muted-foreground mt-2 text-center">Toi</p>
              {isMuted && (
                <div className="absolute -bottom-1 -right-1 bg-destructive rounded-full p-1">
                  <MicOff className="h-3 w-3 text-destructive-foreground" />
                </div>
              )}
            </div>

            {/* Friend's Avatar */}
            <div className="relative">
              <div
                className={cn(
                  "absolute inset-0 rounded-full transition-all duration-300",
                  callStatus === "active" && friendSpeaking && "animate-speaking-ring"
                )}
                style={{
                  background: friendSpeaking
                    ? "radial-gradient(circle, hsl(var(--success) / 0.4), transparent 70%)"
                    : "transparent",
                  transform: friendSpeaking ? "scale(1.3)" : "scale(1)",
                }}
              />
              <Avatar className={cn(
                "ring-4",
                friendSpeaking ? "ring-success/50" : "ring-primary/20",
                hasScreenShare ? "h-20 w-20" : "h-28 w-28"
              )}>
                <AvatarImage src={friend.avatar_url || ""} />
                <AvatarFallback className={cn("bg-muted", hasScreenShare ? "text-2xl" : "text-3xl")}>
                  {friend.username[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <p className="text-xs text-muted-foreground mt-2 text-center">{friend.username}</p>
            </div>
          </div>

          {/* Status */}
          <div>
            <p className="text-muted-foreground">
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

      {/* Quality Selection Dialog */}
      <ScreenShareQualityDialog
        open={qualityDialogOpen}
        onOpenChange={setQualityDialogOpen}
        onSelectQuality={handleSelectQuality}
      />
    </div>
  );
};

export default PrivateCallPanel;
