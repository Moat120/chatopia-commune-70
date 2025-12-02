import { Wifi, WifiOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConnectionQuality } from "@/hooks/useVoiceChannel";

interface ConnectionQualityIndicatorProps {
  quality: ConnectionQuality;
}

const ConnectionQualityIndicator = ({ quality }: ConnectionQualityIndicatorProps) => {
  const getConfig = () => {
    switch (quality) {
      case 'excellent':
        return {
          icon: Wifi,
          label: 'Excellente',
          color: 'text-success',
          bars: 4,
        };
      case 'good':
        return {
          icon: Wifi,
          label: 'Bonne',
          color: 'text-warning',
          bars: 3,
        };
      case 'poor':
        return {
          icon: WifiOff,
          label: 'Faible',
          color: 'text-destructive',
          bars: 1,
        };
      case 'connecting':
        return {
          icon: Loader2,
          label: 'Connexion...',
          color: 'text-muted-foreground',
          bars: 0,
        };
    }
  };

  const config = getConfig();
  const Icon = config.icon;

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-full",
      "bg-secondary/50 backdrop-blur-sm border border-border/30",
      "text-xs font-medium transition-colors duration-300"
    )}>
      <Icon className={cn(
        "h-3.5 w-3.5",
        config.color,
        quality === 'connecting' && "animate-spin"
      )} />
      
      {/* Signal bars */}
      <div className="flex items-end gap-0.5 h-3">
        {[1, 2, 3, 4].map((bar) => (
          <div
            key={bar}
            className={cn(
              "w-1 rounded-full transition-all duration-300",
              bar <= config.bars 
                ? config.color.replace('text-', 'bg-')
                : "bg-muted-foreground/20"
            )}
            style={{ height: `${bar * 25}%` }}
          />
        ))}
      </div>
      
      <span className={cn("hidden sm:inline", config.color)}>
        {config.label}
      </span>
    </div>
  );
};

export default ConnectionQualityIndicator;
