import { Phone, PhoneOff, Mic, MicOff, Loader2, VolumeX, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VoiceControlsProps {
  isConnected: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  isDeafened?: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleDeafen?: () => void;
}

const VoiceControls = ({
  isConnected,
  isConnecting,
  isMuted,
  isDeafened = false,
  onJoin,
  onLeave,
  onToggleMute,
  onToggleDeafen
}: VoiceControlsProps) => {
  if (!isConnected) {
    return (
      <Button
        onClick={onJoin}
        disabled={isConnecting}
        size="lg"
        className={cn(
          "relative overflow-hidden group",
          "gap-3 px-8 py-7 rounded-2xl font-semibold text-base",
          "bg-gradient-to-r from-emerald-500 to-emerald-600",
          "hover:from-emerald-400 hover:to-emerald-500",
          "text-white shadow-xl shadow-emerald-500/25",
          "transition-all duration-500",
          "hover:shadow-2xl hover:shadow-emerald-500/40 hover:-translate-y-0.5",
          "disabled:opacity-60 disabled:hover:translate-y-0"
        )}
      >
        {/* Shimmer effect */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        </div>
        
        {isConnecting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Connexion...</span>
          </>
        ) : (
          <>
            <div className="relative">
              <Phone className="h-5 w-5" />
              <div className="absolute inset-0 animate-ping opacity-30">
                <Phone className="h-5 w-5" />
              </div>
            </div>
            <span>Rejoindre le vocal</span>
          </>
        )}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-4">
      {/* Mute button */}
      <Button
        onClick={onToggleMute}
        size="lg"
        className={cn(
          "relative group h-16 w-16 rounded-2xl p-0",
          "transition-all duration-300 ease-out",
          "hover:-translate-y-0.5 hover:shadow-xl",
          isMuted 
            ? cn(
                "bg-gradient-to-br from-rose-500/20 to-rose-600/10",
                "border-2 border-rose-500/30",
                "text-rose-400 hover:text-rose-300",
                "hover:from-rose-500/30 hover:to-rose-600/20",
                "hover:shadow-rose-500/20"
              )
            : cn(
                "bg-gradient-to-br from-secondary/80 to-secondary/40",
                "border-2 border-white/[0.08]",
                "text-foreground hover:text-foreground",
                "hover:from-secondary hover:to-secondary/60",
                "hover:border-white/[0.15]"
              )
        )}
      >
        <div className="relative">
          {isMuted ? (
            <MicOff className="h-6 w-6" />
          ) : (
            <Mic className="h-6 w-6" />
          )}
        </div>
        
        {/* Tooltip */}
        <span className={cn(
          "absolute -bottom-10 left-1/2 -translate-x-1/2",
          "px-3 py-1.5 rounded-lg text-xs font-medium",
          "bg-popover/95 backdrop-blur-xl border border-border/50",
          "opacity-0 group-hover:opacity-100 transition-all duration-200",
          "pointer-events-none whitespace-nowrap shadow-xl"
        )}>
          {isMuted ? "Réactiver le micro" : "Couper le micro"}
        </span>
      </Button>

      {/* Deafen button */}
      {onToggleDeafen && (
        <Button
          onClick={onToggleDeafen}
          size="lg"
          className={cn(
            "relative group h-16 w-16 rounded-2xl p-0",
            "transition-all duration-300 ease-out",
            "hover:-translate-y-0.5 hover:shadow-xl",
            isDeafened
              ? cn(
                  "bg-gradient-to-br from-amber-500/20 to-amber-600/10",
                  "border-2 border-amber-500/30",
                  "text-amber-400 hover:text-amber-300",
                  "hover:from-amber-500/30 hover:to-amber-600/20",
                  "hover:shadow-amber-500/20"
                )
              : cn(
                  "bg-gradient-to-br from-secondary/80 to-secondary/40",
                  "border-2 border-white/[0.08]",
                  "text-foreground hover:text-foreground",
                  "hover:from-secondary hover:to-secondary/60",
                  "hover:border-white/[0.15]"
                )
          )}
        >
          <div className="relative">
            {isDeafened ? (
              <VolumeX className="h-6 w-6" />
            ) : (
              <Volume2 className="h-6 w-6" />
            )}
          </div>
          
          <span className={cn(
            "absolute -bottom-10 left-1/2 -translate-x-1/2",
            "px-3 py-1.5 rounded-lg text-xs font-medium",
            "bg-popover/95 backdrop-blur-xl border border-border/50",
            "opacity-0 group-hover:opacity-100 transition-all duration-200",
            "pointer-events-none whitespace-nowrap shadow-xl"
          )}>
            {isDeafened ? "Réactiver le son" : "Se rendre sourd"}
          </span>
        </Button>
      )}

      {/* Leave button */}
      <Button
        onClick={onLeave}
        size="lg"
        className={cn(
          "relative group h-16 w-16 rounded-2xl p-0",
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
          Quitter l'appel
        </span>
      </Button>
    </div>
  );
};

export default VoiceControls;
