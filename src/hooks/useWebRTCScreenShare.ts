import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUser } from "@/lib/localStorage";

export interface ScreenShareUser {
  odId: string;
  username: string;
  isSharing: boolean;
  stream?: MediaStream;
}

interface SignalMessage {
  type: 'screen-offer' | 'screen-answer' | 'screen-ice';
  from: string;
  to: string;
  data: any;
}

interface UseWebRTCScreenShareProps {
  channelId: string;
  onError?: (error: string) => void;
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export const useWebRTCScreenShare = ({ channelId, onError }: UseWebRTCScreenShareProps) => {
  const [isSharing, setIsSharing] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenSharers, setScreenSharers] = useState<ScreenShareUser[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const localStreamRef = useRef<MediaStream | null>(null);
  const viewerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const broadcasterConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const signalingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const currentUser = getCurrentUser();

  // Create viewer connection to receive screen share
  const createViewerConnection = useCallback((broadcasterId: string): RTCPeerConnection => {
    console.log(`[ScreenShare] Creating viewer connection for ${broadcasterId}`);
    
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.ontrack = (event) => {
      console.log(`[ScreenShare] Received remote stream from ${broadcasterId}`);
      const [remoteStream] = event.streams;
      setRemoteStreams(prev => new Map(prev).set(broadcasterId, remoteStream));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && signalingChannelRef.current) {
        signalingChannelRef.current.send({
          type: 'broadcast',
          event: 'screen-signal',
          payload: {
            type: 'screen-ice',
            from: currentUser.id,
            to: broadcasterId,
            data: event.candidate
          }
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[ScreenShare] Viewer connection state: ${pc.connectionState}`);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setRemoteStreams(prev => {
          const next = new Map(prev);
          next.delete(broadcasterId);
          return next;
        });
      }
    };

    broadcasterConnectionsRef.current.set(broadcasterId, pc);
    return pc;
  }, [currentUser.id]);

  // Create broadcaster connection to send screen share
  const createBroadcasterConnection = useCallback((viewerId: string): RTCPeerConnection => {
    console.log(`[ScreenShare] Creating broadcaster connection for ${viewerId}`);
    
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && signalingChannelRef.current) {
        signalingChannelRef.current.send({
          type: 'broadcast',
          event: 'screen-signal',
          payload: {
            type: 'screen-ice',
            from: currentUser.id,
            to: viewerId,
            data: event.candidate
          }
        });
      }
    };

    viewerConnectionsRef.current.set(viewerId, pc);
    return pc;
  }, [currentUser.id]);

  // Handle signaling
  const handleSignal = useCallback(async (message: SignalMessage) => {
    if (message.to !== currentUser.id) return;
    
    console.log(`[ScreenShare] Signal: ${message.type} from ${message.from}`);

    if (message.type === 'screen-offer') {
      // Someone is offering their screen to us
      let pc = broadcasterConnectionsRef.current.get(message.from);
      if (!pc) pc = createViewerConnection(message.from);
      
      await pc.setRemoteDescription(new RTCSessionDescription(message.data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      signalingChannelRef.current?.send({
        type: 'broadcast',
        event: 'screen-signal',
        payload: {
          type: 'screen-answer',
          from: currentUser.id,
          to: message.from,
          data: answer
        }
      });
    } else if (message.type === 'screen-answer') {
      // Answer to our screen offer
      const pc = viewerConnectionsRef.current.get(message.from);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(message.data));
      }
    } else if (message.type === 'screen-ice') {
      // ICE candidate
      const viewerPc = viewerConnectionsRef.current.get(message.from);
      const broadcasterPc = broadcasterConnectionsRef.current.get(message.from);
      const pc = viewerPc || broadcasterPc;
      
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(message.data));
        } catch (error) {
          console.error('[ScreenShare] ICE error:', error);
        }
      }
    }
  }, [currentUser.id, createViewerConnection]);

  // Send offer to a viewer
  const sendOfferToViewer = useCallback(async (viewerId: string) => {
    if (!localStreamRef.current) return;
    
    let pc = viewerConnectionsRef.current.get(viewerId);
    if (!pc) pc = createBroadcasterConnection(viewerId);
    
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      signalingChannelRef.current?.send({
        type: 'broadcast',
        event: 'screen-signal',
        payload: {
          type: 'screen-offer',
          from: currentUser.id,
          to: viewerId,
          data: offer
        }
      });
    } catch (error) {
      console.error('[ScreenShare] Offer error:', error);
    }
  }, [currentUser.id, createBroadcasterConnection]);

  // Initialize channels
  const initChannels = useCallback(async () => {
    // Signaling channel
    const signalingChannel = supabase.channel(`screen-signaling-${channelId}`);
    signalingChannelRef.current = signalingChannel;

    signalingChannel.on('broadcast', { event: 'screen-signal' }, ({ payload }) => {
      handleSignal(payload as SignalMessage);
    });

    // Request to view screen share
    signalingChannel.on('broadcast', { event: 'request-screen' }, async ({ payload }) => {
      if (payload.broadcasterId === currentUser.id && isSharing) {
        await sendOfferToViewer(payload.viewerId);
      }
    });

    await signalingChannel.subscribe();

    // Presence channel for screen sharers
    const presenceChannel = supabase.channel(`screen-presence-${channelId}`, {
      config: { presence: { key: currentUser.id } }
    });
    presenceChannelRef.current = presenceChannel;

    presenceChannel.on('presence', { event: 'sync' }, () => {
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

      // Request screen from new sharers
      sharers.forEach(sharer => {
        if (sharer.odId !== currentUser.id && !broadcasterConnectionsRef.current.has(sharer.odId)) {
          signalingChannelRef.current?.send({
            type: 'broadcast',
            event: 'request-screen',
            payload: {
              broadcasterId: sharer.odId,
              viewerId: currentUser.id
            }
          });
        }
      });
    });

    presenceChannel.on('presence', { event: 'leave' }, ({ key }) => {
      // Clean up when sharer leaves
      const pc = broadcasterConnectionsRef.current.get(key);
      if (pc) {
        pc.close();
        broadcasterConnectionsRef.current.delete(key);
      }
      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    });

    await presenceChannel.subscribe();

    await presenceChannel.track({
      odId: currentUser.id,
      username: currentUser.username,
      isSharing: false
    });
  }, [channelId, currentUser, handleSignal, isSharing, sendOfferToViewer]);

  // Start screen share
  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60, max: 60 },
        },
        audio: true,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsSharing(true);

      // Handle stop from browser UI
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

      // Update presence
      await presenceChannelRef.current?.track({
        odId: currentUser.id,
        username: currentUser.username,
        isSharing: true
      });

      // Send offers to existing viewers
      const state = presenceChannelRef.current?.presenceState() || {};
      Object.values(state).forEach((presences: any[]) => {
        presences.forEach((presence) => {
          if (presence.odId !== currentUser.id) {
            sendOfferToViewer(presence.odId);
          }
        });
      });

      return stream;
    } catch (error: any) {
      console.error('[ScreenShare] Start error:', error);
      if (error.name !== 'NotAllowedError') {
        onError?.(error.message || "Impossible de partager l'écran");
      }
      return null;
    }
  }, [currentUser, sendOfferToViewer, onError]);

  // Stop screen share
  const stopScreenShare = useCallback(async () => {
    // Close all viewer connections
    viewerConnectionsRef.current.forEach(pc => pc.close());
    viewerConnectionsRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    setLocalStream(null);
    setIsSharing(false);

    // Update presence
    await presenceChannelRef.current?.track({
      odId: currentUser.id,
      username: currentUser.username,
      isSharing: false
    });
  }, [currentUser]);

  // Cleanup
  const cleanup = useCallback(async () => {
    viewerConnectionsRef.current.forEach(pc => pc.close());
    viewerConnectionsRef.current.clear();
    
    broadcasterConnectionsRef.current.forEach(pc => pc.close());
    broadcasterConnectionsRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
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

    setIsSharing(false);
    setLocalStream(null);
    setScreenSharers([]);
    setRemoteStreams(new Map());
  }, []);

  // Initialize on mount
  useEffect(() => {
    initChannels();
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
    cleanup
  };
};
