/**
 * WebRTC Utilities - Shared across voice and screen share hooks
 * Includes SDP munging, adaptive bitrate, connection monitoring
 */

// Optimized ICE servers for low latency
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
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

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 10,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
  iceTransportPolicy: "all",
};

/**
 * Munge SDP for Opus HD voice:
 * - Force stereo=1, sprop-stereo=1
 * - useinbandfec=1 (Forward Error Correction)
 * - usedtx=1 (Discontinuous Transmission - saves bandwidth in silence)
 * - maxaveragebitrate=128000 (128kbps for high quality)
 * - cbr=0 (Variable Bitrate for efficiency)
 * - maxplaybackrate=48000
 * - ptime=20 (20ms frames for low latency)
 */
export function mungeOpusSDP(sdp: string): string {
  const lines = sdp.split('\r\n');
  const result: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Find Opus fmtpline and enhance it
    if (line.startsWith('a=fmtp:') && line.includes('opus')) {
      // Remove existing params we want to override
      const existingParams = [
        'stereo', 'sprop-stereo', 'maxaveragebitrate', 'useinbandfec',
        'usedtx', 'cbr', 'maxplaybackrate', 'ptime', 'minptime', 'maxptime'
      ];
      
      for (const param of existingParams) {
        line = line.replace(new RegExp(`;?${param}=\\d+`, 'g'), '');
      }
      
      // Add optimized params
      line += ';stereo=1;sprop-stereo=1;maxaveragebitrate=128000;useinbandfec=1;usedtx=1;cbr=0;maxplaybackrate=48000;ptime=20;minptime=10;maxptime=40';
    }
    
    // Prefer Opus codec by moving it to first position
    if (line.startsWith('m=audio')) {
      const parts = line.split(' ');
      const opusPayload = findOpusPayload(lines);
      if (opusPayload && parts.length > 3) {
        // Move opus payload to first position after port and proto
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
 * Munge SDP for screen sharing video:
 * - Prefer VP9 or H264 for screen content
 * - Higher bitrate for video
 */
export function mungeScreenShareSDP(sdp: string): string {
  // Set video bitrate high for screen content
  const lines = sdp.split('\r\n');
  const result: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    result.push(line);
    
    // After video m-line, add bandwidth
    if (line.startsWith('m=video')) {
      // Add bandwidth line for video
      result.push('b=AS:8000'); // 8 Mbps max for screen share
    }
  }
  
  return result.join('\r\n');
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
  
  // Enable DTX (Discontinuous Transmission) at encoding level
  (params.encodings[0] as any).dtx = true;
  
  try {
    await sender.setParameters(params);
  } catch (e) {
    console.warn('[WebRTC] Failed to set audio sender params:', e);
  }
}

/**
 * Configure video sender parameters for screen sharing
 */
export async function configureScreenShareSender(
  sender: RTCRtpSender, 
  quality: { width: number; height: number; frameRate: number }
): Promise<void> {
  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) {
    params.encodings = [{}];
  }
  
  // High bitrate for screen content
  const pixels = quality.width * quality.height;
  const baseBitrate = pixels > 2073600 ? 8000000 : 5000000; // 8Mbps for 1440p, 5Mbps for 1080p
  const framerateMultiplier = quality.frameRate > 60 ? 1.5 : 1;
  
  params.encodings[0].maxBitrate = Math.round(baseBitrate * framerateMultiplier);
  params.encodings[0].priority = "high";
  params.encodings[0].networkPriority = "high";
  (params.encodings[0] as any).maxFramerate = quality.frameRate;
  
  // Content hint for screen content optimization
  try {
    const track = sender.track;
    if (track && 'contentHint' in track) {
      (track as any).contentHint = 'detail'; // Optimize for text/detail
    }
  } catch {}
  
  try {
    await sender.setParameters(params);
  } catch (e) {
    console.warn('[WebRTC] Failed to set screen share sender params:', e);
  }
}

/**
 * Monitor connection quality via getStats()
 * Returns packet loss %, jitter, RTT
 */
export interface ConnectionStats {
  packetLoss: number; // 0-100%
  jitter: number; // ms
  rtt: number; // ms
  bitrate: number; // kbps
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
        jitter = (report.jitter || 0) * 1000; // Convert to ms
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
  private timeout: NodeJS.Timeout | null = null;
  
  scheduleRestart(pc: RTCPeerConnection, onRestart?: () => void) {
    if (this.attempts >= this.maxAttempts) {
      console.warn('[ICERestart] Max attempts reached');
      return;
    }
    
    const delay = Math.min(1000 * Math.pow(2, this.attempts), 30000); // 1s, 2s, 4s, 8s, 16s, max 30s
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
  }
}
