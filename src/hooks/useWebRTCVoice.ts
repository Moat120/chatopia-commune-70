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
  timeoutMs = 5000
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
  const observerChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const presencePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const joinWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
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

  const clearOwnVoiceChannels = useCallback(async () => {
    // Only remove signaling and presence channels (NOT roster/status — observer may share it)
    const exactTopics = [
      `realtime:voice-sig-${channelId}`,
      `realtime:voice-pres-${channelId}`,
    ];

    const channels = supabase.getChannels();
    const ours = channels.filter((ch) => {
      const topic = String((ch as any)?.topic || "");
      return exactTopics.includes(topic);
    });

    if (ours.length > 0) {
      console.log("[Voice] Cleaning up stale channels:", ours.map((c: any) => c?.topic));
      await Promise.all(ours.map((ch) => supabase.removeChannel(ch).catch(() => {})));
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

    if (presencePollRef.current) {
      clearInterval(presencePollRef.current);
      presencePollRef.current = null;
    }

    if (joinWatchdogRef.current) {
      clearTimeout(joinWatchdogRef.current);
      joinWatchdogRef.current = null;
    }

    // Cancel all pending leave timers
    leaveTimersRef.current.forEach(t => clearTimeout(t));
    leaveTimersRef.current.clear();

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
      audioContextRef.current?.close().catch(() => {});
      audioContextRef.current = null;
    }

    // Untrack presence and remove channels with a hard timeout to NEVER hang
    const channelCleanup = async () => {
      if (presenceChannelRef.current) {
        try { await presenceChannelRef.current.untrack(); } catch {}
        try { supabase.removeChannel(presenceChannelRef.current); } catch {}
        presenceChannelRef.current = null;
      }
      if (signalingChannelRef.current) {
        try { supabase.removeChannel(signalingChannelRef.current); } catch {}
        signalingChannelRef.current = null;
      }
      if (rosterChannelRef.current) {
        try { supabase.removeChannel(rosterChannelRef.current); } catch {}
        rosterChannelRef.current = null;
      }
      if (observerChannelRef.current) {
        // Broadcast empty roster before removing so observers see "nobody"
        try { observerChannelRef.current.send({ type: "broadcast", event: "voice-roster", payload: { users: [] } }); } catch {}
        try { supabase.removeChannel(observerChannelRef.current); } catch {}
        observerChannelRef.current = null;
      }
    };

    // Hard 2s timeout on channel cleanup — never block leaving
    await Promise.race([
      channelCleanup(),
      new Promise(r => setTimeout(r, 2000)),
    ]);

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
    }, 12000);

    try {
      // Parallelize: TURN fetch + getUserMedia + stale channel cleanup all at once
      const [turnResult, rawStream] = await Promise.all([
        // TURN credentials (non-critical, fallback to static)
        withTimeout(getDynamicRtcConfig(), 3000, "TURN config")
          .then(config => { rtcConfigRef.current = config; console.log('[Voice] Using ICE config with', config.iceServers?.length, 'servers'); return config; })
          .catch(err => { console.warn('[Voice] TURN config unavailable, using static', err); rtcConfigRef.current = RTC_CONFIG; return RTC_CONFIG; }),
        // getUserMedia
        withTimeout(
          navigator.mediaDevices.getUserMedia({ audio: await getOptimizedAudioConstraints() }),
          5000,
          "getUserMedia"
        ),
        // Cleanup stale channels in parallel
        clearOwnVoiceChannels(),
      ]);

      rawStreamRef.current = rawStream;

      const audioTrack = rawStream.getAudioTracks()[0];
      if (audioTrack) {
        console.log('[Voice] Applied audio settings:', audioTrack.getSettings());
      }

      // Apply noise processor (non-blocking, runs in parallel)
      let processedStream = rawStream;
      const noisePromise = getNoiseSuppression()
        ? (async () => {
            try {
              noiseProcessorRef.current = new AdvancedNoiseProcessor();
              processedStream = await withTimeout(noiseProcessorRef.current.process(rawStream), 3000, "noise processor");
              const rnnoiseActive = noiseProcessorRef.current.isRnnoiseActive();
              const impulseActive = noiseProcessorRef.current.isImpulseGateActive();
              const engines = [rnnoiseActive ? 'RNNoise' : null, impulseActive ? 'ImpulseGate' : null].filter(Boolean).join('+') || 'Filters';
              setNoiseEngine(engines);
              console.log(`[Voice] Noise processing applied | engine=${engines} | latency=${noiseProcessorRef.current.getLatency()}ms`);
            } catch (noiseErr) {
              console.error('[Voice] Noise processor failed:', noiseErr);
              setNoiseEngine(null);
            }
          })()
        : (() => { setNoiseEngine(null); return Promise.resolve(); })();

      // Setup ALL channels
      const signalingChannel = supabase.channel(`voice-sig-${channelId}`, {
        config: { broadcast: { self: false } },
      });
      signalingChannelRef.current = signalingChannel;
      signalingChannel.on("broadcast", { event: "voice-signal" }, ({ payload }) => {
        handleSignalRef.current?.(payload as SignalMessage);
      });

      const rosterChannel = supabase.channel(`voice-status-${channelId}`, {
        config: { broadcast: { self: false } },
      });
      rosterChannelRef.current = rosterChannel;

      const observerChannel = supabase.channel(`voice-obs-${channelId}`, {
        config: { broadcast: { self: false } },
      });
      observerChannelRef.current = observerChannel;

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

        // Ensure local user is always included
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

        // Broadcast roster to observers (fire-and-forget)
        const rosterPayload = { type: "broadcast" as const, event: "voice-roster", payload: { users } };
        rosterChannelRef.current?.send(rosterPayload).catch(() => {});
        observerChannelRef.current?.send(rosterPayload).catch(() => {});

        // Initiate WebRTC connections for remote users
        users.forEach((u) => {
          if (u.odId !== currentUserId && !peerConnectionsRef.current.has(u.odId)) {
            if (currentUserId < u.odId) {
              initiateConnectionRef.current?.(u.odId);
            }
          }
        });
      };

      presenceChannel.on("presence", { event: "sync" }, syncPresenceState);

      presenceChannel.on("presence", { event: "join" }, ({ key, newPresences }) => {
        if (key.startsWith("observer-")) return;

        const joinedUserIds = new Set<string>();
        if (key && key !== currentUserId) joinedUserIds.add(key);
        if (Array.isArray(newPresences)) {
          newPresences.forEach((p: any) => {
            const id = String(p?.odId || "");
            if (id && id !== currentUserId && !id.startsWith("observer-") && !p?._observer) {
              joinedUserIds.add(id);
            }
          });
        }

        joinedUserIds.forEach((joinedUserId) => {
          const leaveTimer = leaveTimersRef.current.get(joinedUserId);
          if (leaveTimer) {
            clearTimeout(leaveTimer);
            leaveTimersRef.current.delete(joinedUserId);
          }

          if (!peerConnectionsRef.current.has(joinedUserId) && currentUserId < joinedUserId) {
            initiateConnectionRef.current?.(joinedUserId);
          }
        });

        syncPresenceState();
      });

      presenceChannel.on("presence", { event: "leave" }, ({ key }) => {
        if (key.startsWith("observer-")) return;
        if (key !== currentUserId) {
          const existingTimer = leaveTimersRef.current.get(key);
          if (existingTimer) clearTimeout(existingTimer);

          leaveTimersRef.current.set(key, setTimeout(() => {
            leaveTimersRef.current.delete(key);
            const state = presenceChannelRef.current?.presenceState() || {};
            const stillPresent = Object.entries(state).some(([k, presences]: [string, any[]]) =>
              k === key || presences.some((p: any) => p.odId === key)
            );
            if (stillPresent) return;
            removePeer(key);
            syncPresenceState();
          }, 3000));
        }
      });

      // Subscribe ALL channels in parallel — only signaling + presence are critical
      // Roster and observer are best-effort (don't block join)
      await Promise.all([
        noisePromise,
        subscribeChannel(signalingChannel, "signaling"),
        subscribeChannel(presenceChannel, "presence"),
        // Non-critical: fire-and-forget
        subscribeChannel(rosterChannel, "roster", 3000).catch(e => console.warn("[Voice] Roster unavailable", e)),
        subscribeChannel(observerChannel, "observer", 3000).catch(e => console.warn("[Voice] Observer unavailable", e)),
      ]);

      // Use the processed stream
      localStreamRef.current = processedStream;

      // Track presence (don't block on ack)
      presenceChannel.track({
        odId: currentUserId,
        username: currentUsername,
        avatarUrl: currentPresenceAvatar,
        isSpeaking: false,
        isMuted: false,
      }).catch(err => console.warn("[Voice] Presence track delayed", err));

      // Mark connected BEFORE syncing so the self-add fallback works
      isConnectedRef.current = true;

      // Immediately sync presence state
      syncPresenceState();

      // Broadcast initial roster (fire-and-forget)
      const initialRoster = { type: "broadcast" as const, event: "voice-roster", payload: { users: [{ odId: currentUserId, username: currentUsername, avatarUrl: currentPresenceAvatar, isSpeaking: false, isMuted: false }] } };
      rosterChannelRef.current?.send(initialRoster).catch(() => {});
      observerChannelRef.current?.send(initialRoster).catch(() => {});

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
    clearOwnVoiceChannels,
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
