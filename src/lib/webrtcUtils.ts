/**
 * WebRTC Utilities - Shared across voice and screen share hooks
 * Includes SDP munging, adaptive bitrate, connection monitoring
 */

import { supabase } from "@/integrations/supabase/client";

// Fallback STUN-only servers
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// Cache for TURN credentials
let cachedIceServers: RTCIceServer[] | null = null;
let cacheExpiry = 0;

/**
 * Fetch dynamic TURN credentials from edge function.
 * Falls back to STUN-only if unavailable.
 */
export async function getDynamicIceServers(): Promise<RTCIceServer[]> {
  const now = Date.now();
  if (cachedIceServers && now < cacheExpiry) {
    return cachedIceServers;
  }

  try {
    const { data, error } = await supabase.functions.invoke("turn-credentials");
    if (error) throw error;

    const servers = data?.iceServers;
    if (Array.isArray(servers) && servers.length > 0) {
      cachedIceServers = servers;
      // Cache for 1 hour (Twilio TTL is 24h, refresh early)
      cacheExpiry = now + 3600_000;
      console.log("[WebRTC] Got dynamic TURN credentials:", servers.length, "servers");
      return servers;
    }
  } catch (err) {
    console.warn("[WebRTC] Failed to fetch TURN credentials, using fallback:", err);
  }

  return FALLBACK_ICE_SERVERS;
}

export async function getDynamicRtcConfig(): Promise<RTCConfiguration> {
  const iceServers = await getDynamicIceServers();
  return {
    iceServers,
    iceCandidatePoolSize: 10,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    iceTransportPolicy: "all",
  };
}

// Legacy static config (kept for compatibility but prefer getDynamicRtcConfig)
export const ICE_SERVERS: RTCIceServer[] = FALLBACK_ICE_SERVERS;

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 10,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
  iceTransportPolicy: "all",
};

/**
 * Munge SDP for Opus HD voice
 */
export function mungeOpusSDP(sdp: string): string {
  const lines = sdp.split('\r\n');
  const result: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    if (line.startsWith('a=fmtp:') && line.includes('opus')) {
      const existingParams = [
        'stereo', 'sprop-stereo', 'maxaveragebitrate', 'useinbandfec',
        'usedtx', 'cbr', 'maxplaybackrate', 'ptime', 'minptime', 'maxptime'
      ];
      
      for (const param of existingParams) {
        line = line.replace(new RegExp(`;?${param}=\\d+`, 'g'), '');
      }
      
      line += ';stereo=1;sprop-stereo=1;maxaveragebitrate=128000;useinbandfec=1;usedtx=1;cbr=0;maxplaybackrate=48000;ptime=20;minptime=10;maxptime=40';
    }
    
    if (line.startsWith('m=audio')) {
      const parts = line.split(' ');
      const opusPayload = findOpusPayload(lines);
      if (opusPayload && parts.length > 3) {
        const payloads = parts.slice(3).filter(p => p !== opusPayload);
        line = `${parts[0]} ${parts[1]} ${parts[2]} ${opusPayload} ${payloads.join(' ')}`;
      }
    }
    
    result.push(line);
  }
  
  return result.join('\r\n');
}

