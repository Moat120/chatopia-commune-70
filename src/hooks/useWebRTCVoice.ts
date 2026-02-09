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
import { AdvancedNoiseProcessor } from "@/hooks/useNoiseProcessor";

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

  return {
    deviceId: selectedMic ? { ideal: selectedMic } : undefined,
    echoCancellation: { ideal: echoCancellation },
    noiseSuppression: { ideal: noiseSuppression },
    autoGainControl: { ideal: autoGain },
    sampleRate: { ideal: 48000 },
    sampleSize: { ideal: 16 },
    channelCount: { ideal: 1 },
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

export const useWebRTCVoice = ({ channelId, onError }: UseWebRTCVoiceProps) => {
  const { user, profile } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState<VoiceUser[]>([]);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>("connecting");
  const [audioLevel, setAudioLevel] = useState(0);
  const [isPttActive, setIsPttActive] = useState(false);
  // Per-user volume control: Map<userId, volume 0-2>
  const [userVolumes, setUserVolumes] = useState<Record<string, number>>({});

  const localStreamRef = useRef<MediaStream | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const noiseProcessorRef = useRef<AdvancedNoiseProcessor | null>(null);
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

  // Load saved volume for a user from localStorage
  const getSavedVolume = useCallback((userId: string): number => {
    try {
      const saved = localStorage.getItem(`userVolume_${userId}`);
      return saved !== null ? parseFloat(saved) : 1.0;
    } catch {
      return 1.0;
    }
  }, []);

  // Set volume for a specific user (0-2, where 1 = 100%, 2 = 200%)
  const setUserVolume = useCallback((userId: string, volume: number) => {
    const clampedVolume = Math.max(0, Math.min(2, volume));
    
    // Update the audio element volume
    const audio = remoteAudiosRef.current.get(userId);
    if (audio) {
      audio.volume = clampedVolume;
    }
    
    // Persist to localStorage
    localStorage.setItem(`userVolume_${userId}`, String(clampedVolume));
    
    // Update state
    setUserVolumes(prev => ({ ...prev, [userId]: clampedVolume }));
  }, []);

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

  const { isPushing, pttEnabled } = usePushToTalk({
    onPush: handlePttPush,
    onRelease: handlePttRelease,
    isEnabled: isConnectedRef.current,
  });

  useEffect(() => {
    pttEnabledRef.current = pttEnabled;
  }, [pttEnabled]);

  // Peer connection with per-user volume applied on track received
  const createPeerConnection = useCallback((remoteUserId: string): RTCPeerConnection => {
    const existing = peerConnectionsRef.current.get(remoteUserId);
    if (existing) {
      console.log('[Voice] Closing existing connection for:', remoteUserId);
      existing.close();
    }

    console.log('[Voice] Creating peer connection for:', remoteUserId);
    const pc = new RTCPeerConnection(RTC_CONFIG);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, localStreamRef.current!);
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
    }

    pc.ontrack = (event) => {
      console.log('[Voice] Received remote track from:', remoteUserId);
      const [remoteStream] = event.streams;

      let audio = remoteAudiosRef.current.get(remoteUserId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        (audio as any).playsInline = true;
        (audio as any).mozPreservesPitch = false;
        remoteAudiosRef.current.set(remoteUserId, audio);
      }
      
      // Apply saved volume for this user
      const savedVolume = getSavedVolume(remoteUserId);
      audio.volume = savedVolume;
      setUserVolumes(prev => ({ ...prev, [remoteUserId]: savedVolume }));
      
      audio.srcObject = remoteStream;
      audio.play().catch(console.error);
    };

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
        setConnectionQuality("poor");
        pc.restartIce();
      } else if (state === "disconnected") {
        setConnectionQuality("poor");
        // Auto-reconnect after 5s if still disconnected
        setTimeout(() => {
          if (pc.connectionState === "disconnected") {
            console.log('[Voice] Still disconnected after 5s, restarting ICE');
            pc.restartIce();
          }
        }, 5000);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[Voice] ICE state for', remoteUserId, ':', pc.iceConnectionState);
    };

    peerConnectionsRef.current.set(remoteUserId, pc);
    return pc;
  }, [currentUserId, getSavedVolume]);

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

  const startVoiceDetection = useCallback((stream: MediaStream) => {
    try {
      audioContextRef.current = new AudioContext({ sampleRate: 48000 });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 128;
      analyserRef.current.smoothingTimeConstant = 0.3;
      source.connect(analyserRef.current);

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      let lastBroadcast = 0;
      const BROADCAST_INTERVAL = 200;

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
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
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

    // Cleanup advanced noise processor
    if (noiseProcessorRef.current) {
      noiseProcessorRef.current.cleanup();
      noiseProcessorRef.current = null;
    }

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
    setUserVolumes({});
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

      const audioTrack = rawStream.getAudioTracks()[0];
      if (audioTrack) {
        const settings = audioTrack.getSettings();
        console.log('[Voice] Applied audio settings:', settings);
      }

      // Apply AdvancedNoiseProcessor pipeline
      let processedStream = rawStream;
      if (getNoiseSuppression()) {
        noiseProcessorRef.current = new AdvancedNoiseProcessor();
        processedStream = await noiseProcessorRef.current.process(rawStream);
        console.log('[Voice] Advanced noise processing applied, latency:', noiseProcessorRef.current.getLatency(), 'ms');
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
    userVolumes,
    setUserVolume,
    join,
    leave,
    toggleMute,
  };
};
