import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MicOff, Volume2, VolumeX } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface VoiceUserCardProps {
  username: string;
  avatarUrl?: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isCurrentUser?: boolean;
  audioLevel?: number;
  compact?: boolean;
  volume?: number;
  onVolumeChange?: (volume: number) => void;
}

const VoiceUserCard = ({ 
  username, 
  avatarUrl, 
  isSpeaking, 
  isMuted, 
  isCurrentUser,
  audioLevel = 0,
  compact = false,
  volume,
  onVolumeChange,
}: VoiceUserCardProps) => {
  const [showVolume, setShowVolume] = useState(false);
  const ringScale = isSpeaking ? 1 + audioLevel * 0.15 : 1;
  const glowIntensity = isSpeaking ? Math.max(0.2, audioLevel * 0.6) : 0;

  const hasVolumeControl = !isCurrentUser && volume !== undefined && onVolumeChange;
  const volumePercent = Math.round((volume ?? 1) * 100);

  if (compact) {
    return (
      <div 
        className={cn(
          "relative flex items-center gap-3 p-3 rounded-xl",
          "bg-secondary/30 backdrop-blur-lg",
          "border border-white/[0.04]",
          "transition-all duration-300 ease-out",
          isSpeaking && !isMuted && "bg-emerald-500/[0.07] border-emerald-500/15"
        )}
        onMouseEnter={() => hasVolumeControl && setShowVolume(true)}
        onMouseLeave={() => setShowVolume(false)}
      >
        <div className="relative">
          <Avatar className={cn(
            "h-9 w-9 ring-2 ring-offset-1 ring-offset-background transition-all duration-300",
            isSpeaking && !isMuted ? "ring-emerald-400/60" : isMuted ? "ring-rose-500/25" : "ring-white/[0.06]"
          )}>
            <AvatarImage src={avatarUrl} alt={username} className="object-cover" />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {username.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {isMuted && (
            <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-rose-500/90 flex items-center justify-center ring-2 ring-background">
              <MicOff className="h-2 w-2 text-white" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-sm font-medium truncate transition-colors duration-300",
            isSpeaking && !isMuted && "text-emerald-400"
          )}>
            {username}
            {isCurrentUser && <span className="text-muted-foreground/40 ml-1.5 text-xs">(Vous)</span>}
          </p>
          {showVolume && hasVolumeControl && (
            <div className="flex items-center gap-2 mt-1.5 animate-fade-in">
              <VolumeIcon volume={volume ?? 1} className="h-3 w-3 text-muted-foreground/60 shrink-0" />
              <Slider value={[volume ?? 1]} min={0} max={2} step={0.05} onValueChange={([v]) => onVolumeChange?.(v)} className="flex-1" />
              <span className="text-[10px] text-muted-foreground/50 w-8 text-right tabular-nums">{volumePercent}%</span>
            </div>
          )}
        </div>
        {isSpeaking && !isMuted && (
          <div className="flex items-center gap-[2px] shrink-0">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-[3px] rounded-full bg-emerald-400 transition-all duration-75"
                style={{ height: `${Math.max(6, Math.min(14, audioLevel * 16 + Math.random() * 3))}px` }} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "group relative flex flex-col items-center gap-3 p-5 rounded-2xl",
        "bg-gradient-to-b from-secondary/40 to-secondary/15",
        "backdrop-blur-xl border border-white/[0.04]",
        "transition-all duration-400 ease-out",
        "hover:border-white/[0.08] hover:from-secondary/50 hover:to-secondary/25",
        "hover:shadow-2xl hover:shadow-black/15 hover:-translate-y-0.5",
        isSpeaking && !isMuted && "from-emerald-500/[0.08] to-transparent border-emerald-500/15 shadow-lg shadow-emerald-500/[0.06]"
      )}
      onMouseEnter={() => hasVolumeControl && setShowVolume(true)}
      onMouseLeave={() => setShowVolume(false)}
    >
      {/* Speaking glow */}
      {isSpeaking && !isMuted && (
        <div 
          className="absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-300"
          style={{
            background: `radial-gradient(circle at center, hsl(var(--success) / ${glowIntensity * 0.4}), transparent 70%)`,
          }}
        />
      )}

      {/* Avatar */}
      <div className="relative">
        {isSpeaking && !isMuted && (
          <div 
            className="absolute inset-0 rounded-full animate-[speaking-ring_1.8s_ease-out_infinite]"
            style={{
              background: `radial-gradient(circle, hsl(var(--success) / 0.3), transparent 70%)`,
              transform: `scale(${ringScale * 1.5})`,
            }}
          />
        )}
        
        <Avatar 
          className={cn(
            "h-[72px] w-[72px] transition-all duration-200",
            "ring-[3px] ring-offset-2 ring-offset-transparent",
            isSpeaking && !isMuted 
              ? "ring-emerald-400/60 shadow-lg shadow-emerald-500/20" 
              : isMuted 
                ? "ring-rose-500/30" 
                : "ring-white/[0.08]",
          )}
          style={{
            transform: `scale(${ringScale})`,
            transition: 'transform 0.15s ease-out'
          }}
        >
          <AvatarImage src={avatarUrl} alt={username} className="object-cover" />
          <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-primary text-lg font-bold">
            {username.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        
        {/* Status badge */}
        <div 
          className={cn(
            "absolute -bottom-1 -right-1 h-5 w-5 rounded-full",
            "flex items-center justify-center",
            "ring-[2.5px] ring-background transition-all duration-300",
            isMuted 
              ? "bg-rose-500" 
              : isSpeaking 
                ? "bg-emerald-400 animate-pulse" 
                : "bg-emerald-500/60"
          )}
        >
          {isMuted && <MicOff className="h-2.5 w-2.5 text-white" />}
          {!isMuted && isSpeaking && <Volume2 className="h-2.5 w-2.5 text-white" />}
        </div>
      </div>

      {/* Audio bars */}
      {isSpeaking && !isMuted && (
        <div className="flex items-center justify-center gap-[2px] h-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-[3px] rounded-full bg-emerald-400/80 transition-all duration-75"
              style={{
                height: `${Math.max(3, Math.min(12, audioLevel * 14 + Math.random() * 3))}px`,
              }}
            />
          ))}
        </div>
      )}
      
      {/* Name */}
      <div className="text-center space-y-0.5 max-w-[110px]">
        <p className={cn(
          "text-sm font-semibold truncate transition-colors duration-300",
          isSpeaking && !isMuted ? "text-emerald-400" : "text-foreground/90"
        )}>
          {username}
        </p>
        {isCurrentUser && (
          <p className="text-[9px] text-muted-foreground/40 uppercase tracking-[0.15em] font-medium">
            Vous
          </p>
        )}
      </div>

      {/* Volume slider */}
      {showVolume && hasVolumeControl && (
        <div className="w-full px-2 space-y-1 animate-fade-in">
          <div className="flex items-center gap-2">
            <VolumeIcon volume={volume ?? 1} className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
            <Slider value={[volume ?? 1]} min={0} max={2} step={0.05} onValueChange={([v]) => onVolumeChange?.(v)} className="flex-1" />
            <span className="text-xs text-muted-foreground/50 w-10 text-right font-medium tabular-nums">{volumePercent}%</span>
          </div>
        </div>
      )}
    </div>
  );
};

function VolumeIcon({ volume, className }: { volume: number; className?: string }) {
  if (volume === 0) return <VolumeX className={className} />;
  return <Volume2 className={className} />;
}

export default VoiceUserCard;
