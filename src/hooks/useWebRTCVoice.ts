import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUser } from "@/lib/localStorage";

export interface VoiceUser {
  odId: string;
  username: string;
  avatarUrl?: string;
  isSpeaking: boolean;
  isMuted: boolean;
}

export type ConnectionQuality = 'excellent' | 'good' | 'poor' | 'connecting';

interface SignalMessage {
  type: 'offer' | 'answer' | 'ice-candidate';
  from: string;
  to: string;
  data: any;
}

interface UseWebRTCVoiceProps {
  channelId: string;
  onError?: (error: string) => void;
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export const useWebRTCVoice = ({ channelId, onError }: UseWebRTCVoiceProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState<VoiceUser[]>([]);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>('connecting');
  const [audioLevel, setAudioLevel] = useState(0);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const signalingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false);
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const currentUser = getCurrentUser();

  // Create peer connection for a remote user
  const createPeerConnection = useCallback((remoteUserId: string): RTCPeerConnection => {
    console.log(`[WebRTC] Creating peer connection for ${remoteUserId}`);
    
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local audio track
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle incoming audio
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received remote track from ${remoteUserId}`);
      const [remoteStream] = event.streams;
      
      let audio = remoteAudiosRef.current.get(remoteUserId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        (audio as any).playsInline = true;
        remoteAudiosRef.current.set(remoteUserId, audio);
      }
      audio.srcObject = remoteStream;
      audio.play().catch(console.error);
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && signalingChannelRef.current) {
        console.log(`[WebRTC] Sending ICE candidate to ${remoteUserId}`);
        signalingChannelRef.current.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            type: 'ice-candidate',
            from: currentUser.id,
            to: remoteUserId,
            data: event.candidate
          }
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${remoteUserId}: ${pc.connectionState}`);
      if (pc.connectionState === 'connected') {
        setConnectionQuality('excellent');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setConnectionQuality('poor');
      }
    };

