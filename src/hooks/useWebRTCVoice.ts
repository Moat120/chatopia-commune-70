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
  getDynamicRtcConfig,
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

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[Voice] ${label} timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
};

const subscribeChannel = (
  channel: ReturnType<typeof supabase.channel>,
  label: string,
  timeoutMs = 15000
): Promise<void> => {
  return new Promise((resolve, reject) => {
    let done = false;
    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(`[Voice] ${label} subscribe timeout`));
    }, timeoutMs);

    channel.subscribe((status, err) => {
      if (done) return;

      if (status === "SUBSCRIBED") {
        done = true;
        clearTimeout(timeout);
        resolve();
        return;
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        done = true;
        clearTimeout(timeout);
        reject(new Error(`[Voice] ${label} subscribe failed (${status})${err ? `: ${JSON.stringify(err)}` : ""}`));
      }
    });
  });
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
  const presencePollRef = useRef<NodeJS.Timeout | null>(null);
  const joinWatchdogRef = useRef<NodeJS.Timeout | null>(null);
  const isSpeakingRef = useRef(false);
  const isMutedRef = useRef(false);
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const isConnectedRef = useRef(false);
  const pttEnabledRef = useRef(getPushToTalkEnabled());

  const currentUserId = user?.id || "";
  const currentUsername = profile?.username || "Utilisateur";
  const rawAvatarUrl = profile?.avatar_url || "";
  const currentPresenceAvatar =
    rawAvatarUrl && !rawAvatarUrl.startsWith("data:") && rawAvatarUrl.length < 1024
      ? rawAvatarUrl
      : undefined;

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

  const rtcConfigRef = useRef<RTCConfiguration>(RTC_CONFIG);

  const clearConflictingVoiceChannels = useCallback(async () => {
    const topicSuffixes = [
      `voice-sig-${channelId}`,
      `voice-status-${channelId}`,
      `voice-pres-${channelId}`,
    ];

    const channels = supabase.getChannels();
    const conflicting = channels.filter((ch) => {
      const topic = String((ch as any)?.topic || "");
      return topicSuffixes.some((suffix) => topic.endsWith(suffix));
    });

    if (conflicting.length > 0) {
      console.warn("[Voice] Removing conflicting realtime channels:", conflicting.map((c: any) => c?.topic));
      await Promise.all(conflicting.map((ch) => supabase.removeChannel(ch)));
    }
  }, [channelId]);

  const removePeer = useCallback((remoteUserId: string) => {
    console.log('[Voice] Removing dead peer:', remoteUserId);
    const pc = peerConnectionsRef.current.get(remoteUserId);
    if (pc) { pc.close(); peerConnectionsRef.current.delete(remoteUserId); }
    const im = iceRestartManagersRef.current.get(remoteUserId);
    if (im) { im.cleanup(); iceRestartManagersRef.current.delete(remoteUserId); }
    const audio = remoteAudiosRef.current.get(remoteUserId);
    if (audio) { audio.srcObject = null; remoteAudiosRef.current.delete(remoteUserId); }
    pendingCandidatesRef.current.delete(remoteUserId);
    setConnectedUsers(prev => prev.filter(u => u.odId !== remoteUserId));
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
    const pc = new RTCPeerConnection(rtcConfigRef.current);
    const iceManager = new ICERestartManager(() => {
      // Called when all restart attempts exhausted — peer is dead
      console.warn('[Voice] Peer permanently disconnected:', remoteUserId);
      removePeer(remoteUserId);
    });
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
  }, [currentUserId, getSavedVolume, removePeer]);

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
            avatarUrl: currentPresenceAvatar,
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
  }, [currentUserId, currentUsername, currentPresenceAvatar]);

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

    if (joinWatchdogRef.current) {
      clearTimeout(joinWatchdogRef.current);
      joinWatchdogRef.current = null;
    }

    if (presenceChannelRef.current) {
      await supabase.removeChannel(presenceChannelRef.current);
      presenceChannelRef.current = null;
    }

    if (signalingChannelRef.current) {
      await supabase.removeChannel(signalingChannelRef.current);
      signalingChannelRef.current = null;
    }

    if (rosterChannelRef.current) {
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

    if (joinWatchdogRef.current) {
      clearTimeout(joinWatchdogRef.current);
      joinWatchdogRef.current = null;
    }

    joinWatchdogRef.current = setTimeout(() => {
      if (!isConnectedRef.current) {
        console.error("[Voice] Join watchdog timeout");
        onError?.("Connexion vocale expirée, réessaie.");
        cleanup();
      }
    }, 20000);

    try {
      // Fetch dynamic TURN credentials first (fallback fast if function is slow)
      try {
        const dynamicConfig = await withTimeout(getDynamicRtcConfig(), 8000, "TURN config");
        rtcConfigRef.current = dynamicConfig;
        console.log('[Voice] Using ICE config with', dynamicConfig.iceServers?.length, 'servers');
      } catch (turnError) {
        console.warn('[Voice] TURN config unavailable, fallback to static RTC config', turnError);
        rtcConfigRef.current = RTC_CONFIG;
      }

      const audioConstraints = await getOptimizedAudioConstraints();
      console.log('[Voice] Getting media with constraints:', audioConstraints);

      const rawStream = await withTimeout(
        navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
        }),
        10000,
        "getUserMedia"
      );
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
          processedStream = await withTimeout(
            noiseProcessorRef.current.process(rawStream),
            5000,
            "noise processor"
          );
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

      // Ensure no observer/stale channel is already joined on same realtime topics
      await clearConflictingVoiceChannels();

      // Setup channels
      const signalingChannel = supabase.channel(`voice-sig-${channelId}`, {
        config: { broadcast: { self: false } },
      });
      signalingChannelRef.current = signalingChannel;

      signalingChannel.on("broadcast", { event: "voice-signal" }, ({ payload }) => {
        handleSignalRef.current?.(payload as SignalMessage);
      });

      await subscribeChannel(signalingChannel, "signaling");

      // Setup roster broadcast channel for observers (non-critical)
      const rosterChannel = supabase.channel(`voice-status-${channelId}`, {
        config: { broadcast: { self: false } },
      });
      rosterChannelRef.current = rosterChannel;
      try {
        await subscribeChannel(rosterChannel, "roster");
      } catch (rosterError) {
        console.warn("[Voice] Roster channel unavailable, continuing without observer roster sync", rosterError);
      }

      const presenceChannel = supabase.channel(`voice-pres-${channelId}`, {
        config: { presence: { key: currentUserId } },
      });
      presenceChannelRef.current = presenceChannel;

      // Shared function to read presence state and update connectedUsers + initiate WebRTC
      const syncPresenceState = () => {
        const ch = presenceChannelRef.current;
        if (!ch) return;
        const state = ch.presenceState();
        const userMap = new Map<string, VoiceUser>();

        Object.entries(state).forEach(([key, presences]: [string, any[]]) => {
          if (key.startsWith("observer-")) return;
          presences.forEach((presence) => {
            if (presence.odId && !presence._observer) {
              userMap.set(presence.odId, {
                odId: presence.odId,
                username: presence.username,
                avatarUrl: presence.avatarUrl,
                isSpeaking: presence.isSpeaking || false,
                isMuted: presence.isMuted || false,
              });
            }
          });
        });

        const users = Array.from(userMap.values());

        // Ensure local user is always included (in case track hasn't propagated yet)
        if (isConnectedRef.current && !userMap.has(currentUserId)) {
          users.push({
            odId: currentUserId,
            username: currentUsername,
            avatarUrl: currentPresenceAvatar,
            isSpeaking: false,
            isMuted: isMutedRef.current,
          });
        }

        setConnectedUsers(users);

        // Broadcast roster to observers
        rosterChannelRef.current?.send({
          type: "broadcast",
          event: "voice-roster",
          payload: { users },
        });

        // Initiate WebRTC connections for ALL remote users (both directions try)
        users.forEach((u) => {
          if (u.odId !== currentUserId && !peerConnectionsRef.current.has(u.odId)) {
            // Only the user with the smaller ID initiates
            if (currentUserId < u.odId) {
              initiateConnectionRef.current?.(u.odId);
            }
          }
        });
      };

      presenceChannel.on("presence", { event: "sync" }, syncPresenceState);

      presenceChannel.on("presence", { event: "join" }, ({ key, newPresences }) => {
        const joinedUserIds = [
          key,
          ...(Array.isArray(newPresences)
            ? newPresences.map((p: any) => String(p?.odId || "")).filter(Boolean)
            : []),
        ];

        joinedUserIds.forEach((joinedUserId) => {
          if (joinedUserId !== currentUserId && currentUserId < joinedUserId) {
            initiateConnectionRef.current?.(joinedUserId);
          }
        });
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

      await subscribeChannel(presenceChannel, "presence");

      // Do not block connection forever on presence track ack
      try {
        await withTimeout(
          presenceChannel.track({
            odId: currentUserId,
            username: currentUsername,
            avatarUrl: currentPresenceAvatar,
            isSpeaking: false,
            isMuted: false,
          }),
          4000,
          "presence track"
        );
      } catch (trackError) {
        console.warn("[Voice] Presence track delayed, continuing join", trackError);
      }

      // Immediately include self in connected users
      // (presence sync may not have fired yet)
      setConnectedUsers(prev => {
        if (prev.some(u => u.odId === currentUserId)) return prev;
        return [...prev, {
          odId: currentUserId,
          username: currentUsername,
          avatarUrl: currentPresenceAvatar,
          isSpeaking: false,
          isMuted: false,
        }];
      });

      // Broadcast initial roster to observers
      const selfUser = {
        odId: currentUserId,
        username: currentUsername,
        avatarUrl: currentPresenceAvatar,
        isSpeaking: false,
        isMuted: false,
      };
      rosterChannelRef.current?.send({
        type: "broadcast",
        event: "voice-roster",
        payload: { users: [selfUser] },
      });

      startVoiceDetection(rawStream);
      startStatsMonitoring();

      // Periodic presence state poll — catches missed sync events
      if (presencePollRef.current) clearInterval(presencePollRef.current);
      presencePollRef.current = setInterval(() => {
        if (!isConnectedRef.current || !presenceChannelRef.current) return;
        syncPresenceState();
      }, 3000);

      if (joinWatchdogRef.current) {
        clearTimeout(joinWatchdogRef.current);
        joinWatchdogRef.current = null;
      }

      isConnectedRef.current = true;
      setIsConnected(true);
      setIsConnecting(false);
      setConnectionQuality("good");
      return true;

    } catch (error: any) {
      console.error("[Voice] Join error:", error);
      onError?.(error.message || "Failed to join voice channel");
      if (joinWatchdogRef.current) {
        clearTimeout(joinWatchdogRef.current);
        joinWatchdogRef.current = null;
      }
      setIsConnecting(false);
      cleanup();
      return false;
    }
  }, [
    channelId,
    currentUserId,
    currentUsername,
    currentPresenceAvatar,
    isConnecting,
    clearConflictingVoiceChannels,
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
        avatarUrl: currentPresenceAvatar,
        isSpeaking: false,
        isMuted: newMuted,
      });
    }
  }, [isMuted, currentUserId, currentUsername, currentPresenceAvatar]);

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
