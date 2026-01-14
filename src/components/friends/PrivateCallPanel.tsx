import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Friend } from "@/hooks/useFriends";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWebRTCScreenShare, ScreenQuality, QUALITY_PRESETS } from "@/hooks/useWebRTCScreenShare";
import { useSimpleLatency } from "@/hooks/useConnectionLatency";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Mic, MicOff, Loader2, Monitor, MonitorOff, Radio, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { RingtoneManager } from "@/hooks/useSound";
import { 
  getSelectedMicrophone, 
  getNoiseSuppression, 
  getEchoCancellation, 
  getAutoGain 
} from "@/components/SettingsDialog";
import { usePushToTalk, getPushToTalkEnabled, getKeyDisplayName, getPushToTalkKey } from "@/hooks/usePushToTalk";
import MultiScreenShareView from "@/components/voice/MultiScreenShareView";
import ScreenShareQualityDialog from "@/components/voice/ScreenShareQualityDialog";
import ConnectionQualityIndicator from "@/components/voice/ConnectionQualityIndicator";

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

// Build audio constraints from settings
const getOptimizedAudioConstraints = (): MediaTrackConstraints => {
  const selectedMic = getSelectedMicrophone();
  const noiseSuppression = getNoiseSuppression();
  const echoCancellation = getEchoCancellation();
  const autoGain = getAutoGain();

  return {
    deviceId: selectedMic ? { exact: selectedMic } : undefined,
    echoCancellation: echoCancellation,
    noiseSuppression: noiseSuppression,
    autoGainControl: autoGain,
    sampleRate: { ideal: 48000 },
    channelCount: { exact: 1 },
  };
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
  const [isPttActive, setIsPttActive] = useState(false);
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const signalingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const durationInterval = useRef<NodeJS.Timeout | null>(null);
  const ringtoneManager = useRef<RingtoneManager>(new RingtoneManager());
  const pttEnabledRef = useRef(getPushToTalkEnabled());

  // PTT handlers
  const handlePttPush = useCallback(() => {
    if (!localStreamRef.current || !pttEnabledRef.current) return;
    
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = true;
      setIsPttActive(true);
      setIsMuted(false);
    }
  }, []);

  const handlePttRelease = useCallback(() => {
    if (!localStreamRef.current || !pttEnabledRef.current) return;
    
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = false;
      setIsPttActive(false);
      setIsMuted(true);
    }
  }, []);

  // Use Push-to-Talk hook
  const { isPushing, pttEnabled } = usePushToTalk({
    onPush: handlePttPush,
    onRelease: handlePttRelease,
    isEnabled: callStatus === "active",
  });

  // Update PTT enabled ref
  useEffect(() => {
    pttEnabledRef.current = pttEnabled;
  }, [pttEnabled]);

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

  // Optimized WebRTC peer connection for low latency - BIDIRECTIONAL audio
  const setupPeerConnection = (stream: MediaStream) => {
    // Close existing connection if any
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnectionRef.current = pc;

    // CRITICAL: Add local tracks FIRST before any negotiation
    stream.getTracks().forEach(track => {
      console.log('[PrivateCall] Adding local track:', track.kind);
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

    // Handle incoming audio with immediate playback
    pc.ontrack = (event) => {
      console.log('[PrivateCall] Received remote track:', event.track.kind);
      const [remoteStream] = event.streams;
      
      if (!remoteAudioRef.current) {
        remoteAudioRef.current = new Audio();
        remoteAudioRef.current.autoplay = true;
        (remoteAudioRef.current as any).playsInline = true;
      }
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(console.error);

      // Optimized friend speaking detection
      try {
        const audioContext = new AudioContext({ sampleRate: 48000 });
        const source = audioContext.createMediaStreamSource(remoteStream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const detectFriendSpeaking = () => {
          if (callStatus === "ended") {
            audioContext.close();
            return;
          }
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setFriendSpeaking(avg > 15);
          requestAnimationFrame(detectFriendSpeaking);
        };
        detectFriendSpeaking();
      } catch (e) {
        console.error('[PrivateCall] Error setting up friend speaking detection:', e);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && signalingChannelRef.current) {
        console.log('[PrivateCall] Sending ICE candidate');
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

    pc.onconnectionstatechange = () => {
      console.log('[PrivateCall] Connection state:', pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[PrivateCall] ICE state:', pc.iceConnectionState);
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
          const audioConstraints = getOptimizedAudioConstraints();
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

        // Setup peer connection with stream - tracks already added in setupPeerConnection
        if (!pc) pc = setupPeerConnection(localStreamRef.current);

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
      const audioConstraints = getOptimizedAudioConstraints();
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: audioConstraints,
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

      // Setup peer connection with stream - tracks already added with optimized settings
      const pc = setupPeerConnection(stream);

      // If PTT is enabled, start muted
      if (pttEnabled) {
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = false;
          setIsMuted(true);
        }
      }

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
  const { ping, quality: latencyQuality } = useSimpleLatency();
  
  // Map latency quality to connection quality type
  const connectionQuality = callStatus === 'active' 
    ? (latencyQuality === 'fair' ? 'good' : latencyQuality === 'excellent' ? 'excellent' : latencyQuality === 'good' ? 'good' : 'poor') as 'excellent' | 'good' | 'poor' | 'connecting'
    : 'connecting' as const;

  return (
    <div className="fixed inset-0 z-50 bg-background/98 backdrop-blur-2xl flex">
      {/* Screen Share Area */}
      {hasScreenShare && (
        <div className="flex-1 min-w-0 bg-black/20">
          <MultiScreenShareView
            screens={activeScreens}
            onStopLocal={stopScreenShare}
          />
        </div>
      )}

      {/* Call UI */}
      <div className={cn(
        "flex flex-col items-center justify-center relative",
        hasScreenShare ? "w-[420px] border-l border-white/[0.05] p-8 shrink-0" : "flex-1"
      )}>
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.02] via-transparent to-transparent pointer-events-none" />
        <div className="relative text-center space-y-8">
          {/* Connection quality indicator */}
          {callStatus === "active" && (
            <div className="flex justify-center animate-fade-in">
              <ConnectionQualityIndicator 
                quality={connectionQuality} 
                ping={ping}
                showPing={true}
              />
            </div>
          )}

          {/* Both Avatars - side by side */}
          <div className="flex items-center justify-center gap-10">
            {/* My Avatar */}
            <div className="relative flex flex-col items-center">
              {/* Speaking glow */}
              {callStatus === "active" && isSpeaking && (
                <>
                  <div className="absolute inset-0 rounded-full animate-[speaking-ring_1.5s_ease-out_infinite]"
                    style={{ background: 'radial-gradient(circle, hsl(var(--success) / 0.3), transparent 70%)', transform: 'scale(1.5)' }} />
                  <div className="absolute inset-0 rounded-full animate-[speaking-ring_1.5s_ease-out_infinite_0.5s]"
                    style={{ background: 'radial-gradient(circle, hsl(var(--success) / 0.15), transparent 70%)', transform: 'scale(1.8)' }} />
                </>
              )}
              <Avatar className={cn(
                "transition-all duration-300 ring-[3px] ring-offset-2 ring-offset-background shadow-2xl",
                isSpeaking ? "ring-emerald-500 shadow-emerald-500/20" : "ring-white/10",
                hasScreenShare ? "h-20 w-20" : "h-28 w-28"
              )}>
                <AvatarImage src={profile?.avatar_url || ""} />
                <AvatarFallback className={cn("bg-gradient-to-br from-primary/30 to-primary/10 text-primary font-bold", hasScreenShare ? "text-2xl" : "text-3xl")}>
                  {profile?.username?.[0]?.toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <p className="text-xs text-muted-foreground/60 mt-3 font-medium">Vous</p>
              {isMuted && (
                <div className="absolute -bottom-1 -right-1 bg-gradient-to-br from-rose-500 to-rose-600 rounded-full p-1.5 ring-2 ring-background shadow-lg">
                  <MicOff className="h-3 w-3 text-white" />
                </div>
              )}
              {isSpeaking && !isMuted && (
                <div className="absolute -bottom-1 -right-1 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full p-1.5 ring-2 ring-background shadow-lg animate-pulse">
                  <Volume2 className="h-3 w-3 text-white" />
                </div>
              )}
            </div>

            {/* Friend's Avatar */}
            <div className="relative flex flex-col items-center">
              {/* Speaking glow */}
              {callStatus === "active" && friendSpeaking && (
                <>
                  <div className="absolute inset-0 rounded-full animate-[speaking-ring_1.5s_ease-out_infinite]"
                    style={{ background: 'radial-gradient(circle, hsl(var(--success) / 0.3), transparent 70%)', transform: 'scale(1.5)' }} />
                  <div className="absolute inset-0 rounded-full animate-[speaking-ring_1.5s_ease-out_infinite_0.5s]"
                    style={{ background: 'radial-gradient(circle, hsl(var(--success) / 0.15), transparent 70%)', transform: 'scale(1.8)' }} />
                </>
              )}
              <Avatar className={cn(
                "transition-all duration-300 ring-[3px] ring-offset-2 ring-offset-background shadow-2xl",
                friendSpeaking ? "ring-emerald-500 shadow-emerald-500/20" : "ring-white/10",
                hasScreenShare ? "h-20 w-20" : "h-28 w-28"
              )}>
                <AvatarImage src={friend.avatar_url || ""} />
                <AvatarFallback className={cn("bg-gradient-to-br from-primary/30 to-primary/10 text-primary font-bold", hasScreenShare ? "text-2xl" : "text-3xl")}>
                  {friend.username[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <p className="text-xs text-muted-foreground/60 mt-3 font-medium">{friend.username}</p>
              {friendSpeaking && (
                <div className="absolute -bottom-1 -right-1 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full p-1.5 ring-2 ring-background shadow-lg animate-pulse">
                  <Volume2 className="h-3 w-3 text-white" />
                </div>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <p className="text-muted-foreground">
              {callStatus === "ringing" && (isIncoming ? "Appel entrant..." : "Appel en cours...")}
              {callStatus === "connecting" && "Connexion..."}
              {callStatus === "active" && formatDuration(duration)}
              {callStatus === "ended" && "Appel terminé"}
            </p>
            
            {/* PTT Indicator */}
            {callStatus === "active" && pttEnabled && (
              <div className={cn(
                "flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200",
                isPttActive 
                  ? "bg-success/20 text-success border border-success/30" 
                  : "bg-secondary/50 text-muted-foreground border border-border/50"
              )}>
                <Radio className={cn("h-4 w-4", isPttActive && "animate-pulse")} />
                <span>
                  {isPttActive ? "Vous parlez..." : `Appuyez sur ${getKeyDisplayName(getPushToTalkKey())} pour parler`}
                </span>
              </div>
            )}
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
