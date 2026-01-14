import { Phone, PhoneOff, Mic, MicOff, Monitor, MonitorOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VoiceControlsWithScreenShareProps {
  isConnected: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  isScreenSharing: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleScreenShare: () => void;
}

const VoiceControlsWithScreenShare = ({
  isConnected,
  isConnecting,
  isMuted,
  isScreenSharing,
  onJoin,
  onLeave,
  onToggleMute,
  onToggleScreenShare,
}: VoiceControlsWithScreenShareProps) => {
  if (!isConnected) {
    return (
      <Button
        onClick={onJoin}
        disabled={isConnecting}
        className={cn(
          "relative overflow-hidden group",
          "h-16 px-10 text-lg rounded-2xl font-semibold",
          "bg-gradient-to-r from-emerald-500 to-emerald-600",
          "hover:from-emerald-400 hover:to-emerald-500",
          "text-white shadow-xl shadow-emerald-500/25",
          "transition-all duration-500",
          "hover:shadow-2xl hover:shadow-emerald-500/40 hover:-translate-y-0.5",
          "disabled:opacity-60"
        )}
      >
        {/* Shimmer effect */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        </div>
        
        {isConnecting ? (
          <>
            <Loader2 className="h-5 w-5 mr-3 animate-spin" />
            Connexion...
          </>
        ) : (
          <>
            <div className="relative mr-3">
              <Phone className="h-5 w-5" />
              <div className="absolute inset-0 animate-ping opacity-30">
                <Phone className="h-5 w-5" />
              </div>
            </div>
            Rejoindre
          </>
        )}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-4">
      {/* Mute Toggle */}
      <Button
        size="lg"
        onClick={onToggleMute}
        className={cn(
          "relative group h-16 w-16 rounded-full p-0",
          "transition-all duration-300 ease-out",
          "hover:-translate-y-0.5",
          isMuted
            ? cn(
                "bg-gradient-to-br from-rose-500/20 to-rose-600/10",
                "border-2 border-rose-500/30",
                "text-rose-400 hover:text-rose-300",
                "hover:from-rose-500/30 hover:to-rose-600/20",
                "hover:shadow-xl hover:shadow-rose-500/20"
              )
            : cn(
                "bg-gradient-to-br from-secondary/80 to-secondary/40",
                "border-2 border-white/[0.08]",
                "text-foreground",
                "hover:from-secondary hover:to-secondary/60",
                "hover:border-white/[0.15]",
                "hover:shadow-xl hover:shadow-black/20"
              )
        )}
      >
        {isMuted ? (
          <MicOff className="h-6 w-6" />
        ) : (
          <Mic className="h-6 w-6" />
        )}
        
        {/* Tooltip */}
        <span className={cn(
          "absolute -bottom-10 left-1/2 -translate-x-1/2",
          "px-3 py-1.5 rounded-lg text-xs font-medium",
          "bg-popover/95 backdrop-blur-xl border border-border/50",
          "opacity-0 group-hover:opacity-100 transition-all duration-200",
          "pointer-events-none whitespace-nowrap shadow-xl"
        )}>
          {isMuted ? "Réactiver" : "Couper"}
        </span>
      </Button>

      {/* Screen Share Toggle */}
      <Button
        size="lg"
        onClick={onToggleScreenShare}
        className={cn(
          "relative group h-16 w-16 rounded-full p-0",
          "transition-all duration-300 ease-out",
          "hover:-translate-y-0.5",
          isScreenSharing
            ? cn(
                "bg-gradient-to-br from-primary/30 to-primary/10",
                "border-2 border-primary/40",
                "text-primary hover:text-primary",
                "hover:from-primary/40 hover:to-primary/20",
                "hover:shadow-xl hover:shadow-primary/20"
              )
            : cn(
                "bg-gradient-to-br from-secondary/80 to-secondary/40",
                "border-2 border-white/[0.08]",
                "text-foreground",
                "hover:from-secondary hover:to-secondary/60",
                "hover:border-white/[0.15]",
                "hover:shadow-xl hover:shadow-black/20"
              )
        )}
      >
        {isScreenSharing ? (
          <MonitorOff className="h-6 w-6" />
        ) : (
          <Monitor className="h-6 w-6" />
        )}
        
        {/* Tooltip */}
        <span className={cn(
          "absolute -bottom-10 left-1/2 -translate-x-1/2",
          "px-3 py-1.5 rounded-lg text-xs font-medium",
          "bg-popover/95 backdrop-blur-xl border border-border/50",
          "opacity-0 group-hover:opacity-100 transition-all duration-200",
          "pointer-events-none whitespace-nowrap shadow-xl"
        )}>
          {isScreenSharing ? "Arrêter le partage" : "Partager l'écran"}
        </span>
      </Button>

      {/* Leave Button */}
      <Button
        size="lg"
        onClick={onLeave}
        className={cn(
          "relative group h-16 w-16 rounded-full p-0",
          "bg-gradient-to-br from-rose-500 to-rose-600",
          "hover:from-rose-400 hover:to-rose-500",
          "text-white",
          "shadow-xl shadow-rose-500/25",
          "transition-all duration-300 ease-out",
          "hover:shadow-2xl hover:shadow-rose-500/40 hover:-translate-y-0.5"
        )}
      >
        <PhoneOff className="h-6 w-6" />
        
        {/* Tooltip */}
        <span className={cn(
          "absolute -bottom-10 left-1/2 -translate-x-1/2",
          "px-3 py-1.5 rounded-lg text-xs font-medium",
          "bg-popover/95 backdrop-blur-xl border border-border/50",
          "opacity-0 group-hover:opacity-100 transition-all duration-200",
          "pointer-events-none whitespace-nowrap shadow-xl"
        )}>
          Quitter
        </span>
      </Button>
    </div>
  );
};

export default VoiceControlsWithScreenShare;