function findOpusPayload(lines: string[]): string | null {
  for (const line of lines) {
    const match = line.match(/^a=rtpmap:(\d+)\s+opus\//i);
    if (match) return match[1];
  }
  return null;
}

/**
 * Munge SDP for screen sharing video — force VP8/VP9/H264 high profile, high bitrate
 */
export function mungeScreenShareSDP(sdp: string, bitrateBps?: number): string {
  const lines = sdp.split('\r\n');
  const result: string[] = [];
  const targetBitrate = bitrateBps || 50_000_000;
  const targetBitrateKbps = Math.round(targetBitrate / 1000);
  
  // Find H264 high-profile payload for preferring it
  const h264HighPayload = findH264HighProfilePayload(lines);
  const vp9Payload = findCodecPayload(lines, 'VP9');
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Remove any existing bandwidth lines
    if (line.startsWith('b=AS:') || line.startsWith('b=TIAS:')) continue;
    
    // Prioritize codec: H264 High > VP9 > VP8
    if (line.startsWith('m=video')) {
      const parts = line.split(' ');
      if (parts.length > 3) {
        const payloads = parts.slice(3);
        const prioritized: string[] = [];
        
        // Prefer H264 High profile, then VP9
        if (h264HighPayload && payloads.includes(h264HighPayload)) {
          prioritized.push(h264HighPayload);
        }
        if (vp9Payload && payloads.includes(vp9Payload)) {
          prioritized.push(vp9Payload);
        }
        
        // Add remaining codecs
        payloads.forEach(p => {
          if (!prioritized.includes(p)) prioritized.push(p);
        });
        
        line = `${parts[0]} ${parts[1]} ${parts[2]} ${prioritized.join(' ')}`;
      }
      
      result.push(line);
      // Add both AS and TIAS bandwidth limits
      result.push(`b=AS:${targetBitrateKbps}`);
      result.push(`b=TIAS:${targetBitrate}`);
      continue;
    }
    
    // Boost H264 profile-level-id to High profile (4264xx → 6400xx)
    if (line.includes('profile-level-id=42') && line.includes('a=fmtp:')) {
      line = line.replace(/profile-level-id=42\w{4}/, 'profile-level-id=640032');
    }
    
    // Set H264 max-mbps and max-fs for high resolution
    if (line.includes('a=fmtp:') && line.includes('profile-level-id')) {
      if (!line.includes('max-mbps')) {
        line += ';max-mbps=983040;max-fs=8160;max-br=' + targetBitrateKbps;
      }
    }
    
    // For VP9, set profile-id=0 (best for screen content)
    if (vp9Payload && line.startsWith(`a=fmtp:${vp9Payload}`)) {
      if (!line.includes('profile-id')) {
        line += ';profile-id=0';
      }
    }

    result.push(line);
  }
  
  return result.join('\r\n');
}

function findH264HighProfilePayload(lines: string[]): string | null {
  // Find H264 payload with highest profile
  for (const line of lines) {
    const match = line.match(/^a=rtpmap:(\d+)\s+H264\//i);
    if (match) return match[1];
  }
  return null;
}

function findCodecPayload(lines: string[], codec: string): string | null {
  for (const line of lines) {
    const match = line.match(new RegExp(`^a=rtpmap:(\\d+)\\s+${codec}\\/`, 'i'));
    if (match) return match[1];
  }
  return null;
}

/**
 * Configure audio sender parameters for optimal voice
 */
export async function configureAudioSender(sender: RTCRtpSender): Promise<void> {
  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) {
    params.encodings = [{}];
  }
  
  params.encodings[0].maxBitrate = 128000;
  params.encodings[0].priority = "high";
  params.encodings[0].networkPriority = "high";
  (params.encodings[0] as any).dtx = true;
  
  try {
    await sender.setParameters(params);
  } catch (e) {
    console.warn('[WebRTC] Failed to set audio sender params:', e);
  }
}

/**
 * Configure video sender for screen sharing — maximize quality, never degrade resolution
 */
