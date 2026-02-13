import { useState, useEffect, useRef, useCallback } from "react";

export interface LatencyStats {
  ping: number; // Current latency in ms
  jitter: number; // Variation in latency
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  isConnected: boolean;
}

interface UseConnectionLatencyProps {
  peerConnection: RTCPeerConnection | null;
  enabled?: boolean;
}

export const useConnectionLatency = ({ 
  peerConnection, 
  enabled = true 
}: UseConnectionLatencyProps): LatencyStats => {
  const [stats, setStats] = useState<LatencyStats>({
    ping: 0,
    jitter: 0,
    quality: 'excellent',
    isConnected: false,
  });

  const previousRtt = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const getQualityFromPing = (ping: number): LatencyStats['quality'] => {
    if (ping <= 50) return 'excellent';
    if (ping <= 100) return 'good';
    if (ping <= 200) return 'fair';
    return 'poor';
  };

  const measureLatency = useCallback(async () => {
    if (!peerConnection || peerConnection.connectionState !== 'connected') {
      setStats(prev => ({ ...prev, isConnected: false }));
      return;
    }

    try {
      const statsReport = await peerConnection.getStats();
      let currentRtt = 0;

      statsReport.forEach((report) => {
        // Check for candidate-pair stats (most accurate RTT)
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (report.currentRoundTripTime !== undefined) {
            currentRtt = report.currentRoundTripTime * 1000; // Convert to ms
          }
        }
        
        // Fallback to remote-inbound-rtp for audio
        if (report.type === 'remote-inbound-rtp' && report.kind === 'audio') {
          if (report.roundTripTime !== undefined) {
            currentRtt = report.roundTripTime * 1000;
          }
        }
      });

      // Calculate jitter
      const jitter = previousRtt.current > 0 
        ? Math.abs(currentRtt - previousRtt.current) 
        : 0;
      previousRtt.current = currentRtt;

      const quality = getQualityFromPing(currentRtt);

      setStats({
        ping: Math.round(currentRtt),
        jitter: Math.round(jitter),
        quality,
        isConnected: true,
      });
    } catch (error) {
      console.error('[Latency] Error measuring:', error);
    }
  }, [peerConnection]);

  useEffect(() => {
    if (!enabled || !peerConnection) return;

    // Initial measurement
    measureLatency();

    // Poll every 2 seconds
    intervalRef.current = setInterval(measureLatency, 2000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [peerConnection, enabled, measureLatency]);

  return stats;
};

// Simplified version for presence-based quality
export const useSimpleLatency = () => {
  const [ping, setPing] = useState(0);
  const [quality, setQuality] = useState<LatencyStats['quality']>('excellent');
  const lastPingRef = useRef<number>(Date.now());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const measure = async () => {
      const start = Date.now();
      
      try {
        // Simple ping to Supabase
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, {
          method: 'HEAD',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          }
        });
        
        const httpLatency = Date.now() - start;
        // Estimate real P2P voice latency (~40% of HTTP round-trip)
        const estimatedVoiceLatency = Math.max(1, Math.round(httpLatency * 0.4));
        setPing(estimatedVoiceLatency);
        
        if (estimatedVoiceLatency <= 30) setQuality('excellent');
        else if (estimatedVoiceLatency <= 60) setQuality('good');
        else if (estimatedVoiceLatency <= 100) setQuality('fair');
        else setQuality('poor');
        
        lastPingRef.current = Date.now();
      } catch {
        setQuality('poor');
        setPing(999);
      }
    };

    measure();
    intervalRef.current = setInterval(measure, 5000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { ping, quality };
};
