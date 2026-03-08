import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { Friend } from "@/hooks/useFriends";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWebRTCScreenShare, ScreenQuality, QUALITY_PRESETS } from "@/hooks/useWebRTCScreenShare";
import { useSimpleLatency } from "@/hooks/useConnectionLatency";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, MicOff, Loader2, Radio, Volume2, VolumeX, VolumeOff, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

import {
  getSelectedMicrophone,
  getNoiseSuppression,
  getEchoCancellation,
  getAutoGain,
} from "@/components/SettingsDialog";
import { usePushToTalk, getPushToTalkEnabled, getKeyDisplayName, getPushToTalkKey } from "@/hooks/usePushToTalk";
import MultiScreenShareView from "@/components/voice/MultiScreenShareView";
import ScreenShareQualityDialog from "@/components/voice/ScreenShareQualityDialog";
import ConnectionQualityIndicator from "@/components/voice/ConnectionQualityIndicator";
import VoiceControlsWithScreenShare from "@/components/voice/VoiceControlsWithScreenShare";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";

import { AdvancedNoiseProcessor } from "@/hooks/useNoiseProcessor";
import {
  RTC_CONFIG,
  getDynamicRtcConfig,
  mungeOpusSDP,
  configureAudioSender,
  ICERestartManager,
} from "@/lib/webrtcUtils";

interface PrivateCallPanelProps {
  friend: Friend;
  onEnd: () => void;
  isIncoming?: boolean;
  callId?: string;
}

