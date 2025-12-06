import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Monitor, Zap, Crown } from "lucide-react";
import { ScreenQuality, QUALITY_PRESETS } from "@/hooks/useWebRTCScreenShare";
import { cn } from "@/lib/utils";

interface ScreenShareQualityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectQuality: (quality: ScreenQuality) => void;
}

const qualityOptions: { quality: ScreenQuality; label: string; description: string; icon: typeof Monitor }[] = [
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            Qualité du partage d'écran
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-4">
          {qualityOptions.map((option) => {
            const Icon = option.icon;
            const preset = QUALITY_PRESETS[option.quality];
            return (
              <Button
                key={option.quality}
                variant="outline"
                className={cn(
                  "flex items-center justify-start gap-4 h-auto py-4 px-4",
                  "hover:bg-primary/10 hover:border-primary/50 transition-all"
                )}
                onClick={() => handleSelect(option.quality)}
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold">{option.label}</p>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  {preset.width}×{preset.height}
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
