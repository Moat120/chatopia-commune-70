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

interface UseVoiceChannelProps {
  channelId: string;
  onError?: (error: string) => void;
}

export const useVoiceChannel = ({ channelId, onError }: UseVoiceChannelProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState<VoiceUser[]>([]);
  
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false);

  const currentUser = getCurrentUser();

  // Clean up all resources
  const cleanup = useCallback(async () => {
    console.log("[VoiceChannel] Cleaning up resources");
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log("[VoiceChannel] Stopped track:", track.kind);
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
    isSpeakingRef.current = false;
  }, []);

  // Voice activity detection
  const startVoiceDetection = useCallback((stream: MediaStream) => {
    try {
      audioContextRef.current = new AudioContext({ sampleRate: 48000 });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.5;
      source.connect(analyserRef.current);

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      let lastUpdate = 0;
      const UPDATE_INTERVAL = 100; // ms

      const detectSpeaking = () => {
        if (!analyserRef.current || !channelRef.current) {
          animationRef.current = requestAnimationFrame(detectSpeaking);
          return;
        }

        const now = Date.now();
        if (now - lastUpdate < UPDATE_INTERVAL) {
          animationRef.current = requestAnimationFrame(detectSpeaking);
          return;
        }
        lastUpdate = now;

        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const speaking = average > 15 && !isMuted;

        // Only broadcast if speaking state changed
        if (speaking !== isSpeakingRef.current) {
          isSpeakingRef.current = speaking;
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
      console.log("[VoiceChannel] Voice detection started");
    } catch (error) {
      console.error("[VoiceChannel] Voice detection error:", error);
    }
  }, [currentUser, isMuted]);

  // Join the voice channel
  const join = useCallback(async () => {
    if (isConnected || isConnecting) return;
    
    console.log("[VoiceChannel] Joining channel:", channelId);
    setIsConnecting(true);

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      
      streamRef.current = stream;
      console.log("[VoiceChannel] Microphone access granted");

      // Create Supabase Realtime channel
      const channel = supabase.channel(`voice-${channelId}`, {
        config: {
          presence: { key: currentUser.id },
          broadcast: { self: true }
        }
      });

      channelRef.current = channel;

      // Handle presence sync
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
        
        console.log("[VoiceChannel] Users synced:", users.length);
        setConnectedUsers(users);
      });

      // Subscribe to channel
      await new Promise<void>((resolve, reject) => {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log("[VoiceChannel] Subscribed to channel");
            resolve();
          } else if (status === 'CHANNEL_ERROR') {
            reject(new Error('Failed to subscribe to channel'));
          }
        });
      });

      // Track presence
      await channel.track({
        odId: currentUser.id,
        username: currentUser.username,
        avatarUrl: currentUser.avatar_url,
        isSpeaking: false,
        isMuted: false
      });

      setIsConnected(true);
      setIsConnecting(false);
      
      // Start voice detection
      startVoiceDetection(stream);

    } catch (error: any) {
      console.error("[VoiceChannel] Join error:", error);
      await cleanup();
      onError?.(error.message || "Impossible d'accéder au microphone");
    }
  }, [channelId, currentUser, isConnected, isConnecting, cleanup, startVoiceDetection, onError]);

  // Leave the voice channel
  const leave = useCallback(async () => {
    console.log("[VoiceChannel] Leaving channel");
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
      
      // Broadcast mute state
      if (channelRef.current) {
        channelRef.current.track({
          odId: currentUser.id,
          username: currentUser.username,
          avatarUrl: currentUser.avatar_url,
          isSpeaking: false,
          isMuted: newMuted
        });
      }
      
      console.log("[VoiceChannel] Mute toggled:", newMuted);
    }
  }, [currentUser]);

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
    currentUserId: currentUser.id,
    join,
    leave,
    toggleMute
  };
};
