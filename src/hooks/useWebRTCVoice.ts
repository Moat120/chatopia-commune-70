import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { playJoinSound, playLeaveSound } from "@/hooks/useSound";
import { getAudioConstraints } from "@/components/SettingsDialog";

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

export const useWebRTCVoice = ({ channelId, onError }: UseWebRTCVoiceProps) => {
  const { user, profile } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState<VoiceUser[]>([]);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>("connecting");
  const [audioLevel, setAudioLevel] = useState(0);

  const localStreamRef = useRef<MediaStream | null>(null);
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

  const currentUserId = user?.id || "";
  const currentUsername = profile?.username || "Utilisateur";
  const currentAvatarUrl = profile?.avatar_url || "";

  // Optimized peer connection with low latency settings
  const createPeerConnection = useCallback((remoteUserId: string): RTCPeerConnection => {
    const existing = peerConnectionsRef.current.get(remoteUserId);
    if (existing) {
      existing.close();
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);

    // Add local audio tracks with optimized sender parameters
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
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
    }

    // Handle incoming audio with immediate playback
    pc.ontrack = (event) => {
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
      audio.play().catch(() => {});
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
      if (state === "connected") {
        setConnectionQuality("excellent");
      } else if (state === "failed" || state === "disconnected") {
        setConnectionQuality("poor");
        const audio = remoteAudiosRef.current.get(remoteUserId);
        if (audio) {
          audio.srcObject = null;
          remoteAudiosRef.current.delete(remoteUserId);
        }
      }
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
      const audioConstraints = getAudioConstraints();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...audioConstraints,
          channelCount: 1,
        },
      });

      localStreamRef.current = stream;

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
        }
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
        pendingCandidatesRef.current.delete(key);
      });

      await presenceChannel.subscribe();

      await presenceChannel.track({
        odId: currentUserId,
        username: currentUsername,
        avatarUrl: currentAvatarUrl,
        isSpeaking: false,
        isMuted: false,
      });

      isConnectedRef.current = true;
      setIsConnected(true);
      setIsConnecting(false);
      setConnectionQuality("excellent");

      startVoiceDetection(stream);
    } catch (error: any) {
      console.error("[Voice] Join error:", error);
      await cleanup();
      onError?.(error.message || "Impossible d'accéder au microphone");
    }
  }, [channelId, currentUserId, currentUsername, currentAvatarUrl, isConnecting, cleanup, handleSignal, initiateConnection, startVoiceDetection, onError]);

  const leave = useCallback(async () => {
    await cleanup();
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;

    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      const newMuted = audioTrack.enabled;
      audioTrack.enabled = !newMuted;
      isMutedRef.current = newMuted;
      setIsMuted(newMuted);

      presenceChannelRef.current?.track({
        odId: currentUserId,
        username: currentUsername,
        avatarUrl: currentAvatarUrl,
        isSpeaking: false,
        isMuted: newMuted,
      });
    }
  }, [currentUserId, currentUsername, currentAvatarUrl]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [channelId, cleanup]);

  return {
    isConnected,
    isConnecting,
    isMuted,
    connectedUsers,
    currentUserId,
    connectionQuality,
    audioLevel,
    join,
    leave,
    toggleMute,
  };
};
