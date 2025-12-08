import { useState, useRef, useEffect } from "react";
import { Settings, Upload, Volume2, VolumeX, Mic, MicOff, Play, Square } from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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

// Get optimized audio constraints
export const getAudioConstraints = (): MediaTrackConstraints => {
  const selectedMic = getSelectedMicrophone();
  const noiseSuppression = getNoiseSuppression();
  const echoCancellation = getEchoCancellation();
  const autoGain = getAutoGain();

  return {
    deviceId: selectedMic ? { exact: selectedMic } : undefined,
    echoCancellation: { ideal: echoCancellation },
    noiseSuppression: { ideal: noiseSuppression },
    autoGainControl: { ideal: autoGain },
    sampleRate: { ideal: 48000 },
    channelCount: { ideal: 1 },
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
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const testStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const { toast } = useToast();

  // Load microphones
  useEffect(() => {
    const loadMicrophones = async () => {
      try {
        // Request permission first
        await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices
          .filter(d => d.kind === "audioinput")
          .map(d => ({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
          }));
        
        setMicrophones(mics);
        
        // Set default if none selected
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

  // Sync with profile changes
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
  };

  const handleEchoCancellationToggle = (enabled: boolean) => {
    setEchoCancellationState(enabled);
    setEchoCancellation(enabled);
  };

  const handleAutoGainToggle = (enabled: boolean) => {
    setAutoGainState(enabled);
    setAutoGain(enabled);
  };

  const handleMicChange = (deviceId: string) => {
    setSelectedMic(deviceId);
    setSelectedMicrophone(deviceId);
    
    // Restart test if currently testing
    if (isTesting) {
      stopTest();
      setTimeout(() => startTest(), 100);
    }
  };

  const startTest = async () => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedMic ? { exact: selectedMic } : undefined,
          echoCancellation: { ideal: echoCancellation },
          noiseSuppression: { ideal: noiseSuppression },
          autoGainControl: { ideal: autoGain },
          sampleRate: { ideal: 48000 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      testStreamRef.current = stream;

      // Create audio context and analyser
      audioContextRef.current = new AudioContext({ sampleRate: 48000 });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.5;
      source.connect(analyserRef.current);

      setIsTesting(true);

      // Start level monitoring
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      let noiseFloor = 255;
      let peakLevel = 0;
      let sampleCount = 0;

      const monitor = () => {
        if (!analyserRef.current || !isTesting) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate RMS level
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const normalizedLevel = Math.min(rms / 100, 1);
        
        setAudioLevel(normalizedLevel * 100);

        // Track noise floor and peak for quality assessment
        sampleCount++;
        if (sampleCount > 10) {
          const avgLevel = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          if (avgLevel < noiseFloor && avgLevel > 0) noiseFloor = avgLevel;
          if (avgLevel > peakLevel) peakLevel = avgLevel;

          // Calculate signal-to-noise ratio
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
    }
  };

  const stopTest = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach(t => t.stop());
      testStreamRef.current = null;
    }

    if (audioContextRef.current?.state !== "closed") {
      audioContextRef.current?.close();
      audioContextRef.current = null;
    }

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
      case "good": return "text-yellow-500";
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
          className="w-8 h-8"
          title="Paramètres"
        >
          <Settings className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Paramètres</DialogTitle>
          <DialogDescription>
            Personnalisez votre profil et vos préférences audio
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          {/* Avatar Section */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Photo de profil</Label>
            <div className="flex items-center gap-4">
              <Avatar className="w-20 h-20 ring-2 ring-primary/20">
                <AvatarImage src={avatarUrl} className="object-cover" />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {username.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
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
                  >
                    Supprimer
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
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
          <div className="space-y-2">
            <Label htmlFor="settings-username">Pseudo</Label>
            <Input
              id="settings-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Votre pseudo"
              maxLength={20}
            />
          </div>

          {/* Microphone Section */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Microphone</Label>
            
            <div className="space-y-3">
              <Select value={selectedMic} onValueChange={handleMicChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un microphone" />
                </SelectTrigger>
                <SelectContent>
                  {microphones.map((mic) => (
                    <SelectItem key={mic.deviceId} value={mic.deviceId}>
                      {mic.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Test Button & Level */}
              <div className="space-y-3 p-4 rounded-xl bg-secondary/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isTesting ? (
                      <Mic className="w-5 h-5 text-success animate-pulse" />
                    ) : (
                      <MicOff className="w-5 h-5 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">Test du microphone</span>
                  </div>
                  <Button
                    size="sm"
                    variant={isTesting ? "destructive" : "secondary"}
                    onClick={isTesting ? stopTest : startTest}
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
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Niveau audio</span>
                        <span className={getQualityColor()}>
                          Qualité: {getQualityLabel()}
                        </span>
                      </div>
                      <Progress 
                        value={audioLevel} 
                        className="h-3"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Parlez dans votre microphone pour voir le niveau
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Audio Processing Section */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Traitement audio</Label>
            
            <div className="space-y-3">
              {/* Noise Suppression */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30">
                <div className="flex items-center gap-3">
                  {noiseSuppression ? (
                    <Volume2 className="w-5 h-5 text-primary" />
                  ) : (
                    <VolumeX className="w-5 h-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium">Suppression du bruit</p>
                    <p className="text-xs text-muted-foreground">
                      Réduit le bruit de fond (ventilateur, clavier, etc.)
                    </p>
                  </div>
                </div>
                <Switch
                  checked={noiseSuppression}
                  onCheckedChange={handleNoiseSuppressionToggle}
                />
              </div>

              {/* Echo Cancellation */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30">
                <div className="flex items-center gap-3">
                  <Volume2 className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Annulation d'écho</p>
                    <p className="text-xs text-muted-foreground">
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
              <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30">
                <div className="flex items-center gap-3">
                  <Mic className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Gain automatique</p>
                    <p className="text-xs text-muted-foreground">
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

          <Button onClick={handleSave} className="w-full" disabled={uploading}>
            Sauvegarder
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;