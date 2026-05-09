import { Phone, PhoneOff, Mic, MicOff, Monitor, MonitorOff, Loader2, VolumeX, Volume2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface VoiceControlsWithScreenShareProps {
  isConnected: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  isScreenSharing: boolean;
  isDeafened?: boolean;
  noiseBypass?: boolean;
  noiseEngine?: string | null;
  onJoin: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleScreenShare: () => void;
  onToggleDeafen?: () => void;
  onToggleNoise?: () => void;
}

const ControlButton = ({
  onClick,
  active,
  activeColor = "rose",
  icon,
  activeIcon,
  label,
}: {
  onClick: () => void;
  active: boolean;
  activeColor?: "rose" | "amber" | "primary";
  icon: React.ReactNode;
  activeIcon: React.ReactNode;
  label: string;
}) => {
  const colorMap = {
    rose: {
      bg: "from-rose-500/20 to-rose-600/10",
      border: "border-rose-500/30",
      text: "text-rose-400 hover:text-rose-300",
      hoverBg: "hover:from-rose-500/30 hover:to-rose-600/20",
      shadow: "hover:shadow-rose-500/15",
    },
    amber: {
      bg: "from-amber-500/20 to-amber-600/10",
      border: "border-amber-500/30",
      text: "text-amber-400 hover:text-amber-300",
      hoverBg: "hover:from-amber-500/30 hover:to-amber-600/20",
      shadow: "hover:shadow-amber-500/15",
    },
    primary: {
      bg: "from-primary/25 to-primary/10",
      border: "border-primary/35",
      text: "text-primary hover:text-primary",
      hoverBg: "hover:from-primary/35 hover:to-primary/15",
      shadow: "hover:shadow-primary/15",
    },
  };
  const c = colorMap[activeColor];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="lg"
          onClick={onClick}
          className={cn(
            "relative h-14 w-14 rounded-2xl p-0",
            "transition-all duration-300 ease-out",
            "hover:-translate-y-0.5 active:translate-y-0 active:scale-95",
            active
              ? cn(
                  `bg-gradient-to-br ${c.bg}`,
                  `border-2 ${c.border}`,
                  c.text,
                  c.hoverBg,
                  `hover:shadow-xl ${c.shadow}`
                )
              : cn(
                  "bg-gradient-to-br from-secondary/70 to-secondary/30",
                  "border-2 border-white/[0.06]",
                  "text-foreground/80",
                  "hover:from-secondary/90 hover:to-secondary/50",
                  "hover:border-white/[0.12]",
                  "hover:shadow-xl hover:shadow-black/15"
                )
          )}
        >
          <span className="transition-transform duration-200">
            {active ? activeIcon : icon}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent className="text-xs font-medium">{label}</TooltipContent>
    </Tooltip>
  );
};

const VoiceControlsWithScreenShare = ({
  isConnected,
  isConnecting,
  isMuted,
  isScreenSharing,
  isDeafened = false,
  noiseBypass = false,
  noiseEngine,
  onJoin,
  onLeave,
  onToggleMute,
  onToggleScreenShare,
  onToggleDeafen,
  onToggleNoise,
}: VoiceControlsWithScreenShareProps) => {
  if (!isConnected) {
    return (
      <Button
        onClick={onJoin}
        disabled={isConnecting}
        className={cn(
          "relative overflow-hidden group",
          "h-14 px-10 text-base rounded-2xl font-semibold",
          "bg-gradient-to-r from-emerald-500 to-emerald-600",
          "hover:from-emerald-400 hover:to-emerald-500",
          "text-white shadow-lg shadow-emerald-500/20",
          "transition-all duration-400",
          "hover:shadow-xl hover:shadow-emerald-500/30 hover:-translate-y-0.5",
          "active:translate-y-0 active:scale-[0.97]",
          "disabled:opacity-50 disabled:pointer-events-none"
        )}
      >
        {/* Shine effect */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        </div>
        
        {isConnecting ? (
          <span className="flex items-center gap-2.5">
            <Loader2 className="h-4.5 w-4.5 animate-spin" />
            Connexion…
          </span>
        ) : (
          <span className="flex items-center gap-2.5">
            <div className="relative">
              <Phone className="h-4.5 w-4.5" />
              <Phone className="h-4.5 w-4.5 absolute inset-0 animate-ping opacity-20" />
            </div>
            Rejoindre l'appel
          </span>
        )}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3 animate-scale-in">
      <ControlButton
        onClick={onToggleMute}
        active={isMuted}
        activeColor="rose"
        icon={<Mic className="h-5 w-5" />}
        activeIcon={<MicOff className="h-5 w-5" />}
        label={isMuted ? "Réactiver le micro" : "Couper le micro"}
      />

      {onToggleDeafen && (
        <ControlButton
          onClick={onToggleDeafen}
          active={isDeafened}
          activeColor="amber"
          icon={<Volume2 className="h-5 w-5" />}
          activeIcon={<VolumeX className="h-5 w-5" />}
          label={isDeafened ? "Activer le son" : "Désactiver le son"}
        />
      )}

      <ControlButton
        onClick={onToggleScreenShare}
        active={isScreenSharing}
        activeColor="primary"
        icon={<Monitor className="h-5 w-5" />}
        activeIcon={<MonitorOff className="h-5 w-5" />}
        label={isScreenSharing ? "Arrêter le partage" : "Partager l'écran"}
      />

      {onToggleNoise && (
        <ControlButton
          onClick={onToggleNoise}
          active={!noiseBypass}
          activeColor="primary"
          icon={<Sparkles className="h-5 w-5 opacity-50" />}
          activeIcon={<Sparkles className="h-5 w-5 drop-shadow-[0_0_6px_hsl(var(--primary)/0.7)]" />}
          label={noiseBypass
            ? "Activer la suppression de bruit"
            : `Suppression de bruit active${noiseEngine ? ` (${noiseEngine})` : ""}`}
        />
      )}

      {/* Separator */}
      <div className="w-px h-8 bg-white/[0.06] mx-1" />

      {/* Leave Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="lg"
            onClick={onLeave}
            className={cn(
              "h-14 w-14 rounded-2xl p-0",
              "bg-gradient-to-br from-rose-500 to-rose-600",
              "hover:from-rose-400 hover:to-rose-500",
              "text-white",
              "shadow-lg shadow-rose-500/20",
              "transition-all duration-300 ease-out",
              "hover:shadow-xl hover:shadow-rose-500/30 hover:-translate-y-0.5",
              "active:translate-y-0 active:scale-95"
            )}
          >
            <PhoneOff className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs font-medium">Quitter l'appel</TooltipContent>
      </Tooltip>
    </div>
  );
};

export default VoiceControlsWithScreenShare;
