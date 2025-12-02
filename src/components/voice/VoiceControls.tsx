import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff, Phone, Loader2 } from "lucide-react";

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
        className="gap-2 min-w-[180px]"
      >
        {isConnecting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Connexion...
          </>
        ) : (
          <>
            <Phone className="h-5 w-5" />
            Rejoindre
          </>
        )}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        onClick={onToggleMute}
        variant={isMuted ? "destructive" : "secondary"}
        size="lg"
        className="gap-2"
      >
        {isMuted ? (
          <>
            <MicOff className="h-5 w-5" />
            Micro coupé
          </>
        ) : (
          <>
            <Mic className="h-5 w-5" />
            Micro actif
          </>
        )}
      </Button>

      <Button
        onClick={onLeave}
        variant="destructive"
        size="lg"
        className="gap-2"
      >
        <PhoneOff className="h-5 w-5" />
        Quitter
      </Button>
    </div>
  );
};

export default VoiceControls;