    peerConnectionsRef.current.set(remoteUserId, pc);
    return pc;
  }, [currentUser.id]);

  // Handle signaling messages
  const handleSignal = useCallback(async (message: SignalMessage) => {
    if (message.to !== currentUser.id) return;
    
    console.log(`[WebRTC] Received signal: ${message.type} from ${message.from}`);

    let pc = peerConnectionsRef.current.get(message.from);
    
    if (message.type === 'offer') {
      if (!pc) pc = createPeerConnection(message.from);
      
      await pc.setRemoteDescription(new RTCSessionDescription(message.data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      signalingChannelRef.current?.send({
        type: 'broadcast',
        event: 'signal',
        payload: {
          type: 'answer',
          from: currentUser.id,
          to: message.from,
          data: answer
        }
      });
    } else if (message.type === 'answer' && pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(message.data));
    } else if (message.type === 'ice-candidate' && pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(message.data));
      } catch (error) {
        console.error('[WebRTC] ICE candidate error:', error);
      }
    }
  }, [currentUser.id, createPeerConnection]);

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
      const BROADCAST_INTERVAL = 100;

      const detectSpeaking = () => {
        if (!analyserRef.current || !presenceChannelRef.current) {
          animationRef.current = requestAnimationFrame(detectSpeaking);
          return;
        }

        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalizedLevel = Math.min(average / 50, 1);
        
        setAudioLevel(normalizedLevel);
        
        const speaking = average > 15 && !isMuted;
        const now = Date.now();

        if ((speaking !== isSpeakingRef.current) || (now - lastBroadcast > BROADCAST_INTERVAL)) {
          isSpeakingRef.current = speaking;
          lastBroadcast = now;
          
          presenceChannelRef.current.track({
            odId: currentUser.id,
            username: currentUser.username,
            avatarUrl: currentUser.avatar_url,
            isSpeaking: speaking,
            isMuted: isMuted
          });
        }

        animationRef.current = requestAnimationFrame(detectSpeaking);
      };

      detectSpeaking();
    } catch (error) {
      console.error('[WebRTC] Voice detection error:', error);
    }
  }, [currentUser, isMuted]);

  // Initiate connection to a new user
  const initiateConnection = useCallback(async (remoteUserId: string) => {
    if (remoteUserId === currentUser.id) return;
    if (peerConnectionsRef.current.has(remoteUserId)) return;

    console.log(`[WebRTC] Initiating connection to ${remoteUserId}`);
    const pc = createPeerConnection(remoteUserId);
    
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      signalingChannelRef.current?.send({
        type: 'broadcast',
        event: 'signal',
        payload: {
          type: 'offer',
          from: currentUser.id,
          to: remoteUserId,
          data: offer
        }
      });
    } catch (error) {
      console.error('[WebRTC] Offer creation error:', error);
    }
  }, [currentUser.id, createPeerConnection]);

  // Cleanup
  const cleanup = useCallback(async () => {
    console.log('[WebRTC] Cleaning up');
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();

    remoteAudiosRef.current.forEach(audio => {
      audio.srcObject = null;
      audio.remove();
    });
    remoteAudiosRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    if (audioContextRef.current?.state !== 'closed') {
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
    setConnectionQuality('connecting');
    setAudioLevel(0);
  }, []);

  // Join voice channel
  const join = useCallback(async () => {
    if (isConnected || isConnecting) return;
    
    console.log('[WebRTC] Joining channel:', channelId);
    setIsConnecting(true);
    setConnectionQuality('connecting');

    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        }
      });
      
      localStreamRef.current = stream;

      // Setup signaling channel
      const signalingChannel = supabase.channel(`signaling-${channelId}`);
      signalingChannelRef.current = signalingChannel;

      signalingChannel.on('broadcast', { event: 'signal' }, ({ payload }) => {
        handleSignal(payload as SignalMessage);
      });

      await signalingChannel.subscribe();

      // Setup presence channel
      const presenceChannel = supabase.channel(`voice-presence-${channelId}`, {
        config: { presence: { key: currentUser.id } }
      });
      presenceChannelRef.current = presenceChannel;

      presenceChannel.on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const users: VoiceUser[] = [];
        
        Object.values(state).forEach((presences: any[]) => {
          presences.forEach((presence) => {
            users.push({
              odId: presence.odId,
              username: presence.username,
              avatarUrl: presence.avatarUrl,
              isSpeaking: presence.isSpeaking || false,
              isMuted: presence.isMuted || false
            });
          });
        });
        
        setConnectedUsers(users);

        // Initiate connections to new users (only if we have lower ID to avoid duplicates)
        users.forEach(user => {
          if (user.odId !== currentUser.id && currentUser.id < user.odId) {
            initiateConnection(user.odId);
          }
        });
      });

      presenceChannel.on('presence', { event: 'leave' }, ({ key }) => {
        // Clean up peer connection when user leaves
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
      });

      await presenceChannel.subscribe();

      await presenceChannel.track({
        odId: currentUser.id,
        username: currentUser.username,
        avatarUrl: currentUser.avatar_url,
        isSpeaking: false,
        isMuted: false
      });

      setIsConnected(true);
      setIsConnecting(false);
      setConnectionQuality('excellent');
      
      startVoiceDetection(stream);

    } catch (error: any) {
      console.error('[WebRTC] Join error:', error);
      await cleanup();
      onError?.(error.message || "Impossible d'accéder au microphone");
    }
  }, [channelId, currentUser, isConnected, isConnecting, cleanup, handleSignal, initiateConnection, startVoiceDetection, onError]);

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
      setIsMuted(newMuted);
      
      presenceChannelRef.current?.track({
        odId: currentUser.id,
        username: currentUser.username,
        avatarUrl: currentUser.avatar_url,
        isSpeaking: false,
        isMuted: newMuted
      });
    }
  }, [currentUser]);

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
    currentUserId: currentUser.id,
    connectionQuality,
    audioLevel,
    join,
    leave,
    toggleMute
  };
};
