import { useState, useRef, useEffect } from "react";
import { Settings, Upload, Volume2, VolumeX } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Store noise suppression setting in localStorage
const NOISE_SUPPRESSION_KEY = "noiseSuppressionEnabled";

export const getNoiseSuppression = (): boolean => {
  const stored = localStorage.getItem(NOISE_SUPPRESSION_KEY);
  return stored !== "false"; // Default to true
};

export const setNoiseSuppression = (enabled: boolean) => {
  localStorage.setItem(NOISE_SUPPRESSION_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent("noiseSuppressionChange", { detail: enabled }));
};

const SettingsDialog = () => {
  const { profile, updateProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState(profile?.username || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || "");
  const [noiseSuppression, setNoiseSuppressionState] = useState(getNoiseSuppression());
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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

    // Accept images and GIFs - no size limit
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
      // Convert to base64 for storage
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

  const handleSave = async () => {
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Paramètres du profil</DialogTitle>
          <DialogDescription>
            Personnalisez votre profil et vos préférences audio
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          {/* Avatar Section */}
          <div className="space-y-3">
            <Label>Photo de profil</Label>
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

          {/* Audio Settings Section */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Paramètres audio</Label>
            
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
                    Réduit le bruit de fond du microphone
                  </p>
                </div>
              </div>
              <Switch
                checked={noiseSuppression}
                onCheckedChange={handleNoiseSuppressionToggle}
              />
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