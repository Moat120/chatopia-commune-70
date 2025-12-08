import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { playJoinSound, playLeaveSound } from "@/hooks/useSound";
import { getNoiseSuppression } from "@/components/SettingsDialog";

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

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];

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

  // Use Supabase profile data
  const currentUserId = user?.id || "";
  const currentUsername = profile?.username || "Utilisateur";
  const currentAvatarUrl = profile?.avatar_url || "";

  // Create peer connection for a remote user
  const createPeerConnection = useCallback((remoteUserId: string): RTCPeerConnection => {
    console.log(`[Voice] Creating peer connection for ${remoteUserId}`);

    // Close existing connection if any
    const existing = peerConnectionsRef.current.get(remoteUserId);
    if (existing) {
      existing.close();
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local audio tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        console.log(`[Voice] Adding local track: ${track.kind}`);
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle incoming audio tracks
    pc.ontrack = (event) => {
      console.log(`[Voice] Received remote track from ${remoteUserId}`);
      const [remoteStream] = event.streams;

      let audio = remoteAudiosRef.current.get(remoteUserId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        (audio as any).playsInline = true;
        remoteAudiosRef.current.set(remoteUserId, audio);
      }
      audio.srcObject = remoteStream;
      audio.play().catch((e) => console.error("[Voice] Audio play error:", e));
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && signalingChannelRef.current) {
        console.log(`[Voice] Sending ICE candidate to ${remoteUserId}`);
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
      console.log(`[Voice] Connection state with ${remoteUserId}: ${pc.connectionState}`);
      if (pc.connectionState === "connected") {
        setConnectionQuality("excellent");
      } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setConnectionQuality("poor");
        // Clean up failed connection
        const audio = remoteAudiosRef.current.get(remoteUserId);
        if (audio) {
          audio.srcObject = null;
          audio.remove();
          remoteAudiosRef.current.delete(remoteUserId);
        }
      }
    };

    peerConnectionsRef.current.set(remoteUserId, pc);
    return pc;
  }, [currentUserId]);

  // Handle incoming signaling messages
  const handleSignal = useCallback(async (message: SignalMessage) => {
    if (message.to !== currentUserId) return;
    if (!isConnectedRef.current) return;

    console.log(`[Voice] Received signal: ${message.type} from ${message.from}`);

    let pc = peerConnectionsRef.current.get(message.from);

    if (message.type === "voice-offer") {
      // Someone is offering to connect
      if (!pc) pc = createPeerConnection(message.from);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(message.data));

        // Apply any pending ICE candidates
        const pending = pendingCandidatesRef.current.get(message.from) || [];
        for (const candidate of pending) {
          await pc.addIceCandidate(candidate);
        }
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
        console.error("[Voice] Error handling offer:", error);
      }
    } else if (message.type === "voice-answer" && pc) {
      try {
        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(message.data));

          // Apply any pending ICE candidates
          const pending = pendingCandidatesRef.current.get(message.from) || [];
          for (const candidate of pending) {
            await pc.addIceCandidate(candidate);
          }
          pendingCandidatesRef.current.delete(message.from);
        }
      } catch (error) {
        console.error("[Voice] Error setting answer:", error);
      }
    } else if (message.type === "voice-ice") {
      if (pc) {
        if (pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(message.data));
          } catch (error) {
            console.error("[Voice] ICE candidate error:", error);
          }
        } else {
          // Queue the candidate for later
          const pending = pendingCandidatesRef.current.get(message.from) || [];
          pending.push(new RTCIceCandidate(message.data));
          pendingCandidatesRef.current.set(message.from, pending);
        }
      }
    }
  }, [currentUserId, createPeerConnection]);

  // Start voice detection
  const startVoiceDetection = useCallback((stream: MediaStream) => {
    try {
      audioContextRef.current = new AudioContext({ sampleRate: 48000 });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();

      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.4;
      source.connect(analyserRef.current);

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      let lastBroadcast = 0;
      const BROADCAST_INTERVAL = 150;

      const detectSpeaking = () => {
        if (!analyserRef.current || !presenceChannelRef.current || !isConnectedRef.current) {
          if (isConnectedRef.current) {
            animationRef.current = requestAnimationFrame(detectSpeaking);
          }
          return;
        }

        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalizedLevel = Math.min(average / 50, 1);

        setAudioLevel(normalizedLevel);

        const speaking = average > 15 && !isMutedRef.current;
        const now = Date.now();

        if (speaking !== isSpeakingRef.current || now - lastBroadcast > BROADCAST_INTERVAL) {
          isSpeakingRef.current = speaking;
          lastBroadcast = now;

          presenceChannelRef.current.track({
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
      console.error("[Voice] Voice detection error:", error);
    }
  }, [currentUserId, currentUsername, currentAvatarUrl]);

  // Initiate connection to a user
  const initiateConnection = useCallback(async (remoteUserId: string) => {
    if (remoteUserId === currentUserId) return;
    if (peerConnectionsRef.current.has(remoteUserId)) {
      console.log(`[Voice] Already have connection to ${remoteUserId}`);
      return;
    }

    console.log(`[Voice] Initiating connection to ${remoteUserId}`);
    const pc = createPeerConnection(remoteUserId);

    try {
      const offer = await pc.createOffer();
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
      console.error("[Voice] Offer creation error:", error);
    }
  }, [currentUserId, createPeerConnection]);

  // Cleanup all resources
  const cleanup = useCallback(async () => {
    console.log("[Voice] Cleaning up");

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
      audio.remove();
    });
    remoteAudiosRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (audioContextRef.current?.state !== "closed") {
      await audioContextRef.current?.close();
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

  // Join voice channel
  const join = useCallback(async () => {
    if (isConnectedRef.current || isConnecting || !currentUserId) return;

    console.log("[Voice] Joining channel:", channelId);
    setIsConnecting(true);
    setConnectionQuality("connecting");

    try {
      // Get noise suppression setting
      const noiseSuppressionEnabled = getNoiseSuppression();
      console.log("[Voice] Noise suppression:", noiseSuppressionEnabled);

      // Get microphone access with configurable noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: noiseSuppressionEnabled,
          autoGainControl: true,
          sampleRate: 48000,
        },
      });

      localStreamRef.current = stream;

      // Setup signaling channel first
      const signalingChannel = supabase.channel(`voice-sig-${channelId}`);
      signalingChannelRef.current = signalingChannel;

      signalingChannel.on("broadcast", { event: "voice-signal" }, ({ payload }) => {
        handleSignal(payload as SignalMessage);
      });

      await signalingChannel.subscribe();
      console.log("[Voice] Signaling channel subscribed");

      // Setup presence channel
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

        // Initiate connections to users with higher IDs (to avoid duplicate connections)
        users.forEach((u) => {
          if (u.odId !== currentUserId && currentUserId < u.odId) {
            initiateConnection(u.odId);
          }
        });
      });

      presenceChannel.on("presence", { event: "join" }, ({ key, newPresences }) => {
        console.log(`[Voice] User joined: ${key}`);
        // Play join sound for other users joining
        if (key !== currentUserId) {
          playJoinSound();
        }
        // If new user has higher ID, we initiate the connection
        if (key !== currentUserId && currentUserId < key) {
          initiateConnection(key);
        }
      });

      presenceChannel.on("presence", { event: "leave" }, ({ key }) => {
        console.log(`[Voice] User left: ${key}`);
        // Play leave sound for other users leaving
        if (key !== currentUserId) {
          playLeaveSound();
        }
        // Clean up peer connection
        const pc = peerConnectionsRef.current.get(key);
        if (pc) {
          pc.close();
          peerConnectionsRef.current.delete(key);
        }
        const audio = remoteAudiosRef.current.get(key);
        if (audio) {
          audio.srcObject = null;
          audio.remove();
          remoteAudiosRef.current.delete(key);
        }
        pendingCandidatesRef.current.delete(key);
      });

      await presenceChannel.subscribe();
      console.log("[Voice] Presence channel subscribed");

      // Track our presence
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

  // Leave voice channel
  const leave = useCallback(async () => {
    await cleanup();
  }, [cleanup]);

  // Toggle mute
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

  // Cleanup on unmount or channel change
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
