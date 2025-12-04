import { Button } from "@/components/ui/button";
import {
  Mic,
  MicOff,
  PhoneOff,
  Phone,
  Loader2,
  Monitor,
  MonitorOff,
} from "lucide-react";
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
        className="h-14 px-8 text-lg rounded-2xl bg-success hover:bg-success/90 text-success-foreground shadow-lg shadow-success/20"
      >
        {isConnecting ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Connexion...
          </>
        ) : (
          <>
            <Phone className="h-5 w-5 mr-2" />
            Rejoindre
          </>
        )}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {/* Mute Toggle */}
      <Button
        variant="outline"
        size="lg"
        onClick={onToggleMute}
        className={cn(
          "h-14 w-14 rounded-full transition-all duration-300",
          isMuted
            ? "bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20"
            : "bg-secondary/50 border-border/50 hover:bg-secondary"
        )}
      >
        {isMuted ? (
          <MicOff className="h-6 w-6" />
        ) : (
          <Mic className="h-6 w-6" />
        )}
      </Button>

      {/* Screen Share Toggle */}
      <Button
        variant="outline"
        size="lg"
        onClick={onToggleScreenShare}
        className={cn(
          "h-14 w-14 rounded-full transition-all duration-300",
          isScreenSharing
            ? "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
            : "bg-secondary/50 border-border/50 hover:bg-secondary"
        )}
      >
        {isScreenSharing ? (
          <MonitorOff className="h-6 w-6" />
        ) : (
          <Monitor className="h-6 w-6" />
        )}
      </Button>

      {/* Leave Button */}
      <Button
        variant="destructive"
        size="lg"
        onClick={onLeave}
        className="h-14 w-14 rounded-full shadow-lg shadow-destructive/20"
      >
        <PhoneOff className="h-6 w-6" />
      </Button>
    </div>
  );
};

export default VoiceControlsWithScreenShare;
