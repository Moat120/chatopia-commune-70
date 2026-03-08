import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import { 
  getSelectedMicrophone, 
  getNoiseSuppression, 
  getEchoCancellation, 
  getAutoGain 
} from "@/components/SettingsDialog";
import { usePushToTalk, getPushToTalkEnabled } from "@/hooks/usePushToTalk";
import { AdvancedNoiseProcessor } from "@/hooks/useNoiseProcessor";
import { 
  RTC_CONFIG, 
  mungeOpusSDP, 
  configureAudioSender, 
  getConnectionStats,
  ICERestartManager,
  type ConnectionStats 
} from "@/lib/webrtcUtils";

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
    sampleSize: { ideal: 24 },
    channelCount: { ideal: 1 },
    // Reduce latency for voice
    latency: { ideal: 0.01, max: 0.05 },
    ...(noiseSuppression && {
      googNoiseSuppression: true,
      googHighpassFilter: true,
      googTypingNoiseDetection: true,
      googNoiseSuppression2: true,
    } as any),
    ...(echoCancellation && {
      googEchoCancellation: true,
      googEchoCancellation2: true,
      googEchoCancellation3: true,
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
  const [userVolumes, setUserVolumes] = useState<Record<string, number>>({});
  const [noiseEngine, setNoiseEngine] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const noiseProcessorRef = useRef<AdvancedNoiseProcessor | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceRestartManagersRef = useRef<Map<string, ICERestartManager>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidate[]>>(new Map());
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const signalingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const rosterChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isSpeakingRef = useRef(false);
  const isMutedRef = useRef(false);
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const isConnectedRef = useRef(false);
  const pttEnabledRef = useRef(getPushToTalkEnabled());

  const currentUserId = user?.id || "";
  const currentUsername = profile?.username || "Utilisateur";
  const currentAvatarUrl = profile?.avatar_url || "";

  const getSavedVolume = useCallback((userId: string): number => {
    try {
      const saved = localStorage.getItem(`userVolume_${userId}`);
      return saved !== null ? parseFloat(saved) : 1.0;
    } catch {
      return 1.0;
    }
  }, []);

  const setUserVolume = useCallback((userId: string, volume: number) => {
    const clampedVolume = Math.max(0, Math.min(2, volume));
    const audio = remoteAudiosRef.current.get(userId);
    if (audio) audio.volume = clampedVolume;
    localStorage.setItem(`userVolume_${userId}`, String(clampedVolume));
    setUserVolumes(prev => ({ ...prev, [userId]: clampedVolume }));
  }, []);

  // PTT handlers
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

  // Connection quality monitoring via getStats()
  const startStatsMonitoring = useCallback(() => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    
    statsIntervalRef.current = setInterval(async () => {
      if (!isConnectedRef.current) return;
      
      let worstQuality: ConnectionQuality = 'excellent';
      
      for (const [userId, pc] of peerConnectionsRef.current) {
        if (pc.connectionState !== 'connected') continue;
        const stats = await getConnectionStats(pc);
        if (stats) {
          if (stats.quality === 'poor') worstQuality = 'poor';
          else if (stats.quality === 'good' && worstQuality === 'excellent') worstQuality = 'good';
          
          // Adaptive bitrate: reduce bitrate on poor connection
          if (stats.packetLoss > 3) {
            pc.getSenders().forEach(async (sender) => {
              if (sender.track?.kind === 'audio') {
                const params = sender.getParameters();
                if (params.encodings?.[0]) {
                  // Reduce bitrate when packet loss is high
                  const newBitrate = stats.packetLoss > 10 ? 32000 : stats.packetLoss > 5 ? 64000 : 96000;
                  params.encodings[0].maxBitrate = newBitrate;
                  try { await sender.setParameters(params); } catch {}
                }
              }
            });
          }
        }
      }
      
      setConnectionQuality(worstQuality);
    }, 3000);
  }, []);

  const createPeerConnection = useCallback((remoteUserId: string): RTCPeerConnection => {
    const existing = peerConnectionsRef.current.get(remoteUserId);
    if (existing) {
      console.log('[Voice] Closing existing connection for:', remoteUserId);
      existing.close();
    }

    // Clean up old ICE restart manager
    const oldIceManager = iceRestartManagersRef.current.get(remoteUserId);
    if (oldIceManager) oldIceManager.cleanup();

    console.log('[Voice] Creating peer connection for:', remoteUserId);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const iceManager = new ICERestartManager();
    iceRestartManagersRef.current.set(remoteUserId, iceManager);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, localStreamRef.current!);
        if (track.kind === 'audio') {
          configureAudioSender(sender);
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
        iceManager.reset();
      } else if (state === "failed") {
        setConnectionQuality("poor");
        iceManager.scheduleRestart(pc);
      } else if (state === "disconnected") {
        setConnectionQuality("poor");
        iceManager.scheduleRestart(pc, () => {
          console.log('[Voice] ICE restarted for', remoteUserId);
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[Voice] ICE state for', remoteUserId, ':', pc.iceConnectionState);
    };

    peerConnectionsRef.current.set(remoteUserId, pc);
    return pc;
  }, [currentUserId, getSavedVolume]);

  const handleSignalRef = useRef<(msg: SignalMessage) => Promise<void>>();
  handleSignalRef.current = async (message: SignalMessage) => {
    if (message.to !== currentUserId || !isConnectedRef.current) return;

    let pc = peerConnectionsRef.current.get(message.from);

    if (message.type === "voice-offer") {
      if (!pc) pc = createPeerConnection(message.from);

      try {
        const mungeSdp = mungeOpusSDP(message.data.sdp);
        const mungedOffer = { ...message.data, sdp: mungeSdp };
        
        await pc.setRemoteDescription(new RTCSessionDescription(mungedOffer));
        const pending = pendingCandidatesRef.current.get(message.from) || [];
        await Promise.all(pending.map(c => pc!.addIceCandidate(c).catch(() => {})));
        pendingCandidatesRef.current.delete(message.from);

        const answer = await pc.createAnswer();
        answer.sdp = mungeOpusSDP(answer.sdp || '');
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
          const mungeSdp = mungeOpusSDP(message.data.sdp);
          const mungedAnswer = { ...message.data, sdp: mungeSdp };
          await pc.setRemoteDescription(new RTCSessionDescription(mungedAnswer));
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
  };

  const initiateConnectionRef = useRef<(remoteUserId: string) => Promise<void>>();
  initiateConnectionRef.current = async (remoteUserId: string) => {
    if (remoteUserId === currentUserId || peerConnectionsRef.current.has(remoteUserId)) return;

    const pc = createPeerConnection(remoteUserId);

    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      offer.sdp = mungeOpusSDP(offer.sdp || '');
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
  };

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
      const BROADCAST_INTERVAL = 150; // Faster updates

      const detectSpeaking = () => {
        if (!analyserRef.current || !isConnectedRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        
        // RMS calculation for better volume detection
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const normalizedLevel = Math.min(rms / 60, 1);

        setAudioLevel(normalizedLevel);

        const speaking = rms > 12 && !isMutedRef.current;
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

  // initiateConnection is now via ref above

  const cleanup = useCallback(async () => {
    isConnectedRef.current = false;

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }

    // Cleanup ICE restart managers
    iceRestartManagersRef.current.forEach(m => m.cleanup());
    iceRestartManagersRef.current.clear();

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();

    remoteAudiosRef.current.forEach((audio) => {
      audio.srcObject = null;
    });
    remoteAudiosRef.current.clear();

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

    // Broadcast empty roster to observers, then clean up
    if (rosterChannelRef.current) {
      try {
        await rosterChannelRef.current.send({
          type: "broadcast",
          event: "voice-roster",
          payload: { users: [] },
        });
      } catch {}
      await supabase.removeChannel(rosterChannelRef.current);
      rosterChannelRef.current = null;
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
        try {
          noiseProcessorRef.current = new AdvancedNoiseProcessor();
          processedStream = await noiseProcessorRef.current.process(rawStream);
          const rnnoiseActive = noiseProcessorRef.current.isRnnoiseActive();
          const impulseActive = noiseProcessorRef.current.isImpulseGateActive();
          const latency = noiseProcessorRef.current.getLatency();
          
          const engines = [
            rnnoiseActive ? 'RNNoise' : null,
            impulseActive ? 'ImpulseGate' : null,
          ].filter(Boolean).join('+') || 'Filters';
          setNoiseEngine(engines);
          
          console.log(`[Voice] Noise processing applied | engine=${engines} | latency=${latency}ms`);
          
          if (!rnnoiseActive) {
            console.warn('[Voice] ⚠️ RNNoise failed to load, using fallback noise processing');
          }
        } catch (noiseErr) {
          console.error('[Voice] Noise processor pipeline failed entirely:', noiseErr);
          setNoiseEngine(null);
        }
      } else {
        console.log('[Voice] Noise suppression disabled in settings');
        setNoiseEngine(null);
      }

      localStreamRef.current = processedStream;

      // Setup channels
      const signalingChannel = supabase.channel(`voice-sig-${channelId}`, {
        config: { broadcast: { self: false } },
      });
      signalingChannelRef.current = signalingChannel;

      signalingChannel.on("broadcast", { event: "voice-signal" }, ({ payload }) => {
        handleSignalRef.current?.(payload as SignalMessage);
      });

      await signalingChannel.subscribe();

      // Setup roster broadcast channel for observers (GroupsSidebar)
      const rosterChannel = supabase.channel(`voice-status-${channelId}`, {
        config: { broadcast: { self: false } },
      });
      rosterChannelRef.current = rosterChannel;
      await rosterChannel.subscribe();

      const presenceChannel = supabase.channel(`voice-pres-${channelId}`, {
        config: { presence: { key: currentUserId } },
      });
      presenceChannelRef.current = presenceChannel;

      presenceChannel.on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const users: VoiceUser[] = [];

        Object.entries(state).forEach(([key, presences]: [string, any[]]) => {
          // Skip observer keys (from useVoicePresence)
          if (key.startsWith("observer-")) return;

          presences.forEach((presence) => {
            if (presence.odId && !presence._observer) {
              users.push({
                odId: presence.odId,
                username: presence.username,
                avatarUrl: presence.avatarUrl,
                isSpeaking: presence.isSpeaking || false,
                isMuted: presence.isMuted || false,
              });
            }
          });
        });

        setConnectedUsers(users);

        // Broadcast roster to observers (GroupsSidebar, etc.)
        rosterChannelRef.current?.send({
          type: "broadcast",
          event: "voice-roster",
          payload: { users },
        });

        users.forEach((u) => {
          if (u.odId !== currentUserId && currentUserId < u.odId) {
            initiateConnectionRef.current?.(u.odId);
          }
        });
      });

      presenceChannel.on("presence", { event: "join" }, ({ key }) => {
        if (key !== currentUserId) {
          if (currentUserId < key) {
            initiateConnectionRef.current?.(key);
          }
        }
      });

      presenceChannel.on("presence", { event: "leave" }, ({ key }) => {
        if (key !== currentUserId) {
          const pc = peerConnectionsRef.current.get(key);
          if (pc) {
            pc.close();
            peerConnectionsRef.current.delete(key);
          }
          const iceManager = iceRestartManagersRef.current.get(key);
          if (iceManager) {
            iceManager.cleanup();
            iceRestartManagersRef.current.delete(key);
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

          // Immediately include self in connected users
          // (presence sync may not have fired yet)
          setConnectedUsers(prev => {
            if (prev.some(u => u.odId === currentUserId)) return prev;
            return [...prev, {
              odId: currentUserId,
              username: currentUsername,
              avatarUrl: currentAvatarUrl,
              isSpeaking: false,
              isMuted: false,
            }];
          });

          // Broadcast initial roster to observers
          const selfUser = {
            odId: currentUserId,
            username: currentUsername,
            avatarUrl: currentAvatarUrl,
            isSpeaking: false,
            isMuted: false,
          };
          rosterChannelRef.current?.send({
            type: "broadcast",
            event: "voice-roster",
            payload: { users: [selfUser] },
          });
        }
      });

      startVoiceDetection(rawStream);
      startStatsMonitoring();

      isConnectedRef.current = true;
      setIsConnected(true);
      setIsConnecting(false);
      setConnectionQuality("good");

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
    startVoiceDetection,
    startStatsMonitoring,
    cleanup,
    onError,
  ]);

  const leave = useCallback(async () => {
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
    noiseEngine,
    setUserVolume,
    join,
    leave,
    toggleMute,
  };
};
