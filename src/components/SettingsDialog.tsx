import { useState, useRef, useEffect } from "react";
import { Settings, Upload, Volume2, VolumeX, Mic, MicOff, Play, Square, Radio, Keyboard, Sparkles, Zap } from "lucide-react";
import { 
  getPushToTalkEnabled, 
  getPushToTalkKey, 
  setPushToTalkEnabled, 
  setPushToTalkKey,
  getKeyDisplayName,
  usePushToTalkKeyCapture
} from "@/hooks/usePushToTalk";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { cn } from "@/lib/utils";
import { getNoiseSuppressionMode, setNoiseSuppressionMode, type NoiseSuppressionMode } from "@/hooks/useNoiseProcessor";

// Audio settings keys
const NOISE_SUPPRESSION_KEY = "noiseSuppressionEnabled";
const SELECTED_MIC_KEY = "selectedMicrophoneId";
const ECHO_CANCELLATION_KEY = "echoCancellationEnabled";
const AUTO_GAIN_KEY = "autoGainEnabled";

export const getNoiseSuppression = (): boolean => {
  const stored = localStorage.getItem(NOISE_SUPPRESSION_KEY);
  return stored !== "false";
};

export const getEchoCancellation = (): boolean => {
  const stored = localStorage.getItem(ECHO_CANCELLATION_KEY);
  return stored !== "false";
};

export const getAutoGain = (): boolean => {
  const stored = localStorage.getItem(AUTO_GAIN_KEY);
  return stored !== "false";
};

export const getSelectedMicrophone = (): string | null => {
  return localStorage.getItem(SELECTED_MIC_KEY);
};

export const setNoiseSuppression = (enabled: boolean) => {
  localStorage.setItem(NOISE_SUPPRESSION_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent("audioSettingsChange"));
};

export const setEchoCancellation = (enabled: boolean) => {
  localStorage.setItem(ECHO_CANCELLATION_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent("audioSettingsChange"));
};

export const setAutoGain = (enabled: boolean) => {
  localStorage.setItem(AUTO_GAIN_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent("audioSettingsChange"));
};

export const setSelectedMicrophone = (deviceId: string) => {
  localStorage.setItem(SELECTED_MIC_KEY, deviceId);
  window.dispatchEvent(new CustomEvent("audioSettingsChange"));
};

// Get optimized audio constraints with FALLBACK for browser compatibility
export const getAudioConstraints = (): MediaTrackConstraints => {
  const selectedMic = getSelectedMicrophone();
  const noiseSuppression = getNoiseSuppression();
  const echoCancellation = getEchoCancellation();
  const autoGain = getAutoGain();

  return {
    deviceId: selectedMic ? { ideal: selectedMic } : undefined,
    // Use ideal for better compatibility - falls back gracefully
    echoCancellation: { ideal: echoCancellation },
    noiseSuppression: { ideal: noiseSuppression },
    autoGainControl: { ideal: autoGain },
    sampleRate: { ideal: 48000 },
    sampleSize: { ideal: 16 },
    channelCount: { ideal: 1 },
    // Chrome-specific advanced constraints for better noise reduction
    ...(noiseSuppression && {
      googNoiseSuppression: true,
      googHighpassFilter: true,
      googTypingNoiseDetection: true,
    } as any),
    ...(echoCancellation && {
      googEchoCancellation: true,
      googEchoCancellation2: true,
    } as any),
    ...(autoGain && {
      googAutoGainControl: true,
      googAutoGainControl2: true,
    } as any),
  };
};

interface AudioDevice {
  deviceId: string;
  label: string;
}

