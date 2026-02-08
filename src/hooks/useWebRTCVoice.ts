import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { playJoinSound, playLeaveSound } from "@/hooks/useSound";
import { 
  getSelectedMicrophone, 
  getNoiseSuppression, 
  getEchoCancellation, 
  getAutoGain 
} from "@/components/SettingsDialog";
import { usePushToTalk, getPushToTalkEnabled } from "@/hooks/usePushToTalk";

export interface VoiceUser {
  odId: string;
  username: string;
  avatarUrl?: string;
  isSpeaking: boolean;
  isMuted: boolean;
}

export type ConnectionQuality = "excellent" | "good" | "poor" | "connecting";

interface SignalMessage {
  type: "voice-offer" | "voice-answer" | "voice-ice";
  from: string;
  to: string;
  data: any;
}

interface UseWebRTCVoiceProps {
  channelId: string;
  onError?: (error: string) => void;
}

// Optimized ICE servers for low latency
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
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
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

// Optimized RTC config for low latency
const RTC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 10,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

// Build audio constraints with FALLBACK for browser compatibility
const getOptimizedAudioConstraints = async (): Promise<MediaTrackConstraints> => {
  const selectedMic = getSelectedMicrophone();
  const noiseSuppression = getNoiseSuppression();
  const echoCancellation = getEchoCancellation();
  const autoGain = getAutoGain();

  // Use "ideal" for better browser compatibility - falls back gracefully
  return {
    deviceId: selectedMic ? { ideal: selectedMic } : undefined,
    // Use ideal instead of exact for compatibility
    echoCancellation: { ideal: echoCancellation },
    noiseSuppression: { ideal: noiseSuppression },
    autoGainControl: { ideal: autoGain },
    // Audio quality settings
    sampleRate: { ideal: 48000 },
    sampleSize: { ideal: 16 },
    channelCount: { ideal: 1 },
    // Chrome-specific advanced constraints for better noise reduction
    ...(noiseSuppression && {
      googNoiseSuppression: true,
      googHighpassFilter: true,
      googTypingNoiseDetection: true,
      googNoiseSuppression2: true,
    } as any),
    ...(echoCancellation && {
      googEchoCancellation: true,
      googEchoCancellation2: true,
    } as any),
    ...(autoGain && {
      googAutoGainControl: true,
      googAutoGainControl2: true,
    } as any),
  };
};

// Web Audio API Noise Processor for additional noise reduction
class NoiseProcessor {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private gainNode: GainNode | null = null;
  private highpassFilter: BiquadFilterNode | null = null;
  private lowpassFilter: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  async process(stream: MediaStream): Promise<MediaStream> {
    try {
      // Create audio context
      this.audioContext = new AudioContext({ sampleRate: 48000 });
      
      // Create source from input stream
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      
      // Create destination for output
      this.destinationNode = this.audioContext.createMediaStreamDestination();
      
      // Create highpass filter to remove low frequency rumble (< 80Hz)
      this.highpassFilter = this.audioContext.createBiquadFilter();
      this.highpassFilter.type = "highpass";
      this.highpassFilter.frequency.value = 80;
      this.highpassFilter.Q.value = 0.7;
      
      // Create lowpass filter to remove high frequency hiss (> 12kHz)
      this.lowpassFilter = this.audioContext.createBiquadFilter();
      this.lowpassFilter.type = "lowpass";
      this.lowpassFilter.frequency.value = 12000;
      this.lowpassFilter.Q.value = 0.7;
      
      // Create compressor for dynamics control
      this.compressor = this.audioContext.createDynamicsCompressor();
      this.compressor.threshold.value = -24;
      this.compressor.knee.value = 30;
      this.compressor.ratio.value = 12;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;
      
      // Create gain node
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;
      
      // Connect the audio processing chain
      this.sourceNode
        .connect(this.highpassFilter)
        .connect(this.lowpassFilter)
        .connect(this.compressor)
        .connect(this.gainNode)
        .connect(this.destinationNode);
      
      console.log('[NoiseProcessor] Audio processing chain created');
      
      // Return the processed stream
      return this.destinationNode.stream;
    } catch (error) {
      console.error('[NoiseProcessor] Failed to create processing chain:', error);
      // Return original stream if processing fails
      return stream;
    }
  }

  cleanup() {
    try {
      if (this.sourceNode) {
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }
      if (this.highpassFilter) {
        this.highpassFilter.disconnect();
        this.highpassFilter = null;
      }
      if (this.lowpassFilter) {
        this.lowpassFilter.disconnect();
        this.lowpassFilter = null;
      }
      if (this.compressor) {
        this.compressor.disconnect();
        this.compressor = null;
      }
      if (this.gainNode) {
        this.gainNode.disconnect();
        this.gainNode = null;
      }
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close();
        this.audioContext = null;
      }
    } catch (error) {
      console.error('[NoiseProcessor] Cleanup error:', error);
    }
  }
}