/* ─── Audio constraints helper ─── */
const getOptimizedAudioConstraints = (): MediaTrackConstraints => {
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

/*
 * Call status flow:
 *   Outgoing: "ringing" → "connecting" → "active" → "ended"
 *   Incoming: "ringing" → "connecting" → "active" → "ended"
 *
 *   "ringing"    = waiting for the other party to accept / decline
 *   "connecting" = accepted, setting up WebRTC audio
 *   "active"     = audio connected, call in progress
 *   "ended"      = call terminated
 */
type CallStatus = "ringing" | "connecting" | "active" | "ended";

const PrivateCallPanel = ({
  friend,
  onEnd,
  isIncoming = false,
  callId: initialCallId,
}: PrivateCallPanelProps) => {
  const { user, profile } = useAuth();
  const { toast } = useToast();

  // ── State ──
  const [callStatus, setCallStatus] = useState<CallStatus>("ringing");
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [duration, setDuration] = useState(0);
  const [callId, setCallId] = useState(initialCallId);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [friendSpeaking, setFriendSpeaking] = useState(false);
  const [qualityDialogOpen, setQualityDialogOpen] = useState(false);
  const [isPttActive, setIsPttActive] = useState(false);
  const [friendVolume, setFriendVolume] = useState(1);
  const [friendPopoverOpen, setFriendPopoverOpen] = useState(false);
  const [noiseEngine, setNoiseEngine] = useState<string | null>(null);

  // ── Refs ──
  const localStreamRef = useRef<MediaStream | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const noiseProcessorRef = useRef<AdvancedNoiseProcessor | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const iceRestartManagerRef = useRef<ICERestartManager>(new ICERestartManager());
  const rtcConfigRef = useRef<RTCConfiguration>(RTC_CONFIG);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const signalingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const durationInterval = useRef<NodeJS.Timeout | null>(null);
  const pttEnabledRef = useRef(getPushToTalkEnabled());
  const isMutedRef = useRef(false);
  const callStatusRef = useRef<CallStatus>(callStatus);
  const endCallRef = useRef<() => void>(() => {});

  // ── PTT ──
  const handlePttPush = useCallback(() => {
    if (!localStreamRef.current || !pttEnabledRef.current) return;
    const t = localStreamRef.current.getAudioTracks()[0];
    if (t) { t.enabled = true; setIsPttActive(true); setIsMuted(false); }
  }, []);
  const handlePttRelease = useCallback(() => {
    if (!localStreamRef.current || !pttEnabledRef.current) return;
    const t = localStreamRef.current.getAudioTracks()[0];
    if (t) { t.enabled = false; setIsPttActive(false); setIsMuted(true); }
  }, []);
  const { isPushing, pttEnabled } = usePushToTalk({
    onPush: handlePttPush,
    onRelease: handlePttRelease,
    isEnabled: callStatus === "active",
  });

  // Sync refs
  useEffect(() => { pttEnabledRef.current = pttEnabled; }, [pttEnabled]);
  useEffect(() => { callStatusRef.current = callStatus; }, [callStatus]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // Friend volume
  useEffect(() => {
    if (remoteAudioRef.current) remoteAudioRef.current.volume = Math.min(friendVolume, 1);
  }, [friendVolume]);

  // Deafen
  const handleToggleDeafen = useCallback(() => {
    setIsDeafened(prev => {
      const next = !prev;
      document.querySelectorAll('audio').forEach(a => { if (a.srcObject) a.muted = next; });
      return next;
    });
  }, []);

  const channelId = useMemo(
    () => `private-call-${[user?.id, friend.id].sort().join("-")}`,
    [user?.id, friend.id]
  );

  // ── Screen share ──
  const {
    isSharing,
    localStream: screenStream,
    screenSharers,
    remoteStreams,
    startScreenShare,
    stopScreenShare,
    cleanup: cleanupScreenShare,
  } = useWebRTCScreenShare({
    channelId,
    onError: (error) => toast({ title: "Erreur de partage", description: error, variant: "destructive" }),
  });

  const activeScreens = useMemo(() => {
    const screens: { odId: string; username: string; stream: MediaStream; isLocal: boolean }[] = [];
    if (isSharing && screenStream) {
      screens.push({ odId: user?.id || "", username: profile?.username || "Toi", stream: screenStream, isLocal: true });
    }
    remoteStreams.forEach((stream, odId) => {
      screens.push({ odId, username: friend.username, stream, isLocal: false });
    });
    return screens;
  }, [isSharing, screenStream, remoteStreams, user?.id, profile?.username, friend.username]);

  // ── WebRTC peer connection ──
  const setupPeerConnection = (stream: MediaStream) => {
    if (peerConnectionRef.current) peerConnectionRef.current.close();
    iceRestartManagerRef.current.reset();
    const pc = new RTCPeerConnection(rtcConfigRef.current);
    peerConnectionRef.current = pc;

    stream.getTracks().forEach((track) => {
      const sender = pc.addTrack(track, stream);
      if (track.kind === "audio") configureAudioSender(sender);
    });

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteAudioRef.current) {
        remoteAudioRef.current = new Audio();
        remoteAudioRef.current.autoplay = true;
        (remoteAudioRef.current as any).playsInline = true;
      }
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(console.error);

      // Detect friend speaking
      try {
        const ctx = new AudioContext({ sampleRate: 48000 });
        const src = ctx.createMediaStreamSource(remoteStream);
        const an = ctx.createAnalyser();
        an.fftSize = 256;
        an.smoothingTimeConstant = 0.4;
        src.connect(an);
        const buf = new Uint8Array(an.frequencyBinCount);
        const detect = () => {
          if (callStatusRef.current === "ended") { ctx.close(); return; }
          an.getByteFrequencyData(buf);
          let s = 0;
          for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
          setFriendSpeaking(Math.sqrt(s / buf.length) > 12);
          requestAnimationFrame(detect);
        };
        detect();
      } catch (e) {
        console.error("[PrivateCall] Friend speaking detection error:", e);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && signalingChannelRef.current) {
        signalingChannelRef.current.send({
          type: "broadcast",
          event: "webrtc-signal",
          payload: { type: "ice-candidate", from: user?.id, to: friend.id, data: event.candidate },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log("[PrivateCall] Connection state:", state);
      if (state === "connected") {
        iceRestartManagerRef.current.reset();
        setCallStatus("active");
      } else if (state === "failed" || state === "disconnected") {
        iceRestartManagerRef.current.scheduleRestart(pc);
      }
    };

    return pc;
  };

  // ICE give-up callback
  useEffect(() => {
    iceRestartManagerRef.current.setOnGiveUp(() => {
      console.warn("[PrivateCall] Peer permanently disconnected, ending call");
      toast({ title: "Déconnecté", description: "La connexion a été perdue", variant: "destructive" });
      endCallRef.current();
    });
  }, [toast]);

  // Handle signaling messages — use ref to avoid stale closures
  const handleSignalRef = useRef<(payload: any) => Promise<void>>();
  handleSignalRef.current = async (payload: any) => {
    if (payload.to !== user?.id) return;
    let pc = peerConnectionRef.current;

    if (payload.type === "offer") {
      try {
        if (!localStreamRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: getOptimizedAudioConstraints() });
          localStreamRef.current = stream;
          setupLocalAudioDetection(stream);
        }
        if (!pc) pc = setupPeerConnection(localStreamRef.current);
        const mungedOffer = { ...payload.data, sdp: mungeOpusSDP(payload.data.sdp) };
        await pc.setRemoteDescription(new RTCSessionDescription(mungedOffer));
        const answer = await pc.createAnswer();
        answer.sdp = mungeOpusSDP(answer.sdp || "");
        await pc.setLocalDescription(answer);
        signalingChannelRef.current?.send({
          type: "broadcast",
          event: "webrtc-signal",
          payload: { type: "answer", from: user?.id, to: friend.id, data: answer },
        });
      } catch (error) {
        console.error("[PrivateCall] Error handling offer:", error);
      }
    } else if (payload.type === "answer") {
      if (pc) {
        const mungedAnswer = { ...payload.data, sdp: mungeOpusSDP(payload.data.sdp) };
        await pc.setRemoteDescription(new RTCSessionDescription(mungedAnswer));
      }
    } else if (payload.type === "ice-candidate") {
      if (pc) {
        try { await pc.addIceCandidate(new RTCIceCandidate(payload.data)); } catch (e) { console.error("[PrivateCall] ICE error:", e); }
      }
    }
  };

  const setupLocalAudioDetection = (stream: MediaStream) => {
    audioContextRef.current = new AudioContext({ sampleRate: 48000 });
    analyserRef.current = audioContextRef.current.createAnalyser();
    const source = audioContextRef.current.createMediaStreamSource(stream);
    source.connect(analyserRef.current);
    analyserRef.current.fftSize = 128;
    analyserRef.current.smoothingTimeConstant = 0.3;
    const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
    const detect = () => {
      if (!analyserRef.current || callStatusRef.current === "ended") return;
      analyserRef.current.getByteFrequencyData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      setIsSpeaking(Math.sqrt(s / buf.length) > 12 && !isMutedRef.current);
      animationRef.current = requestAnimationFrame(detect);
    };
    detect();
  };

  // ── Create call record (outgoing) ──
  useEffect(() => {
    if (!isIncoming && user && !callId) {
      (async () => {
        const { data, error } = await supabase
          .from("private_calls")
          .insert({ caller_id: user.id, callee_id: friend.id, status: "ringing" })
          .select()
          .single();
        if (error) {
          toast({ title: "Erreur", description: "Impossible de démarrer l'appel", variant: "destructive" });
          onEnd();
          return;
        }
        setCallId(data.id);
      })();
    }
  }, [isIncoming, user, friend.id, callId]);

  // ── Signaling channel ──
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`private-signaling-${channelId}`);
    signalingChannelRef.current = ch;
    ch.on("broadcast", { event: "webrtc-signal" }, ({ payload }) => handleSignal(payload));
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, channelId]);

  // ── Watch call status changes in DB ──
  useEffect(() => {
    if (!callId) return;
    const ch = supabase
      .channel(`call-${callId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "private_calls", filter: `id=eq.${callId}` }, (payload) => {
        const newStatus = payload.new.status as string;
        if (newStatus === "active") {
          setCallStatus("connecting");
          startAudioAndConnect();
        } else if (newStatus === "ended" || newStatus === "declined" || newStatus === "missed") {
          setCallStatus("ended");
          cleanup();
          setTimeout(onEnd, 1000);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [callId]);

  // ── Duration timer ──
  useEffect(() => {
    if (callStatus === "active") {
      durationInterval.current = setInterval(() => setDuration((d) => d + 1), 1000);
    }
    return () => { if (durationInterval.current) clearInterval(durationInterval.current); };
  }, [callStatus]);

  // ── Start audio + WebRTC ──
  const startAudioAndConnect = async () => {
    try {
      const dynamicConfig = await getDynamicRtcConfig();
      rtcConfigRef.current = dynamicConfig;
      console.log("[PrivateCall] Using ICE config with", dynamicConfig.iceServers?.length, "servers");

      const rawStream = await navigator.mediaDevices.getUserMedia({ audio: getOptimizedAudioConstraints() });
      rawStreamRef.current = rawStream;

      let processedStream = rawStream;
      if (getNoiseSuppression()) {
        try {
          noiseProcessorRef.current = new AdvancedNoiseProcessor();
          processedStream = await noiseProcessorRef.current.process(rawStream);
          const rnnoiseActive = noiseProcessorRef.current.isRnnoiseActive();
          const impulseActive = noiseProcessorRef.current.isImpulseGateActive();
          const engineName = rnnoiseActive
            ? impulseActive ? "RNNoise+ImpulseGate" : "RNNoise"
            : impulseActive ? "ImpulseGate" : null;
          setNoiseEngine(engineName);
          console.log(`[PrivateCall] Noise processing applied | RNNoise=${rnnoiseActive} | ImpulseGate=${impulseActive} | latency=${noiseProcessorRef.current.getLatency()}ms`);
        } catch (noiseErr) {
          console.error("[PrivateCall] Noise processor failed:", noiseErr);
        }
      }

      localStreamRef.current = processedStream;
      setupLocalAudioDetection(rawStream);

      const pc = setupPeerConnection(processedStream);

      if (pttEnabled) {
        const t = processedStream.getAudioTracks()[0];
        if (t) { t.enabled = false; setIsMuted(true); isMutedRef.current = true; }
      }

      if (!isIncoming) {
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        offer.sdp = mungeOpusSDP(offer.sdp || "");
        await pc.setLocalDescription(offer);
        signalingChannelRef.current?.send({
          type: "broadcast",
          event: "webrtc-signal",
          payload: { type: "offer", from: user?.id, to: friend.id, data: offer },
        });
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible d'accéder au microphone", variant: "destructive" });
    }
  };

  // ── Cleanup ──
  const cleanup = () => {
    callStatusRef.current = "ended";
    iceRestartManagerRef.current.cleanup();
    if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
    if (noiseProcessorRef.current) { noiseProcessorRef.current.cleanup(); noiseProcessorRef.current = null; }
    if (rawStreamRef.current) { rawStreamRef.current.getTracks().forEach((t) => t.stop()); rawStreamRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach((t) => t.stop()); localStreamRef.current = null; }
    if (audioContextRef.current?.state !== "closed") audioContextRef.current?.close();
    if (peerConnectionRef.current) { peerConnectionRef.current.close(); peerConnectionRef.current = null; }
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    if (isSharing) stopScreenShare();
    cleanupScreenShare();
  };

  // ── Call actions ──
  const acceptCall = async () => {
    if (!callId) return;
    setCallStatus("connecting");
    await supabase.from("private_calls").update({ status: "active", started_at: new Date().toISOString() }).eq("id", callId);
  };

  const declineCall = async () => {
    if (!callId) return;
    await supabase.from("private_calls").update({ status: "declined", ended_at: new Date().toISOString() }).eq("id", callId);
    cleanup();
    onEnd();
  };

  const endCall = async () => {
    if (!callId) return;
    await supabase.from("private_calls").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", callId);
    cleanup();
    onEnd();
  };

  useEffect(() => { endCallRef.current = endCall; });

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = isMuted; });
      const newMuted = !isMuted;
      setIsMuted(newMuted);
      isMutedRef.current = newMuted;
    }
  };

  const handleToggleScreenShare = () => {
    if (isSharing) stopScreenShare();
    else setQualityDialogOpen(true);
  };

  const handleSelectQuality = async (quality: ScreenQuality) => {
    const preset = QUALITY_PRESETS[quality];
    const stream = await startScreenShare(quality);
    if (stream) toast({ title: "Partage d'écran", description: `${preset.height}p ${preset.frameRate}fps` });
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    return `${m.toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  };

  const hasScreenShare = activeScreens.length > 0;
  const { ping, quality: latencyQuality } = useSimpleLatency();
  const connectionQuality = callStatus === "active"
    ? (latencyQuality === "excellent" ? "excellent" : latencyQuality === "fair" ? "good" : latencyQuality === "good" ? "good" : "poor") as "excellent" | "good" | "poor" | "connecting"
    : ("connecting" as const);

  /* ─── Status label helper ─── */
  const getStatusLabel = (): string => {
    switch (callStatus) {
      case "ringing":
        return isIncoming ? "Appel entrant..." : "Ça sonne...";
      case "connecting":
        return "Connexion en cours...";
      case "active":
        return formatDuration(duration);
      case "ended":
        return "Appel terminé";
    }
  };

  const isWaiting = callStatus === "ringing" || callStatus === "connecting";

  // ── Render ──
  const callUI = (
    <TooltipProvider delayDuration={200}>
      <div className="fixed inset-0 z-[9999] flex flex-col bg-background animate-fade-in" style={{ isolation: "isolate" }}>
        {/* ── Header ── */}
        <header className="shrink-0 h-16 px-5 flex items-center justify-between border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center border transition-colors",
              callStatus === "active"
                ? "bg-success/10 border-success/20"
                : "bg-primary/10 border-primary/20"
            )}>
              <Phone className={cn("h-4 w-4", callStatus === "active" ? "text-success" : "text-primary")} />
            </div>
            <div>
              <h2 className="text-base font-bold">{friend.username}</h2>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                {getStatusLabel()}
                {callStatus === "active" && noiseEngine && (
                  <span className="text-[10px] text-success/70 flex items-center gap-1">
                    <Sparkles className="h-2.5 w-2.5" />
                    {noiseEngine}
                  </span>
                )}
              </p>
            </div>
          </div>
          {callStatus === "active" && (
            <ConnectionQualityIndicator quality={connectionQuality} ping={ping} showPing={true} />
          )}
        </header>

        {/* ── Main Content ── */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {hasScreenShare && (
            <div className="flex-1 min-w-0 bg-black/20">
              <MultiScreenShareView screens={activeScreens} onStopLocal={stopScreenShare} />
            </div>
          )}

          {/* Avatars / Users Panel */}
          <div className={cn(
            "flex flex-col items-center justify-center shrink-0",
            hasScreenShare ? "w-72 border-l border-border bg-card" : "flex-1"
          )}>
            <div className="flex items-center justify-center gap-12">
              {/* My Avatar */}
              <UserAvatar
                username={profile?.username || "?"}
                avatarUrl={profile?.avatar_url}
                isSpeaking={isSpeaking && !isMuted && callStatus === "active"}
                isMuted={isMuted}
                label="Vous"
                compact={hasScreenShare}
              />

              {/* Friend Avatar — clickable for volume */}
              <Popover open={friendPopoverOpen} onOpenChange={setFriendPopoverOpen}>
                <PopoverTrigger asChild>
                  <div className="cursor-pointer">
                    <UserAvatar
                      username={friend.username}
                      avatarUrl={friend.avatar_url}
                      isSpeaking={friendSpeaking && friendVolume > 0 && callStatus === "active"}
                      isMuted={friendVolume === 0}
                      label={friend.username}
                      compact={hasScreenShare}
                      dimmed={friendVolume === 0}
                    />
                  </div>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="center" className="w-56 p-3 space-y-3 bg-card border-border shadow-xl">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={friend.avatar_url || ""} className="object-cover" />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {friend.username[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-semibold truncate">{friend.username}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground font-medium">Volume</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{Math.round(friendVolume * 100)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setFriendVolume(friendVolume === 0 ? 1 : 0)} className="shrink-0 p-1 rounded hover:bg-muted transition-colors">
                        {friendVolume === 0 ? <VolumeOff className="h-4 w-4 text-muted-foreground" /> : <Volume2 className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      <Slider value={[friendVolume]} min={0} max={2} step={0.05} onValueChange={([v]) => setFriendVolume(v)} className="flex-1" />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* PTT Indicator */}
            {callStatus === "active" && pttEnabled && (
              <div className={cn(
                "mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300",
                isPttActive
                  ? "bg-success/20 text-success border border-success/30"
                  : "bg-secondary/50 text-muted-foreground border border-border"
              )}>
                <Radio className={cn("h-4 w-4", isPttActive && "animate-pulse")} />
                <span>{isPttActive ? "Vous parlez..." : `Appuyez sur ${getKeyDisplayName(getPushToTalkKey())} pour parler`}</span>
              </div>
            )}

            {/* Loading indicator */}
            {isWaiting && (
              <div className="mt-6 flex items-center gap-2 animate-pulse">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">{getStatusLabel()}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Controls Bar ── */}
        <div className="shrink-0 px-6 py-4 flex justify-center border-t border-border bg-card">
          {callStatus === "ringing" && isIncoming ? (
            <div className="flex items-center gap-3">
              <Button
                size="lg"
                variant="destructive"
                className="h-12 rounded-xl px-5 font-semibold"
                onClick={declineCall}
              >
                <PhoneOff className="h-5 w-5 mr-2" />
                Refuser
              </Button>
              <Button
                size="lg"
                className="h-12 rounded-xl px-5 font-semibold bg-success text-success-foreground hover:bg-success/90"
                onClick={acceptCall}
              >
                <Phone className="h-5 w-5 mr-2" />
                Accepter
              </Button>
            </div>
          ) : callStatus === "active" ? (
            <VoiceControlsWithScreenShare
              isConnected={true}
              isConnecting={false}
              isMuted={isMuted}
              isScreenSharing={isSharing}
              isDeafened={isDeafened}
              onJoin={() => {}}
              onLeave={endCall}
              onToggleMute={toggleMute}
              onToggleScreenShare={handleToggleScreenShare}
              onToggleDeafen={handleToggleDeafen}
            />
          ) : (
            /* ringing (outgoing) or connecting */
            <Button
              size="lg"
              variant="destructive"
              className="h-12 rounded-xl px-5 font-semibold"
              onClick={endCall}
            >
              <PhoneOff className="h-5 w-5 mr-2" />
              Annuler
            </Button>
          )}
        </div>

        <ScreenShareQualityDialog open={qualityDialogOpen} onOpenChange={setQualityDialogOpen} onSelectQuality={handleSelectQuality} />
      </div>
    </TooltipProvider>
  );

  return createPortal(callUI, document.body);
};

/* ─── Reusable Avatar sub-component ─── */
const UserAvatar = ({
  username,
  avatarUrl,
  isSpeaking,
  isMuted,
  label,
  compact = false,
  dimmed = false,
}: {
  username: string;
  avatarUrl?: string | null;
  isSpeaking: boolean;
  isMuted: boolean;
  label: string;
  compact?: boolean;
  dimmed?: boolean;
}) => (
  <div className="relative flex flex-col items-center">
    {isSpeaking && (
      <>
        <div className="absolute inset-0 rounded-full border-2 border-success/40 animate-speaking-ring" />
        <div className="absolute inset-0 rounded-full border-2 border-success/20 animate-speaking-ring" style={{ animationDelay: "0.5s" }} />
      </>
    )}
    <Avatar className={cn(
      "relative transition-all duration-300 ring-[3px] ring-offset-2 ring-offset-background shadow-2xl",
      dimmed && "opacity-60",
      isSpeaking ? "ring-success shadow-success/20" : "ring-transparent",
      compact ? "h-16 w-16" : "h-24 w-24"
    )}>
      <AvatarImage src={avatarUrl || ""} className="object-cover" />
      <AvatarFallback className="bg-primary/10 text-primary font-bold text-2xl">
        {username[0]?.toUpperCase()}
      </AvatarFallback>
    </Avatar>
    <p className="text-xs text-muted-foreground/60 mt-3 font-medium">{label}</p>
    {isMuted && (
      <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg bg-destructive/90 flex items-center justify-center ring-2 ring-background">
        <MicOff className="h-3.5 w-3.5 text-destructive-foreground" />
      </div>
    )}
    {isSpeaking && !isMuted && (
      <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg bg-success flex items-center justify-center ring-2 ring-background">
        <Volume2 className="h-3.5 w-3.5 text-success-foreground" />
      </div>
    )}
  </div>
);

export default PrivateCallPanel;
