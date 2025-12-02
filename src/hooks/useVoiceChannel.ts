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

interface UseVoiceChannelProps {
  channelId: string;
  onError?: (error: string) => void;
}

export const useVoiceChannel = ({ channelId, onError }: UseVoiceChannelProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState<VoiceUser[]>([]);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>('connecting');
  const [audioLevel, setAudioLevel] = useState(0);
  
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPingRef = useRef<number>(Date.now());

  const currentUser = getCurrentUser();

  // Monitor connection quality
  const startConnectionMonitor = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }

    pingIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const latency = now - lastPingRef.current;
      
      if (latency < 100) {
        setConnectionQuality('excellent');
      } else if (latency < 300) {
        setConnectionQuality('good');
      } else {
        setConnectionQuality('poor');
      }
      
      lastPingRef.current = now;
    }, 2000);
  }, []);

  // Clean up all resources
  const cleanup = useCallback(async () => {
    console.log("[Voice] Cleaning up resources");
    
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;

    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    setIsMuted(false);
    setConnectedUsers([]);
    setConnectionQuality('connecting');
    setAudioLevel(0);
    isSpeakingRef.current = false;
  }, []);

  // Voice activity detection with audio level
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
      const BROADCAST_INTERVAL = 80;

      const detectSpeaking = () => {
        if (!analyserRef.current || !channelRef.current) {
          animationRef.current = requestAnimationFrame(detectSpeaking);
          return;
        }

        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalizedLevel = Math.min(average / 50, 1);
        
        setAudioLevel(normalizedLevel);
        
        const speaking = average > 12 && !isMuted;
        const now = Date.now();

        // Broadcast state changes
        if ((speaking !== isSpeakingRef.current) || (now - lastBroadcast > BROADCAST_INTERVAL)) {
          isSpeakingRef.current = speaking;
          lastBroadcast = now;
          
          channelRef.current.track({
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
      console.log("[Voice] Detection started");
    } catch (error) {
      console.error("[Voice] Detection error:", error);
    }
  }, [currentUser, isMuted]);

  // Join the voice channel
  const join = useCallback(async () => {
    if (isConnected || isConnecting) return;
    
    console.log("[Voice] Joining:", channelId);
    setIsConnecting(true);
    setConnectionQuality('connecting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      
      streamRef.current = stream;

      const channel = supabase.channel(`voice-${channelId}`, {
        config: {
          presence: { key: currentUser.id },
          broadcast: { self: true }
        }
      });

      channelRef.current = channel;

      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
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
      });

      await new Promise<void>((resolve, reject) => {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            resolve();
          } else if (status === 'CHANNEL_ERROR') {
            reject(new Error('Erreur de connexion au canal'));
          }
        });
      });

      await channel.track({
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
      startConnectionMonitor();

    } catch (error: any) {
      console.error("[Voice] Join error:", error);
      await cleanup();
      onError?.(error.message || "Impossible d'accéder au microphone");
    }
  }, [channelId, currentUser, isConnected, isConnecting, cleanup, startVoiceDetection, startConnectionMonitor, onError]);

  // Leave the voice channel
  const leave = useCallback(async () => {
    await cleanup();
  }, [cleanup]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (!streamRef.current) return;
    
    const audioTrack = streamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      const newMuted = !audioTrack.enabled;
      audioTrack.enabled = !newMuted;
      setIsMuted(newMuted);
      
      if (channelRef.current) {
        channelRef.current.track({
          odId: currentUser.id,
          username: currentUser.username,
          avatarUrl: currentUser.avatar_url,
          isSpeaking: false,
          isMuted: newMuted
        });
      }
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
