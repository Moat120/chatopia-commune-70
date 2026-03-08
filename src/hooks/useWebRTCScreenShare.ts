import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { 
  RTC_CONFIG, 
  mungeScreenShareSDP, 
  configureScreenShareSender, 
  ICERestartManager 
} from "@/lib/webrtcUtils";

export interface ScreenShareUser {
  odId: string;
  username: string;
  isSharing: boolean;
}

export type ScreenQuality = "720p30" | "1080p60" | "1080p120" | "1440p60" | "1440p120";

export const QUALITY_PRESETS: Record<ScreenQuality, { width: number; height: number; frameRate: number; bitrate: number }> = {
  "720p30": { width: 1280, height: 720, frameRate: 30, bitrate: 6_000_000 },
  "1080p60": { width: 1920, height: 1080, frameRate: 60, bitrate: 12_000_000 },
  "1080p120": { width: 1920, height: 1080, frameRate: 120, bitrate: 15_000_000 },
  "1440p60": { width: 2560, height: 1440, frameRate: 60, bitrate: 20_000_000 },
  "1440p120": { width: 2560, height: 1440, frameRate: 120, bitrate: 25_000_000 },
};

interface ScreenIcePayload {
  candidate: RTCIceCandidateInit;
  connectionRole: "outgoing" | "incoming";
}

interface SignalMessage {
  type: "screen-offer" | "screen-answer" | "screen-ice";
  from: string;
  to: string;
  data: any;
}

interface UseWebRTCScreenShareProps {
  channelId: string;
  onError?: (error: string) => void;
}

