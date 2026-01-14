import { Wifi, WifiOff, Activity, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConnectionQuality } from "@/hooks/useVoiceChannel";

interface ConnectionQualityIndicatorProps {
  quality: ConnectionQuality;
  ping?: number;
  showPing?: boolean;
}

const ConnectionQualityIndicator = ({ 
  quality, 
  ping = 0,
  showPing = true 
}: ConnectionQualityIndicatorProps) => {
  const getConfig = () => {
    switch (quality) {
      case 'excellent':
        return {
          icon: Zap,
          label: 'Excellente',
          color: 'text-emerald-400',
          bgColor: 'bg-emerald-500/10',
          borderColor: 'border-emerald-500/20',
          glowColor: 'shadow-emerald-500/20',
          bars: 4,
        };
      case 'good':
        return {
          icon: Wifi,
          label: 'Bonne',
          color: 'text-amber-400',
          bgColor: 'bg-amber-500/10',
          borderColor: 'border-amber-500/20',
          glowColor: 'shadow-amber-500/20',
          bars: 3,
        };
      case 'poor':
        return {
          icon: WifiOff,
          label: 'Faible',
          color: 'text-rose-400',
          bgColor: 'bg-rose-500/10',
          borderColor: 'border-rose-500/20',
          glowColor: 'shadow-rose-500/20',
          bars: 1,
        };
      case 'connecting':
        return {
          icon: Activity,
          label: 'Connexion',
          color: 'text-muted-foreground',
          bgColor: 'bg-muted/30',
          borderColor: 'border-border/30',
          glowColor: '',
          bars: 0,
        };
    }
  };

  const config = getConfig();
  const Icon = config.icon;

  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-2 rounded-2xl",
      "backdrop-blur-xl border transition-all duration-500",
      config.bgColor,
      config.borderColor,
      config.glowColor && `shadow-lg ${config.glowColor}`
    )}>
      {/* Icon with pulse effect */}
      <div className="relative">
        <Icon className={cn(
          "h-4 w-4 transition-all duration-300",
          config.color,
          quality === 'connecting' && "animate-pulse"
        )} />
        {quality === 'excellent' && (
          <div className="absolute inset-0 animate-ping">
            <Icon className="h-4 w-4 text-emerald-400/30" />
          </div>
        )}
      </div>
      
      {/* Signal bars with glow */}
      <div className="flex items-end gap-0.5 h-4">
        {[1, 2, 3, 4].map((bar) => (
          <div
            key={bar}
            className={cn(
              "w-1 rounded-full transition-all duration-500",
              bar <= config.bars 
                ? cn(
                    config.color.replace('text-', 'bg-'),
                    "shadow-sm",
                    quality === 'excellent' && "animate-pulse"
                  )
                : "bg-muted-foreground/10"
            )}
            style={{ 
              height: `${bar * 25}%`,
              transitionDelay: `${bar * 50}ms`
            }}
          />
        ))}
      </div>
      
      {/* Ping display */}
      {showPing && quality !== 'connecting' && (
        <div className="flex items-center gap-1.5 pl-2 border-l border-white/5">
          <span className={cn(
            "text-xs font-mono font-medium tabular-nums",
            config.color
          )}>
            {ping}
          </span>
          <span className="text-[10px] text-muted-foreground/60">ms</span>
        </div>
      )}

      {/* Quality label - hidden on mobile */}
      <span className={cn(
        "hidden sm:inline text-xs font-medium",
        config.color
      )}>
        {config.label}
      </span>
    </div>
  );
};

export default ConnectionQualityIndicator;