export async function configureScreenShareSender(
  sender: RTCRtpSender, 
  quality: { width: number; height: number; frameRate: number; bitrate?: number }
): Promise<void> {
  // Set content hint FIRST — tells the encoder to prioritize sharpness over motion
  try {
    const track = sender.track;
    if (track && 'contentHint' in track) {
      (track as any).contentHint = 'detail';
    }
  } catch {}

  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) {
    params.encodings = [{}];
  }
  
  // Use provided bitrate or compute from resolution
  const bitrate = quality.bitrate || (() => {
    const pixels = quality.width * quality.height;
    if (pixels > 2073600) return 20_000_000;
    if (pixels > 921600) return 12_000_000;
    return 6_000_000;
  })();
  
  params.encodings[0].maxBitrate = bitrate;
  params.encodings[0].priority = "high";
  params.encodings[0].networkPriority = "high";
  (params.encodings[0] as any).maxFramerate = quality.frameRate;
  
  // CRITICAL: Prevent the browser from reducing resolution under bandwidth pressure
  // "maintain-resolution" = keep pixels sharp, drop frames if needed
  // "maintain-framerate" would keep fps but degrade resolution — bad for screen share
  params.degradationPreference = "maintain-resolution";
  
  // Scale resolution down factor = 1.0 means NO downscaling
  params.encodings[0].scaleResolutionDownBy = 1.0;
  
  try {
    await sender.setParameters(params);
    console.log(`[WebRTC] Screen share sender configured: ${quality.width}x${quality.height}@${quality.frameRate}fps, ${Math.round(bitrate / 1_000_000)}Mbps`);
  } catch (e) {
    console.warn('[WebRTC] Failed to set screen share sender params:', e);
  }
}

/**
 * Monitor connection quality via getStats()
 */
export interface ConnectionStats {
  packetLoss: number;
  jitter: number;
  rtt: number;
  bitrate: number;
  quality: 'excellent' | 'good' | 'poor';
}

export async function getConnectionStats(pc: RTCPeerConnection): Promise<ConnectionStats | null> {
  try {
    const stats = await pc.getStats();
    let packetsReceived = 0;
    let packetsLost = 0;
    let jitter = 0;
    let rtt = 0;
    let bytesReceived = 0;
    
    stats.forEach((report) => {
      if (report.type === 'inbound-rtp' && report.kind === 'audio') {
        packetsReceived = report.packetsReceived || 0;
        packetsLost = report.packetsLost || 0;
        jitter = (report.jitter || 0) * 1000;
      }
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        rtt = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0;
        bytesReceived = report.bytesReceived || 0;
      }
    });
    
    const totalPackets = packetsReceived + packetsLost;
    const packetLoss = totalPackets > 0 ? (packetsLost / totalPackets) * 100 : 0;
    
    let quality: 'excellent' | 'good' | 'poor' = 'excellent';
    if (packetLoss > 5 || rtt > 300 || jitter > 50) {
      quality = 'poor';
    } else if (packetLoss > 1 || rtt > 150 || jitter > 30) {
      quality = 'good';
    }
    
    return {
      packetLoss: Math.round(packetLoss * 10) / 10,
      jitter: Math.round(jitter),
      rtt: Math.round(rtt),
      bitrate: Math.round(bytesReceived / 1000),
      quality,
    };
  } catch {
    return null;
  }
}

/**
 * ICE restart with exponential backoff
 */
export class ICERestartManager {
  private attempts = 0;
  private maxAttempts = 5;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private onGiveUp: (() => void) | null = null;
  
  constructor(onGiveUp?: () => void) {
    this.onGiveUp = onGiveUp || null;
  }

  setOnGiveUp(cb: () => void) {
    this.onGiveUp = cb;
  }
  
  scheduleRestart(pc: RTCPeerConnection, onRestart?: () => void) {
    if (this.attempts >= this.maxAttempts) {
      console.warn('[ICERestart] Max attempts reached, giving up on peer');
      this.onGiveUp?.();
      return;
    }
    
    const delay = Math.min(1000 * Math.pow(2, this.attempts), 30000);
    this.attempts++;
    
    console.log(`[ICERestart] Scheduling restart attempt ${this.attempts} in ${delay}ms`);
    
    this.timeout = setTimeout(() => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        pc.restartIce();
        onRestart?.();
      }
    }, delay);
  }
  
  reset() {
    this.attempts = 0;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
  
  cleanup() {
    this.reset();
    this.onGiveUp = null;
  }
}