export const useWebRTCScreenShare = ({ channelId, onError }: UseWebRTCScreenShareProps) => {
  const { user, profile } = useAuth();
  const [isSharing, setIsSharing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenSharers, setScreenSharers] = useState<ScreenShareUser[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const isSharingRef = useRef(false);
  const currentQualityRef = useRef<ScreenQuality>("1080p60");
  const outgoingConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const incomingConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceManagersRef = useRef<Map<string, ICERestartManager>>(new Map());
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const signalingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidate[]>>(new Map());

  const currentUserId = user?.id || "";
  const currentUsername = profile?.username || "Utilisateur";

  const createIncomingConnection = useCallback((sharerId: string): RTCPeerConnection => {
    console.log(`[ScreenShare] Creating incoming connection from ${sharerId}`);

    const existing = incomingConnectionsRef.current.get(sharerId);
    if (existing) existing.close();
    
    const oldIce = iceManagersRef.current.get(`in-${sharerId}`);
    if (oldIce) oldIce.cleanup();

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const iceManager = new ICERestartManager();
    iceManagersRef.current.set(`in-${sharerId}`, iceManager);

    pc.ontrack = (event) => {
      console.log(`[ScreenShare] Received track from ${sharerId}`, event.streams);
      if (event.streams && event.streams[0]) {
        const stream = event.streams[0];
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.set(sharerId, stream);
          return next;
        });

        // If the track ends, request a fresh offer
        event.track.onended = () => {
          console.log(`[ScreenShare] Remote track ended from ${sharerId}, requesting refresh`);
          setRemoteStreams((prev) => {
            const next = new Map(prev);
            next.delete(sharerId);
            return next;
          });
        };
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && signalingChannelRef.current) {
        const payload: SignalMessage = {
          type: "screen-ice",
          from: currentUserId,
          to: sharerId,
          data: {
            candidate: event.candidate.toJSON(),
            connectionRole: "incoming",
          } satisfies ScreenIcePayload,
        };

        signalingChannelRef.current.send({
          type: "broadcast",
          event: "screen-signal",
          payload,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[ScreenShare] Incoming connection state with ${sharerId}: ${pc.connectionState}`);
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        iceManager.scheduleRestart(pc);
      } else if (pc.connectionState === "connected") {
        iceManager.reset();
      }
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(sharerId);
          return next;
        });
      }
    };

    incomingConnectionsRef.current.set(sharerId, pc);
    return pc;
  }, [currentUserId]);

  const createOutgoingConnection = useCallback((viewerId: string): RTCPeerConnection => {
    console.log(`[ScreenShare] Creating outgoing connection to ${viewerId}`);

    const existing = outgoingConnectionsRef.current.get(viewerId);
    if (existing) existing.close();
    
    const oldIce = iceManagersRef.current.get(`out-${viewerId}`);
    if (oldIce) oldIce.cleanup();

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const iceManager = new ICERestartManager();
    iceManagersRef.current.set(`out-${viewerId}`, iceManager);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, localStreamRef.current!);
        
        if (track.kind === 'video') {
          const preset = QUALITY_PRESETS[currentQualityRef.current];
          configureScreenShareSender(sender, preset);
        }
        
        if (track.kind === 'audio') {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          params.encodings[0].maxBitrate = 192_000; // 192kbps stereo audio
          sender.setParameters(params).catch(() => {});
        }
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && signalingChannelRef.current) {
        const payload: SignalMessage = {
          type: "screen-ice",
          from: currentUserId,
          to: viewerId,
          data: {
            candidate: event.candidate.toJSON(),
            connectionRole: "outgoing",
          } satisfies ScreenIcePayload,
        };

        signalingChannelRef.current.send({
          type: "broadcast",
          event: "screen-signal",
          payload,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[ScreenShare] Outgoing connection state with ${viewerId}: ${pc.connectionState}`);
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        iceManager.scheduleRestart(pc);
      } else if (pc.connectionState === "connected") {
        iceManager.reset();
      }
    };

    outgoingConnectionsRef.current.set(viewerId, pc);
    return pc;
  }, [currentUserId]);

  const sendOfferToViewer = useCallback(async (viewerId: string) => {
    if (!localStreamRef.current || !isSharingRef.current) return;

    console.log(`[ScreenShare] Sending offer to viewer ${viewerId}`);
    const pc = createOutgoingConnection(viewerId);

    try {
      const offer = await pc.createOffer();
      offer.sdp = mungeScreenShareSDP(offer.sdp || '');
      await pc.setLocalDescription(offer);

      signalingChannelRef.current?.send({
        type: "broadcast",
        event: "screen-signal",
        payload: {
          type: "screen-offer",
          from: currentUserId,
          to: viewerId,
          data: offer,
        },
      });
    } catch (error) {
      console.error("[ScreenShare] Offer creation error:", error);
    }
  }, [currentUserId, createOutgoingConnection]);

  const handleSignal = useCallback(async (message: SignalMessage) => {
    if (message.to !== currentUserId) return;

    if (message.type === "screen-offer") {
      const pc = createIncomingConnection(message.from);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(message.data));

        const pendingCandidates = pendingCandidatesRef.current.get(message.from) || [];
        for (const candidate of pendingCandidates) {
          await pc.addIceCandidate(candidate);
        }
        pendingCandidatesRef.current.delete(message.from);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        signalingChannelRef.current?.send({
          type: "broadcast",
          event: "screen-signal",
          payload: {
            type: "screen-answer",
            from: currentUserId,
            to: message.from,
            data: answer,
          },
        });
      } catch (error) {
        console.error("[ScreenShare] Error handling offer:", error);
      }
    } else if (message.type === "screen-answer") {
      const pc = outgoingConnectionsRef.current.get(message.from);
      if (pc && pc.signalingState === "have-local-offer") {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(message.data));

          const pendingCandidates = pendingCandidatesRef.current.get(message.from) || [];
          for (const candidate of pendingCandidates) {
            await pc.addIceCandidate(candidate);
          }
          pendingCandidatesRef.current.delete(message.from);
        } catch (error) {
          console.error("[ScreenShare] Error setting answer:", error);
        }
      }
    } else if (message.type === "screen-ice") {
      const outgoingPc = outgoingConnectionsRef.current.get(message.from);
      const incomingPc = incomingConnectionsRef.current.get(message.from);
      const pc = outgoingPc || incomingPc;

      if (pc) {
        if (pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(message.data));
          } catch (error) {
            console.error("[ScreenShare] ICE candidate error:", error);
          }
        } else {
          const pending = pendingCandidatesRef.current.get(message.from) || [];
          pending.push(new RTCIceCandidate(message.data));
          pendingCandidatesRef.current.set(message.from, pending);
        }
      }
    }
  }, [currentUserId, createIncomingConnection]);

  // Stable refs for callbacks to avoid re-init loops
  const handleSignalRef = useRef(handleSignal);
  handleSignalRef.current = handleSignal;
  const sendOfferRef = useRef(sendOfferToViewer);
  sendOfferRef.current = sendOfferToViewer;

  // Initialize channels — only re-runs on channelId/user change (not on callback changes)
  useEffect(() => {
    if (!channelId || !currentUserId) return;

    let mounted = true;

    const init = async () => {
      console.log(`[ScreenShare] Initializing channels for ${channelId}`);

      const signalingChannel = supabase.channel(`screen-sig-${channelId}`);
      signalingChannelRef.current = signalingChannel;

      signalingChannel.on("broadcast", { event: "screen-signal" }, ({ payload }) => {
        if (mounted) handleSignalRef.current(payload as SignalMessage);
      });

      signalingChannel.on("broadcast", { event: "request-screen" }, async ({ payload }) => {
        if (mounted && payload.broadcasterId === currentUserId && isSharingRef.current) {
          console.log(`[ScreenShare] Received request from ${payload.viewerId}`);
          await sendOfferRef.current(payload.viewerId);
        }
      });

      await signalingChannel.subscribe();

      const presenceChannel = supabase.channel(`screen-pres-${channelId}`, {
        config: { presence: { key: currentUserId } },
      });
      presenceChannelRef.current = presenceChannel;

      presenceChannel.on("presence", { event: "sync" }, () => {
        if (!mounted) return;

        const state = presenceChannel.presenceState();
        const sharers: ScreenShareUser[] = [];

        Object.values(state).forEach((presences: any[]) => {
          presences.forEach((presence) => {
            if (presence.isSharing) {
              sharers.push({
                odId: presence.odId,
                username: presence.username,
                isSharing: true,
              });
            }
          });
        });

        setScreenSharers(sharers);

        // Request streams from sharers we're not yet connected to
        sharers.forEach((sharer) => {
          if (sharer.odId !== currentUserId && !incomingConnectionsRef.current.has(sharer.odId)) {
            console.log(`[ScreenShare] Requesting stream from ${sharer.username} (${sharer.odId})`);
            signalingChannel.send({
              type: "broadcast",
              event: "request-screen",
              payload: {
                broadcasterId: sharer.odId,
                viewerId: currentUserId,
              },
            });
            // Retry after 2s in case the first request was missed
            setTimeout(() => {
              if (!incomingConnectionsRef.current.has(sharer.odId) || 
                  incomingConnectionsRef.current.get(sharer.odId)?.connectionState === 'failed') {
                console.log(`[ScreenShare] Retrying request from ${sharer.odId}`);
                signalingChannel.send({
                  type: "broadcast",
                  event: "request-screen",
                  payload: {
                    broadcasterId: sharer.odId,
                    viewerId: currentUserId,
                  },
                });
              }
            }, 2000);
          }
        });
      });

      // Also handle join events — when a new sharer joins, request their stream immediately
      presenceChannel.on("presence", { event: "join" }, ({ key, newPresences }) => {
        if (!mounted) return;
        newPresences.forEach((presence: any) => {
          if (presence.isSharing && presence.odId !== currentUserId) {
            console.log(`[ScreenShare] New sharer joined: ${presence.username}`);
            setTimeout(() => {
              signalingChannel.send({
                type: "broadcast",
                event: "request-screen",
                payload: {
                  broadcasterId: presence.odId,
                  viewerId: currentUserId,
                },
              });
            }, 500);
          }
          // If WE are sharing and someone new joins, send them an offer
          if (isSharingRef.current && presence.odId !== currentUserId) {
            console.log(`[ScreenShare] New viewer joined: ${presence.odId}, sending offer`);
            setTimeout(() => {
              sendOfferRef.current(presence.odId);
            }, 500);
          }
        });
      });

      presenceChannel.on("presence", { event: "leave" }, ({ key }) => {
        if (!mounted) return;

        const incomingPc = incomingConnectionsRef.current.get(key);
        if (incomingPc) {
          incomingPc.close();
          incomingConnectionsRef.current.delete(key);
        }

        const outgoingPc = outgoingConnectionsRef.current.get(key);
        if (outgoingPc) {
          outgoingPc.close();
          outgoingConnectionsRef.current.delete(key);
        }

        const inIce = iceManagersRef.current.get(`in-${key}`);
        if (inIce) { inIce.cleanup(); iceManagersRef.current.delete(`in-${key}`); }
        const outIce = iceManagersRef.current.get(`out-${key}`);
        if (outIce) { outIce.cleanup(); iceManagersRef.current.delete(`out-${key}`); }

        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      });

      await presenceChannel.subscribe();

      await presenceChannel.track({
        odId: currentUserId,
        username: currentUsername,
        isSharing: false,
      });

      if (mounted) setIsInitialized(true);
    };

    init();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [channelId, currentUserId, currentUsername]);

  // Start screen share — called directly from click handler
  const startScreenShare = useCallback(async (quality: ScreenQuality = "1080p60") => {
    if (!isInitialized) {
      console.log("[ScreenShare] Not initialized yet");
      return null;
    }

    const preset = QUALITY_PRESETS[quality];
    currentQualityRef.current = quality;
    console.log(`[ScreenShare] Starting with quality: ${quality}`, preset);

    try {
      // CRITICAL: getDisplayMedia called directly in user gesture handler
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: preset.width, max: preset.width },
          height: { ideal: preset.height, max: preset.height },
          frameRate: { ideal: preset.frameRate, max: preset.frameRate },
          // @ts-ignore
          cursor: "always",
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: { ideal: 48000 },
          channelCount: { ideal: 2 },
        },
        // @ts-ignore
        preferCurrentTab: false,
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include",
      } as any);

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        // Set content hint for sharp text/UI
        try { (videoTrack as any).contentHint = 'detail'; } catch {}
        // Apply resolution constraints
        try {
          await videoTrack.applyConstraints({
            width: { ideal: preset.width },
            height: { ideal: preset.height },
            frameRate: { ideal: preset.frameRate },
          });
        } catch {}
      }

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        console.log('[ScreenShare] ✅ System audio captured:', audioTracks[0].label);
      }

      localStreamRef.current = stream;
      isSharingRef.current = true;
      setLocalStream(stream);
      setIsSharing(true);

      // Handle stop from browser UI — both ended AND mute events
      if (videoTrack) {
        videoTrack.onended = () => {
          console.log("[ScreenShare] Stream ended by browser (onended)");
          stopScreenShare();
        };
        videoTrack.onmute = () => {
          // Chrome sometimes fires mute before ended when user clicks "Stop sharing"
          console.log("[ScreenShare] Video track muted — checking if ended");
          setTimeout(() => {
            if (videoTrack.readyState === 'ended') {
              stopScreenShare();
            }
          }, 500);
        };
      }

      // Update presence
      await presenceChannelRef.current?.track({
        odId: currentUserId,
        username: currentUsername,
        isSharing: true,
      });

      // Send offers to existing users — retry to ensure presence has propagated
      const broadcastOffers = () => {
        const state = presenceChannelRef.current?.presenceState() || {};
        let sentCount = 0;
        Object.values(state).forEach((presences: any[]) => {
          presences.forEach((presence) => {
            if (presence.odId !== currentUserId) {
              sendOfferRef.current(presence.odId);
              sentCount++;
            }
          });
        });
        return sentCount;
      };

      // First attempt after short delay, retry after 1s if no peers found
      setTimeout(() => {
        const count = broadcastOffers();
        if (count === 0) {
          setTimeout(broadcastOffers, 1000);
        }
      }, 500);

      return stream;
    } catch (error: any) {
      console.error("[ScreenShare] Start error:", error);
      if (error.name !== "NotAllowedError") {
        onError?.(error.message || "Impossible de partager l'écran");
      }
      return null;
    }
  }, [isInitialized, currentUserId, currentUsername, sendOfferToViewer, onError]);

  const stopScreenShare = useCallback(async () => {
    console.log("[ScreenShare] Stopping screen share");

    outgoingConnectionsRef.current.forEach((pc) => pc.close());
    outgoingConnectionsRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    isSharingRef.current = false;
    setLocalStream(null);
    setIsSharing(false);

    await presenceChannelRef.current?.track({
      odId: currentUserId,
      username: currentUsername,
      isSharing: false,
    });
  }, [currentUserId, currentUsername]);

  const cleanup = useCallback(async () => {
    console.log("[ScreenShare] Cleanup");

    outgoingConnectionsRef.current.forEach((pc) => pc.close());
    outgoingConnectionsRef.current.clear();

    incomingConnectionsRef.current.forEach((pc) => pc.close());
    incomingConnectionsRef.current.clear();

    iceManagersRef.current.forEach(m => m.cleanup());
    iceManagersRef.current.clear();

    pendingCandidatesRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (presenceChannelRef.current) {
      await supabase.removeChannel(presenceChannelRef.current);
      presenceChannelRef.current = null;
    }

    if (signalingChannelRef.current) {
      await supabase.removeChannel(signalingChannelRef.current);
      signalingChannelRef.current = null;
    }

    isSharingRef.current = false;
    setIsSharing(false);
    setLocalStream(null);
    setScreenSharers([]);
    setRemoteStreams(new Map());
    setIsInitialized(false);
  }, []);

  // Cleanup on channelId change or unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [channelId]);

  return {
    isSharing,
    localStream,
    screenSharers,
    remoteStreams,
    startScreenShare,
    stopScreenShare,
    cleanup,
  };
};
