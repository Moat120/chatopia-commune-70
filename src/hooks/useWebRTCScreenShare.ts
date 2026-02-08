import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ScreenShareUser {
  odId: string;
  username: string;
  isSharing: boolean;
}

export type ScreenQuality = "1080p60" | "1080p120" | "1440p60" | "1440p120";

export const QUALITY_PRESETS: Record<ScreenQuality, { width: number; height: number; frameRate: number }> = {
  "1080p60": { width: 1920, height: 1080, frameRate: 60 },
  "1080p120": { width: 1920, height: 1080, frameRate: 120 },
  "1440p60": { width: 2560, height: 1440, frameRate: 60 },
  "1440p120": { width: 2560, height: 1440, frameRate: 120 },
};

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

export const useWebRTCScreenShare = ({ channelId, onError }: UseWebRTCScreenShareProps) => {
  const { user, profile } = useAuth();
  const [isSharing, setIsSharing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenSharers, setScreenSharers] = useState<ScreenShareUser[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const isSharingRef = useRef(false);
  // Connections where we send our screen TO viewers
  const outgoingConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  // Connections where we receive screens FROM sharers
  const incomingConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const signalingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidate[]>>(new Map());

  const currentUserId = user?.id || "";
  const currentUsername = profile?.username || "Utilisateur";

  // Create connection to RECEIVE screen from a sharer
  const createIncomingConnection = useCallback((sharerId: string): RTCPeerConnection => {
    console.log(`[ScreenShare] Creating incoming connection from ${sharerId}`);

    // Close existing connection if any
    const existing = incomingConnectionsRef.current.get(sharerId);
    if (existing) {
      existing.close();
    }

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

    pc.ontrack = (event) => {
      console.log(`[ScreenShare] Received track from ${sharerId}`, event.streams);
      if (event.streams && event.streams[0]) {
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.set(sharerId, event.streams[0]);
          return next;
        });
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && signalingChannelRef.current) {
        console.log(`[ScreenShare] Sending ICE candidate to sharer ${sharerId}`);
        signalingChannelRef.current.send({
          type: "broadcast",
          event: "screen-signal",
          payload: {
            type: "screen-ice",
            from: currentUserId,
            to: sharerId,
            data: event.candidate.toJSON(),
          },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[ScreenShare] Incoming connection state with ${sharerId}: ${pc.connectionState}`);
      if (pc.connectionState === "failed") {
        console.log(`[ScreenShare] Incoming connection failed, restarting ICE for ${sharerId}`);
        pc.restartIce();
      }
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
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

  // Create connection to SEND our screen to a viewer
  const createOutgoingConnection = useCallback((viewerId: string): RTCPeerConnection => {
    console.log(`[ScreenShare] Creating outgoing connection to ${viewerId}`);

    // Close existing connection if any
    const existing = outgoingConnectionsRef.current.get(viewerId);
    if (existing) {
      existing.close();
    }

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

    // Add our local screen tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        console.log(`[ScreenShare] Adding track to outgoing connection: ${track.kind}`);
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && signalingChannelRef.current) {
        console.log(`[ScreenShare] Sending ICE candidate to viewer ${viewerId}`);
        signalingChannelRef.current.send({
          type: "broadcast",
          event: "screen-signal",
          payload: {
            type: "screen-ice",
            from: currentUserId,
            to: viewerId,
            data: event.candidate.toJSON(),
          },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[ScreenShare] Outgoing connection state with ${viewerId}: ${pc.connectionState}`);
      if (pc.connectionState === "failed") {
        console.log(`[ScreenShare] Outgoing connection failed, restarting ICE for ${viewerId}`);
        pc.restartIce();
      }
    };

    outgoingConnectionsRef.current.set(viewerId, pc);
    return pc;
  }, [currentUserId]);

  // Send screen offer to a specific viewer
  const sendOfferToViewer = useCallback(async (viewerId: string) => {
    if (!localStreamRef.current || !isSharingRef.current) {
      console.log(`[ScreenShare] Cannot send offer - no stream or not sharing`);
      return;
    }

    console.log(`[ScreenShare] Sending offer to viewer ${viewerId}`);
    const pc = createOutgoingConnection(viewerId);

    try {
      const offer = await pc.createOffer();
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

  // Handle incoming signals
  const handleSignal = useCallback(async (message: SignalMessage) => {
    if (message.to !== currentUserId) return;

    console.log(`[ScreenShare] Handling signal: ${message.type} from ${message.from}`);

    if (message.type === "screen-offer") {
      // Someone is offering their screen to us (we are a viewer)
      const pc = createIncomingConnection(message.from);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(message.data));

        // Add any pending ICE candidates
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
      // Answer to our screen offer (we are the sharer)
      const pc = outgoingConnectionsRef.current.get(message.from);
      if (pc && pc.signalingState === "have-local-offer") {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(message.data));

          // Add any pending ICE candidates
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
      // ICE candidate from either direction
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
          // Queue the candidate
          const pending = pendingCandidatesRef.current.get(message.from) || [];
          pending.push(new RTCIceCandidate(message.data));
          pendingCandidatesRef.current.set(message.from, pending);
        }
      }
    }
  }, [currentUserId, createIncomingConnection]);

  // Initialize channels
  useEffect(() => {
    if (!channelId || !currentUserId) return;

    let mounted = true;

    const init = async () => {
      console.log(`[ScreenShare] Initializing channels for ${channelId}`);

      // Signaling channel
      const signalingChannel = supabase.channel(`screen-sig-${channelId}`);
      signalingChannelRef.current = signalingChannel;

      signalingChannel.on("broadcast", { event: "screen-signal" }, ({ payload }) => {
        if (mounted) handleSignal(payload as SignalMessage);
      });

      // Handle screen share requests from new viewers
      signalingChannel.on("broadcast", { event: "request-screen" }, async ({ payload }) => {
        if (mounted && payload.broadcasterId === currentUserId && isSharingRef.current) {
          console.log(`[ScreenShare] Received request from ${payload.viewerId}`);
          await sendOfferToViewer(payload.viewerId);
        }
      });

      await signalingChannel.subscribe();

      // Presence channel for tracking sharers
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

        // Request screen from new sharers (if we're not the one sharing)
        sharers.forEach((sharer) => {
          if (sharer.odId !== currentUserId && !incomingConnectionsRef.current.has(sharer.odId)) {
            console.log(`[ScreenShare] Requesting screen from ${sharer.odId}`);
            signalingChannel.send({
              type: "broadcast",
              event: "request-screen",
              payload: {
                broadcasterId: sharer.odId,
                viewerId: currentUserId,
              },
            });
          }
        });
      });

      presenceChannel.on("presence", { event: "leave" }, ({ key }) => {
        if (!mounted) return;
        console.log(`[ScreenShare] User left: ${key}`);

        // Clean up incoming connection
        const incomingPc = incomingConnectionsRef.current.get(key);
        if (incomingPc) {
          incomingPc.close();
          incomingConnectionsRef.current.delete(key);
        }

        // Clean up outgoing connection
        const outgoingPc = outgoingConnectionsRef.current.get(key);
        if (outgoingPc) {
          outgoingPc.close();
          outgoingConnectionsRef.current.delete(key);
        }

        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      });

      await presenceChannel.subscribe();

      // Track initial presence (not sharing)
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
    };
  }, [channelId, currentUserId, currentUsername, handleSignal, sendOfferToViewer]);

  // Start screen share with quality selection
  const startScreenShare = useCallback(async (quality: ScreenQuality = "1080p60") => {
    if (!isInitialized) {
      console.log("[ScreenShare] Not initialized yet");
      return null;
    }

    const preset = QUALITY_PRESETS[quality];
    console.log(`[ScreenShare] Starting with quality: ${quality}`, preset);

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: preset.width },
          height: { ideal: preset.height },
          frameRate: { ideal: preset.frameRate, max: preset.frameRate },
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      localStreamRef.current = stream;
      isSharingRef.current = true;
      setLocalStream(stream);
      setIsSharing(true);

      // Handle stop from browser UI
      stream.getVideoTracks()[0].onended = () => {
        console.log("[ScreenShare] Stream ended by browser");
        stopScreenShare();
      };

      // Update presence to indicate sharing
      await presenceChannelRef.current?.track({
        odId: currentUserId,
        username: currentUsername,
        isSharing: true,
      });

      // Wait a moment for presence to sync, then send offers to all existing users
      setTimeout(() => {
        const state = presenceChannelRef.current?.presenceState() || {};
        Object.values(state).forEach((presences: any[]) => {
          presences.forEach((presence) => {
            if (presence.odId !== currentUserId) {
              sendOfferToViewer(presence.odId);
            }
          });
        });
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

  // Stop screen share
  const stopScreenShare = useCallback(async () => {
    console.log("[ScreenShare] Stopping screen share");

    // Close all outgoing connections
    outgoingConnectionsRef.current.forEach((pc) => pc.close());
    outgoingConnectionsRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    isSharingRef.current = false;
    setLocalStream(null);
    setIsSharing(false);

    // Update presence
    await presenceChannelRef.current?.track({
      odId: currentUserId,
      username: currentUsername,
      isSharing: false,
    });
  }, [currentUserId, currentUsername]);

  // Cleanup
  const cleanup = useCallback(async () => {
    console.log("[ScreenShare] Cleanup");

    outgoingConnectionsRef.current.forEach((pc) => pc.close());
    outgoingConnectionsRef.current.clear();

    incomingConnectionsRef.current.forEach((pc) => pc.close());
    incomingConnectionsRef.current.clear();

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

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
