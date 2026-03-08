import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Monitor, Zap, Crown, Wifi } from "lucide-react";
import { ScreenQuality, QUALITY_PRESETS } from "@/hooks/useWebRTCScreenShare";
import { cn } from "@/lib/utils";

interface ScreenShareQualityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectQuality: (quality: ScreenQuality) => void;
}

const qualityOptions: { quality: ScreenQuality; label: string; description: string; icon: typeof Monitor; badge?: string }[] = [
  {
    quality: "720p30",
    label: "720p 30fps",
    description: "Économique, idéal connexion lente",
    icon: Wifi,
    badge: "Éco",
  },
  {
    quality: "1080p60",
    label: "1080p 60fps",
    description: "Full HD, fluide",
    icon: Monitor,
  },
  {
    quality: "1080p120",
    label: "1080p 120fps",
    description: "Full HD, ultra-fluide",
    icon: Zap,
  },
  {
    quality: "1440p60",
    label: "1440p 60fps",
    description: "QHD, haute qualité",
    icon: Crown,
  },
  {
    quality: "1440p120",
    label: "1440p 120fps",
    description: "QHD, performance max",
    icon: Crown,
    badge: "Max",
  },
];

const ScreenShareQualityDialog = ({
  open,
  onOpenChange,
  onSelectQuality,
}: ScreenShareQualityDialogProps) => {
  const handleSelect = (quality: ScreenQuality) => {
    onSelectQuality(quality);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-premium border-white/[0.08] rounded-3xl sm:max-w-md">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/25 to-primary/10 border border-primary/20 flex items-center justify-center">
              <Monitor className="h-5 w-5 text-primary" />
            </div>
            <span className="gradient-text-static">Qualité du partage</span>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground/70">
            Sélectionnez la qualité. L'audio système sera capturé si disponible.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {qualityOptions.map((option, index) => {
            const Icon = option.icon;
            const preset = QUALITY_PRESETS[option.quality];
            return (
              <Button
                key={option.quality}
                variant="ghost"
                className={cn(
                  "flex items-center justify-start gap-4 h-auto p-5 rounded-2xl",
                  "bg-secondary/30 border border-white/[0.04]",
                  "hover:bg-primary/10 hover:border-primary/30 transition-all duration-300",
                  "animate-fade-in"
                )}
                style={{ animationDelay: `${index * 0.05}s` }}
                onClick={() => handleSelect(option.quality)}
              >
                <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <p className="font-bold">{option.label}</p>
                    {option.badge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/20 text-primary font-bold">
                        {option.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground/70">{option.description}</p>
                </div>
                <div className="text-xs text-muted-foreground/50 text-right font-medium">
                  {preset.width}×{preset.height}
                  <br />
                  <span className="text-[10px]">{Math.round(preset.bitrate / 1000000)} Mbps</span>
                </div>
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScreenShareQualityDialog;