const SettingsDialog = () => {
  const { profile, updateProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState(profile?.username || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || "");
  const [noiseSuppression, setNoiseSuppressionState] = useState(getNoiseSuppression());
  const [echoCancellation, setEchoCancellationState] = useState(getEchoCancellation());
  const [autoGain, setAutoGainState] = useState(getAutoGain());
  const [uploading, setUploading] = useState(false);
  const [microphones, setMicrophones] = useState<AudioDevice[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>(getSelectedMicrophone() || "");
  const [isTesting, setIsTesting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioQuality, setAudioQuality] = useState<"excellent" | "good" | "poor">("excellent");
  const [pttEnabled, setPttEnabledState] = useState(getPushToTalkEnabled());
  const [pttKey, setPttKeyState] = useState(getPushToTalkKey());
  const [noiseMode, setNoiseModeState] = useState<NoiseSuppressionMode>(getNoiseSuppressionMode());
  
  const { isCapturing, startCapture, cancelCapture } = usePushToTalkKeyCapture();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const testStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const isTestingRef = useRef(false);
  const { toast } = useToast();

  // Load microphones
  useEffect(() => {
    const loadMicrophones = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices
          .filter(d => d.kind === "audioinput")
          .map(d => ({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
          }));
        
        setMicrophones(mics);
        
        if (!selectedMic && mics.length > 0) {
          setSelectedMic(mics[0].deviceId);
        }
      } catch (error) {
        console.error("Error loading microphones:", error);
      }
    };

    if (open) {
      loadMicrophones();
    }

    return () => {
      stopTest();
    };
  }, [open]);

  useEffect(() => {
    if (profile) {
      setUsername(profile.username);
      setAvatarUrl(profile.avatar_url || "");
    }
  }, [profile]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Type de fichier invalide",
        description: "Veuillez sélectionner une image ou un GIF",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setAvatarUrl(base64);
        setUploading(false);
      };
      reader.onerror = () => {
        toast({
          title: "Erreur",
          description: "Impossible de lire le fichier",
          variant: "destructive",
        });
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Erreur",
        description: "Impossible d'uploader l'image",
        variant: "destructive",
      });
      setUploading(false);
    }
  };

  const handleNoiseSuppressionToggle = (enabled: boolean) => {
    setNoiseSuppressionState(enabled);
    setNoiseSuppression(enabled);
    
    // Restart test to apply new settings
    if (isTesting) {
      stopTest();
      setTimeout(() => startTest(), 100);
    }
  };

  const handleEchoCancellationToggle = (enabled: boolean) => {
    setEchoCancellationState(enabled);
    setEchoCancellation(enabled);
    
    if (isTesting) {
      stopTest();
      setTimeout(() => startTest(), 100);
    }
  };

  const handleAutoGainToggle = (enabled: boolean) => {
    setAutoGainState(enabled);
    setAutoGain(enabled);
    
    if (isTesting) {
      stopTest();
      setTimeout(() => startTest(), 100);
    }
  };

  const handlePttToggle = (enabled: boolean) => {
    setPttEnabledState(enabled);
    setPushToTalkEnabled(enabled);
  };

  useEffect(() => {
    if (!isCapturing) {
      setPttKeyState(getPushToTalkKey());
    }
  }, [isCapturing]);

  const handleMicChange = (deviceId: string) => {
    setSelectedMic(deviceId);
    setSelectedMicrophone(deviceId);
    
    if (isTesting) {
      stopTest();
      setTimeout(() => startTest(), 100);
    }
  };

  const startTest = async () => {
    try {
      stopTest();
      
      // Use ideal constraints for better compatibility
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedMic ? { ideal: selectedMic } : undefined,
          echoCancellation: { ideal: echoCancellation },
          noiseSuppression: { ideal: noiseSuppression },
          autoGainControl: { ideal: autoGain },
          sampleRate: { ideal: 48000 },
          sampleSize: { ideal: 16 },
          // Chrome-specific
          ...(noiseSuppression && {
            googNoiseSuppression: true,
            googHighpassFilter: true,
            googTypingNoiseDetection: true,
          } as any),
          ...(echoCancellation && {
            googEchoCancellation: true,
          } as any),
          ...(autoGain && {
            googAutoGainControl: true,
          } as any),
        },
      };

      console.log('[SettingsDialog] Starting test with constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Log what was actually applied
      const track = stream.getAudioTracks()[0];
      if (track) {
        const settings = track.getSettings();
        console.log('[SettingsDialog] Applied settings:', settings);
        console.log('[SettingsDialog] Noise suppression:', settings.noiseSuppression);
        console.log('[SettingsDialog] Echo cancellation:', settings.echoCancellation);
        console.log('[SettingsDialog] Auto gain:', settings.autoGainControl);
      }
      
      testStreamRef.current = stream;

      audioContextRef.current = new AudioContext({ sampleRate: 48000 });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.5;
      source.connect(analyserRef.current);

      isTestingRef.current = true;
      setIsTesting(true);

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      let noiseFloor = 255;
      let peakLevel = 0;
      let sampleCount = 0;

      const monitor = () => {
        if (!analyserRef.current || !isTestingRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const normalizedLevel = Math.min(rms / 100, 1);
        
        setAudioLevel(normalizedLevel * 100);

        sampleCount++;
        if (sampleCount > 10) {
          const avgLevel = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          if (avgLevel < noiseFloor && avgLevel > 0) noiseFloor = avgLevel;
          if (avgLevel > peakLevel) peakLevel = avgLevel;

          const snr = peakLevel - noiseFloor;
          if (snr > 40) {
            setAudioQuality("excellent");
          } else if (snr > 20) {
            setAudioQuality("good");
          } else {
            setAudioQuality("poor");
          }
        }

        animationRef.current = requestAnimationFrame(monitor);
      };

      monitor();

      toast({
        title: "Test du microphone",
        description: "Parlez pour tester votre microphone",
      });
    } catch (error) {
      console.error("Error starting test:", error);
      toast({
        title: "Erreur",
        description: "Impossible d'accéder au microphone",
        variant: "destructive",
      });
      isTestingRef.current = false;
      setIsTesting(false);
    }
  };

  const stopTest = () => {
    isTestingRef.current = false;
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach(t => t.stop());
      testStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setIsTesting(false);
    setAudioLevel(0);
  };

  const handleSave = async () => {
    stopTest();
    
    
    try {
      await updateProfile({
        username: username.trim() || profile?.username || "Utilisateur",
        avatar_url: avatarUrl || null,
      });

      toast({
        title: "Paramètres sauvegardés",
        description: "Vos modifications ont été enregistrées.",
      });

      setOpen(false);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder les paramètres",
        variant: "destructive",
      });
    }
  };

  const getQualityColor = () => {
    switch (audioQuality) {
      case "excellent": return "text-success";
      case "good": return "text-warning";
      case "poor": return "text-destructive";
    }
  };

  const getQualityLabel = () => {
    switch (audioQuality) {
      case "excellent": return "Excellente";
      case "good": return "Bonne";
      case "poor": return "Faible";
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) stopTest(); setOpen(v); }}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9 rounded-xl hover:bg-white/[0.06] transition-all duration-300"
          title="Paramètres"
          onClick={() => setOpen(true)}
        >
          <Settings className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg glass-premium border-white/[0.08] rounded-3xl p-0 max-h-[80vh] flex flex-col">
        <DialogHeader className="p-6 pb-4 shrink-0">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/25 to-primary/10 border border-primary/20 flex items-center justify-center">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <span className="gradient-text-static">Paramètres</span>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground/70">
            Personnalisez votre profil et vos préférences audio
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 px-6">
          <div className="space-y-6 pb-6">
            {/* Avatar Section */}
            <div className="space-y-4">
              <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Photo de profil</Label>
              <div className="flex items-center gap-5 p-4 rounded-2xl bg-secondary/30 border border-white/[0.04]">
                <div className="relative">
                  <Avatar className="w-20 h-20 ring-2 ring-primary/20">
                    <AvatarImage src={avatarUrl} className="object-cover" />
                    <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary text-2xl font-bold">
                      {username.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-primary/60" />
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="rounded-xl border-white/10 hover:border-primary/30 hover:bg-primary/10"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {uploading ? "Chargement..." : "Changer"}
                  </Button>
                  {avatarUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAvatarUrl("")}
                      className="rounded-xl hover:bg-destructive/10 hover:text-destructive"
                    >
                      Supprimer
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground/60">
                    Images et GIFs supportés
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.gif"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>

            {/* Username Section */}
            <div className="space-y-3">
              <Label htmlFor="settings-username" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Pseudo</Label>
              <Input
                id="settings-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Votre pseudo"
                maxLength={20}
                className="h-12 input-modern text-base"
              />
            </div>

            {/* Microphone Section */}
            <div className="space-y-4">
              <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Microphone</Label>
              
              <div className="space-y-4">
                <Select value={selectedMic} onValueChange={handleMicChange}>
                  <SelectTrigger className="h-12 input-modern">
                    <SelectValue placeholder="Sélectionner un microphone" />
                  </SelectTrigger>
                  <SelectContent className="glass-solid border-white/10 rounded-xl">
                    {microphones.map((mic) => (
                      <SelectItem key={mic.deviceId} value={mic.deviceId} className="rounded-lg">
                        {mic.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Test Button & Level */}
                <div className="space-y-4 p-5 rounded-2xl bg-secondary/30 border border-white/[0.04]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isTesting ? (
                        <div className="w-10 h-10 rounded-xl bg-success/15 flex items-center justify-center">
                          <Mic className="w-5 h-5 text-success animate-pulse" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-muted/30 flex items-center justify-center">
                          <MicOff className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <span className="text-sm font-semibold">Test du microphone</span>
                    </div>
                    <Button
                      size="sm"
                      variant={isTesting ? "destructive" : "secondary"}
                      onClick={() => { isTesting ? stopTest() : startTest(); }}
                      className="rounded-xl"
                    >
                      {isTesting ? (
                        <>
                          <Square className="w-4 h-4 mr-2" />
                          Arrêter
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Tester
                        </>
                      )}
                    </Button>
                  </div>

                  {isTesting && (
                    <div className="space-y-3 animate-fade-in">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground font-medium">Niveau audio</span>
                        <span className={`font-bold ${getQualityColor()}`}>
                          Qualité: {getQualityLabel()}
                        </span>
                      </div>
                      <div className="h-3 rounded-full bg-muted/30 overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-success via-warning to-destructive transition-all duration-75 rounded-full"
                          style={{ width: `${audioLevel}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground/70">
                        Parlez dans votre microphone pour voir le niveau
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Audio Processing Section */}
            <div className="space-y-4">
              <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Traitement audio</Label>
              
              <div className="space-y-3">
                {/* Noise Suppression */}
                <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/30 border border-white/[0.04] transition-all duration-300 hover:border-white/[0.08]">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${noiseSuppression ? 'bg-primary/15' : 'bg-muted/30'}`}>
                      {noiseSuppression ? (
                        <Volume2 className="w-5 h-5 text-primary" />
                      ) : (
                        <VolumeX className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Suppression du bruit</p>
                      <p className="text-xs text-muted-foreground/70">
                        RNNoise (réseau neuronal) + filtrage vocal avancé
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={noiseSuppression}
                    onCheckedChange={handleNoiseSuppressionToggle}
                  />
                </div>

                {/* Noise Suppression Mode */}
                {noiseSuppression && (
                  <div className="p-4 rounded-2xl bg-secondary/30 border border-white/[0.04] space-y-3 animate-fade-in">
                    <div className="flex items-center gap-3">
                      <Zap className="w-4 h-4 text-primary" />
                      <p className="text-sm font-semibold">Mode de suppression</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setNoiseModeState('standard');
                          setNoiseSuppressionMode('standard');
                        }}
                        className={cn(
                          "p-3 rounded-xl text-left transition-all duration-300 border",
                          noiseMode === 'standard'
                            ? "bg-primary/15 border-primary/30 text-foreground"
                            : "bg-secondary/20 border-white/[0.04] text-muted-foreground hover:border-white/[0.08]"
                        )}
                      >
                        <p className="text-sm font-semibold">Standard</p>
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">Filtrage léger, naturel</p>
                      </button>
                      <button
                        onClick={() => {
                          setNoiseModeState('aggressive');
                          setNoiseSuppressionMode('aggressive');
                        }}
                        className={cn(
                          "p-3 rounded-xl text-left transition-all duration-300 border",
                          noiseMode === 'aggressive'
                            ? "bg-primary/15 border-primary/30 text-foreground"
                            : "bg-secondary/20 border-white/[0.04] text-muted-foreground hover:border-white/[0.08]"
                        )}
                      >
                        <p className="text-sm font-semibold">Agressif</p>
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">Max suppression</p>
                      </button>
                    </div>
                  </div>
                )}

                {/* Echo Cancellation */}
                <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/30 border border-white/[0.04] transition-all duration-300 hover:border-white/[0.08]">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${echoCancellation ? 'bg-primary/15' : 'bg-muted/30'}`}>
                      <Volume2 className={`w-5 h-5 ${echoCancellation ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Annulation d'écho</p>
                      <p className="text-xs text-muted-foreground/70">
                        Empêche l'écho de vos haut-parleurs
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={echoCancellation}
                    onCheckedChange={handleEchoCancellationToggle}
                  />
                </div>

                {/* Auto Gain */}
                <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/30 border border-white/[0.04] transition-all duration-300 hover:border-white/[0.08]">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${autoGain ? 'bg-primary/15' : 'bg-muted/30'}`}>
                      <Mic className={`w-5 h-5 ${autoGain ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Gain automatique</p>
                      <p className="text-xs text-muted-foreground/70">
                        Ajuste automatiquement le volume du micro
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={autoGain}
                    onCheckedChange={handleAutoGainToggle}
                  />
                </div>
              </div>
            </div>

            {/* Push-to-Talk Section */}
            <div className="space-y-4">
              <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Push-to-Talk</Label>
              
              <div className="space-y-3">
                {/* PTT Toggle */}
                <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/30 border border-white/[0.04] transition-all duration-300 hover:border-white/[0.08]">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${pttEnabled ? 'bg-primary/15' : 'bg-muted/30'}`}>
                      <Radio className={`w-5 h-5 ${pttEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Activer Push-to-Talk</p>
                      <p className="text-xs text-muted-foreground/70">
                        Maintenez une touche pour parler
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={pttEnabled}
                    onCheckedChange={handlePttToggle}
                  />
                </div>

                {/* PTT Key Selection */}
                {pttEnabled && (
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-secondary/30 border border-white/[0.04] animate-fade-in transition-all duration-300 hover:border-white/[0.08]">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-muted/30 flex items-center justify-center">
                        <Keyboard className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Touche Push-to-Talk</p>
                        <p className="text-xs text-muted-foreground/70">
                          Appuyez sur la touche souhaitée
                        </p>
                      </div>
                    </div>
                    <Button
                      variant={isCapturing ? "default" : "outline"}
                      size="sm"
                      onClick={() => { isCapturing ? cancelCapture() : startCapture(); }}
                      className="min-w-[100px] rounded-xl"
                    >
                      {isCapturing ? (
                        <span className="animate-pulse">Appuyez...</span>
                      ) : (
                        getKeyDisplayName(pttKey)
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="p-6 pt-4 shrink-0 border-t border-white/[0.04]">
          <Button onClick={handleSave} className="w-full h-12 rounded-2xl btn-premium text-base font-semibold" disabled={uploading}>
            Sauvegarder
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