export const useWebRTCVoice = ({ channelId, onError }: UseWebRTCVoiceProps) => {
  const { user, profile } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState<VoiceUser[]>([]);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>("connecting");
  const [audioLevel, setAudioLevel] = useState(0);
  const [isPttActive, setIsPttActive] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const noiseProcessorRef = useRef<NoiseProcessor | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidate[]>>(new Map());
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const signalingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false);
  const isMutedRef = useRef(false);
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const isConnectedRef = useRef(false);
  const pttEnabledRef = useRef(getPushToTalkEnabled());

  const currentUserId = user?.id || "";
  const currentUsername = profile?.username || "Utilisateur";
  const currentAvatarUrl = profile?.avatar_url || "";

  // Push-to-Talk handlers
  const handlePttPush = useCallback(() => {
    if (!localStreamRef.current || !pttEnabledRef.current) return;
    
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = true;
      setIsPttActive(true);
      isMutedRef.current = false;
      setIsMuted(false);
    }
  }, []);

  const handlePttRelease = useCallback(() => {
    if (!localStreamRef.current || !pttEnabledRef.current) return;
    
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = false;
      setIsPttActive(false);
      isMutedRef.current = true;
      setIsMuted(true);
    }
  }, []);

  // Use Push-to-Talk hook
  const { isPushing, pttEnabled } = usePushToTalk({
    onPush: handlePttPush,
    onRelease: handlePttRelease,
    isEnabled: isConnectedRef.current,
  });

  // Update PTT enabled ref
  useEffect(() => {
    pttEnabledRef.current = pttEnabled;
  }, [pttEnabled]);

  // Optimized peer connection with low latency settings - BIDIRECTIONAL
  const createPeerConnection = useCallback((remoteUserId: string): RTCPeerConnection => {
    const existing = peerConnectionsRef.current.get(remoteUserId);
    if (existing) {
      console.log('[Voice] Closing existing connection for:', remoteUserId);
      existing.close();
    }

    console.log('[Voice] Creating peer connection for:', remoteUserId);
    const pc = new RTCPeerConnection(RTC_CONFIG);

    // CRITICAL: Add local audio tracks with optimized sender parameters
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        console.log('[Voice] Adding local track:', track.kind, 'to peer:', remoteUserId);
        const sender = pc.addTrack(track, localStreamRef.current!);
        
        // Optimize audio sender for low latency
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
    } else {
      console.warn('[Voice] No local stream when creating peer connection!');
    }

    // Handle incoming audio with immediate playback
    pc.ontrack = (event) => {
      console.log('[Voice] Received remote track from:', remoteUserId, 'kind:', event.track.kind);
      const [remoteStream] = event.streams;

      let audio = remoteAudiosRef.current.get(remoteUserId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        (audio as any).playsInline = true;
        // Low latency audio settings
        (audio as any).mozPreservesPitch = false;
        remoteAudiosRef.current.set(remoteUserId, audio);
      }
      audio.srcObject = remoteStream;
      audio.play().catch(console.error);
    };

    // Immediate ICE candidate sending
    pc.onicecandidate = (event) => {
      if (event.candidate && signalingChannelRef.current) {
        signalingChannelRef.current.send({
          type: "broadcast",
          event: "voice-signal",
          payload: {
            type: "voice-ice",
            from: currentUserId,
            to: remoteUserId,
            data: event.candidate.toJSON(),
          },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[Voice] Connection state for', remoteUserId, ':', state);
      if (state === "connected") {
        setConnectionQuality("excellent");
      } else if (state === "failed") {
        console.log('[Voice] Connection failed, attempting ICE restart for', remoteUserId);
        setConnectionQuality("poor");
        pc.restartIce();
      } else if (state === "disconnected") {
        setConnectionQuality("poor");
        const audio = remoteAudiosRef.current.get(remoteUserId);
        if (audio) {
          audio.srcObject = null;
          remoteAudiosRef.current.delete(remoteUserId);
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[Voice] ICE state for', remoteUserId, ':', pc.iceConnectionState);
    };

    peerConnectionsRef.current.set(remoteUserId, pc);
    return pc;
  }, [currentUserId]);

  // Optimized signal handling
  const handleSignal = useCallback(async (message: SignalMessage) => {
    if (message.to !== currentUserId || !isConnectedRef.current) return;

    let pc = peerConnectionsRef.current.get(message.from);

    if (message.type === "voice-offer") {
      if (!pc) pc = createPeerConnection(message.from);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(message.data));

        const pending = pendingCandidatesRef.current.get(message.from) || [];
        await Promise.all(pending.map(c => pc!.addIceCandidate(c).catch(() => {})));
        pendingCandidatesRef.current.delete(message.from);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        signalingChannelRef.current?.send({
          type: "broadcast",
          event: "voice-signal",
          payload: {
            type: "voice-answer",
            from: currentUserId,
            to: message.from,
            data: answer,
          },
        });
      } catch (error) {
        console.error("[Voice] Offer error:", error);
      }
    } else if (message.type === "voice-answer" && pc) {
      try {
        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(message.data));
          const pending = pendingCandidatesRef.current.get(message.from) || [];
          await Promise.all(pending.map(c => pc!.addIceCandidate(c).catch(() => {})));
          pendingCandidatesRef.current.delete(message.from);
        }
      } catch (error) {
        console.error("[Voice] Answer error:", error);
      }
    } else if (message.type === "voice-ice") {
      if (pc && pc.remoteDescription) {
        pc.addIceCandidate(new RTCIceCandidate(message.data)).catch(() => {});
      } else {
        const pending = pendingCandidatesRef.current.get(message.from) || [];
        pending.push(new RTCIceCandidate(message.data));
        pendingCandidatesRef.current.set(message.from, pending);
      }
    }
  }, [currentUserId, createPeerConnection]);

  // Optimized voice detection with reduced overhead
  const startVoiceDetection = useCallback((stream: MediaStream) => {
    try {
      audioContextRef.current = new AudioContext({ sampleRate: 48000 });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 128; // Smaller for faster processing
      analyserRef.current.smoothingTimeConstant = 0.3;
      source.connect(analyserRef.current);

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      let lastBroadcast = 0;
      const BROADCAST_INTERVAL = 200; // Reduced frequency

      const detectSpeaking = () => {
        if (!analyserRef.current || !isConnectedRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalizedLevel = Math.min(average / 50, 1);

        setAudioLevel(normalizedLevel);

        const speaking = average > 15 && !isMutedRef.current;
        const now = Date.now();

        if (speaking !== isSpeakingRef.current || now - lastBroadcast > BROADCAST_INTERVAL) {
          isSpeakingRef.current = speaking;
          lastBroadcast = now;

          presenceChannelRef.current?.track({
            odId: currentUserId,
            username: currentUsername,
            avatarUrl: currentAvatarUrl,
            isSpeaking: speaking,
            isMuted: isMutedRef.current,
          });
        }

        animationRef.current = requestAnimationFrame(detectSpeaking);
      };

      detectSpeaking();
    } catch (error) {
      console.error("[Voice] Detection error:", error);
    }
  }, [currentUserId, currentUsername, currentAvatarUrl]);

  const initiateConnection = useCallback(async (remoteUserId: string) => {
    if (remoteUserId === currentUserId || peerConnectionsRef.current.has(remoteUserId)) return;

    const pc = createPeerConnection(remoteUserId);

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
      });
      await pc.setLocalDescription(offer);

      signalingChannelRef.current?.send({
        type: "broadcast",
        event: "voice-signal",
        payload: {
          type: "voice-offer",
          from: currentUserId,
          to: remoteUserId,
          data: offer,
        },
      });
    } catch (error) {
      console.error("[Voice] Offer error:", error);
    }
  }, [currentUserId, createPeerConnection]);

  const cleanup = useCallback(async () => {
    isConnectedRef.current = false;

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();

    remoteAudiosRef.current.forEach((audio) => {
      audio.srcObject = null;
    });
    remoteAudiosRef.current.clear();

    // Cleanup noise processor
    if (noiseProcessorRef.current) {
      noiseProcessorRef.current.cleanup();
      noiseProcessorRef.current = null;
    }

    // Stop raw stream
    if (rawStreamRef.current) {
      rawStreamRef.current.getTracks().forEach((track) => track.stop());
      rawStreamRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (audioContextRef.current?.state !== "closed") {
      await audioContextRef.current?.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (presenceChannelRef.current) {
      await supabase.removeChannel(presenceChannelRef.current);
      presenceChannelRef.current = null;
    }

    if (signalingChannelRef.current) {
      await supabase.removeChannel(signalingChannelRef.current);
      signalingChannelRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    setIsMuted(false);
    setConnectedUsers([]);
    setConnectionQuality("connecting");
    setAudioLevel(0);
  }, []);

  const join = useCallback(async () => {
    if (isConnectedRef.current || isConnecting || !currentUserId) return;

    setIsConnecting(true);
    setConnectionQuality("connecting");

    try {
      const audioConstraints = await getOptimizedAudioConstraints();
      console.log('[Voice] Getting media with constraints:', audioConstraints);

      const rawStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });
      rawStreamRef.current = rawStream;

      // Log applied constraints to verify noise suppression is active
      const audioTrack = rawStream.getAudioTracks()[0];
      if (audioTrack) {
        const settings = audioTrack.getSettings();
        console.log('[Voice] Applied audio settings:', settings);
        console.log('[Voice] Noise suppression active:', settings.noiseSuppression);
        console.log('[Voice] Echo cancellation active:', settings.echoCancellation);
        console.log('[Voice] Auto gain active:', settings.autoGainControl);
      }

      // Apply additional Web Audio API noise processing
      let processedStream = rawStream;
      if (getNoiseSuppression()) {
        noiseProcessorRef.current = new NoiseProcessor();
        processedStream = await noiseProcessorRef.current.process(rawStream);
        console.log('[Voice] Web Audio API noise processing applied');
      }

      localStreamRef.current = processedStream;

      // Setup channels
      const signalingChannel = supabase.channel(`voice-sig-${channelId}`, {
        config: { broadcast: { self: false } },
      });
      signalingChannelRef.current = signalingChannel;

      signalingChannel.on("broadcast", { event: "voice-signal" }, ({ payload }) => {
        handleSignal(payload as SignalMessage);
      });

      await signalingChannel.subscribe();

      const presenceChannel = supabase.channel(`voice-pres-${channelId}`, {
        config: { presence: { key: currentUserId } },
      });
      presenceChannelRef.current = presenceChannel;

      presenceChannel.on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const users: VoiceUser[] = [];

        Object.values(state).forEach((presences: any[]) => {
          presences.forEach((presence) => {
            users.push({
              odId: presence.odId,
              username: presence.username,
              avatarUrl: presence.avatarUrl,
              isSpeaking: presence.isSpeaking || false,
              isMuted: presence.isMuted || false,
            });
          });
        });

        setConnectedUsers(users);

        users.forEach((u) => {
          if (u.odId !== currentUserId && currentUserId < u.odId) {
            initiateConnection(u.odId);
          }
        });
      });

      presenceChannel.on("presence", { event: "join" }, ({ key }) => {
        if (key !== currentUserId) {
          playJoinSound();
          if (currentUserId < key) {
            initiateConnection(key);
          }
        }
      });

      presenceChannel.on("presence", { event: "leave" }, ({ key }) => {
        if (key !== currentUserId) {
          playLeaveSound();
          const pc = peerConnectionsRef.current.get(key);
          if (pc) {
            pc.close();
            peerConnectionsRef.current.delete(key);
          }
          const audio = remoteAudiosRef.current.get(key);
          if (audio) {
            audio.srcObject = null;
            remoteAudiosRef.current.delete(key);
          }
        }
      });

      await presenceChannel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            odId: currentUserId,
            username: currentUsername,
            avatarUrl: currentAvatarUrl,
            isSpeaking: false,
            isMuted: false,
          });
        }
      });

      // Start voice detection
      startVoiceDetection(rawStream);

      isConnectedRef.current = true;
      setIsConnected(true);
      setIsConnecting(false);
      setConnectionQuality("good");

      playJoinSound();
    } catch (error: any) {
      console.error("[Voice] Join error:", error);
      onError?.(error.message || "Failed to join voice channel");
      setIsConnecting(false);
      cleanup();
    }
  }, [
    channelId,
    currentUserId,
    currentUsername,
    currentAvatarUrl,
    isConnecting,
    handleSignal,
    initiateConnection,
    startVoiceDetection,
    cleanup,
    onError,
  ]);

  const leave = useCallback(async () => {
    playLeaveSound();
    await cleanup();
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;

    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      const newMuted = !isMuted;
      audioTrack.enabled = !newMuted;
      setIsMuted(newMuted);
      isMutedRef.current = newMuted;

      presenceChannelRef.current?.track({
        odId: currentUserId,
        username: currentUsername,
        avatarUrl: currentAvatarUrl,
        isSpeaking: false,
        isMuted: newMuted,
      });
    }
  }, [isMuted, currentUserId, currentUsername, currentAvatarUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isConnected,
    isConnecting,
    isMuted,
    connectedUsers,
    currentUserId,
    connectionQuality,
    audioLevel,
    isPttActive,
    join,
    leave,
    toggleMute,
  };
};
