import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff, Phone, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceControlsProps {
  isConnected: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
}

const VoiceControls = ({
  isConnected,
  isConnecting,
  isMuted,
  onJoin,
  onLeave,
  onToggleMute
}: VoiceControlsProps) => {
  if (!isConnected) {
    return (
      <Button
        onClick={onJoin}
        disabled={isConnecting}
        size="lg"
        className={cn(
          "gap-3 px-8 py-6 rounded-2xl font-medium",
          "bg-success hover:bg-success/90 text-success-foreground",
          "transition-all duration-300",
          "hover:shadow-lg hover:shadow-success/20",
          isConnecting && "opacity-70"
        )}
      >
        {isConnecting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Connexion...</span>
          </>
        ) : (
          <>
            <Phone className="h-5 w-5" />
            <span>Rejoindre le vocal</span>
          </>
        )}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        onClick={onToggleMute}
        size="lg"
        className={cn(
          "gap-2 px-6 py-6 rounded-2xl font-medium transition-all duration-300",
          isMuted 
            ? "bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20" 
            : "bg-secondary hover:bg-secondary/80 text-foreground border border-border/50"
        )}
      >
        {isMuted ? (
          <>
            <MicOff className="h-5 w-5" />
            <span>Réactiver</span>
          </>
        ) : (
          <>
            <Mic className="h-5 w-5" />
            <span>Couper</span>
          </>
        )}
      </Button>

      <Button
        onClick={onLeave}
        size="lg"
        className={cn(
          "gap-2 px-6 py-6 rounded-2xl font-medium",
          "bg-destructive hover:bg-destructive/90",
          "transition-all duration-300",
          "hover:shadow-lg hover:shadow-destructive/20"
        )}
      >
        <PhoneOff className="h-5 w-5" />
        <span>Quitter</span>
      </Button>
    </div>
  );
};

export default VoiceControls;
