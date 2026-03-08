import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MicOff, Volume2, VolumeX, VolumeOff } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const [popoverOpen, setPopoverOpen] = useState(false);
  const ringScale = isSpeaking ? 1 + audioLevel * 0.15 : 1;
  const glowIntensity = isSpeaking ? Math.max(0.2, audioLevel * 0.6) : 0;

  const hasVolumeControl = !isCurrentUser && volume !== undefined && onVolumeChange;
  const volumePercent = Math.round((volume ?? 1) * 100);
  const isUserMutedByMe = (volume ?? 1) === 0;

  const handleMuteToggle = () => {
    if (!onVolumeChange) return;
    onVolumeChange(isUserMutedByMe ? 1 : 0);
  };

  const popoverContent = hasVolumeControl ? (
    <PopoverContent 
      side={compact ? "right" : "bottom"} 
      align="center" 
      className="w-56 p-3 space-y-3 bg-card border-border shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <Avatar className="h-8 w-8">
          <AvatarImage src={avatarUrl} alt={username} className="object-cover" />
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {username.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="text-sm font-semibold truncate">{username}</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">Volume</span>
          <span className="text-xs text-muted-foreground tabular-nums">{volumePercent}%</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleMuteToggle} className="shrink-0 p-1 rounded hover:bg-muted transition-colors">
            <VolumeIcon volume={volume ?? 1} className="h-4 w-4 text-muted-foreground" />
          </button>
          <Slider 
            value={[volume ?? 1]} 
            min={0} 
            max={2} 
            step={0.05} 
            onValueChange={([v]) => onVolumeChange?.(v)} 
            className="flex-1" 
          />
        </div>
      </div>

      <button
        onClick={handleMuteToggle}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          isUserMutedByMe 
            ? "bg-destructive/10 text-destructive hover:bg-destructive/20" 
            : "hover:bg-muted text-muted-foreground"
        )}
      >
        {isUserMutedByMe ? <VolumeOff className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        {isUserMutedByMe ? "Rétablir le son" : "Couper le son"}
      </button>
    </PopoverContent>
  ) : null;

  if (compact) {
    const card = (
      <div 
        className={cn(
          "relative flex items-center gap-3 p-3 rounded-xl",
          "bg-secondary/30 backdrop-blur-lg",
          "border border-white/[0.04]",
          "transition-all duration-300 ease-out",
          hasVolumeControl && "cursor-pointer hover:bg-secondary/50",
          isSpeaking && !isMuted && "bg-emerald-500/[0.07] border-emerald-500/15"
        )}
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
          {(isMuted || isUserMutedByMe) && (
            <div className={cn(
              "absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full flex items-center justify-center ring-2 ring-background",
              isUserMutedByMe ? "bg-amber-500" : "bg-rose-500/90"
            )}>
              {isUserMutedByMe ? <VolumeOff className="h-2 w-2 text-white" /> : <MicOff className="h-2 w-2 text-white" />}
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
          {isUserMutedByMe && (
            <p className="text-[10px] text-amber-500/80 font-medium">Son coupé par vous</p>
          )}
        </div>
        {isSpeaking && !isMuted && !isUserMutedByMe && (
          <div className="flex items-center gap-[2px] shrink-0">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-[3px] rounded-full bg-emerald-400 transition-all duration-75"
                style={{ height: `${Math.max(6, Math.min(14, audioLevel * 16 + Math.random() * 3))}px` }} />
            ))}
          </div>
        )}
      </div>
    );

    if (!hasVolumeControl) return card;

    return (
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>{card}</PopoverTrigger>
        {popoverContent}
      </Popover>
    );
  }

  // Full card (non-compact)
  const fullCard = (
    <div 
      className={cn(
        "group relative flex flex-col items-center gap-3 p-5 rounded-2xl",
        "bg-gradient-to-b from-secondary/40 to-secondary/15",
        "backdrop-blur-xl border border-white/[0.04]",
        "transition-all duration-400 ease-out",
        "hover:border-white/[0.08] hover:from-secondary/50 hover:to-secondary/25",
        "hover:shadow-2xl hover:shadow-black/15 hover:-translate-y-0.5",
        hasVolumeControl && "cursor-pointer",
        isSpeaking && !isMuted && "from-emerald-500/[0.08] to-transparent border-emerald-500/15 shadow-lg shadow-emerald-500/[0.06]"
      )}
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
          <>
            <div 
              className="absolute inset-0 rounded-full animate-speaking-ring"
              style={{
                background: `radial-gradient(circle, hsl(var(--success) / 0.4), transparent 70%)`,
              }}
            />
            <div 
              className="absolute inset-0 rounded-full animate-speaking-ring"
              style={{
                background: `radial-gradient(circle, hsl(var(--success) / 0.25), transparent 70%)`,
                animationDelay: '0.4s',
              }}
            />
          </>
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
            isUserMutedByMe
              ? "bg-amber-500"
              : isMuted 
                ? "bg-rose-500" 
                : isSpeaking 
                  ? "bg-emerald-400 animate-pulse" 
                  : "bg-emerald-500/60"
          )}
        >
          {isUserMutedByMe && <VolumeOff className="h-2.5 w-2.5 text-white" />}
          {!isUserMutedByMe && isMuted && <MicOff className="h-2.5 w-2.5 text-white" />}
          {!isUserMutedByMe && !isMuted && isSpeaking && <Volume2 className="h-2.5 w-2.5 text-white" />}
        </div>
      </div>

      {/* Audio bars */}
      {isSpeaking && !isMuted && !isUserMutedByMe && (
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
        {isUserMutedByMe && !isCurrentUser && (
          <p className="text-[10px] text-amber-500/80 font-medium">Son coupé</p>
        )}
      </div>
    </div>
  );

  if (!hasVolumeControl) return fullCard;

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>{fullCard}</PopoverTrigger>
      {popoverContent}
    </Popover>
  );
};

function VolumeIcon({ volume, className }: { volume: number; className?: string }) {
  if (volume === 0) return <VolumeOff className={className} />;
  return <Volume2 className={className} />;
}

export default VoiceUserCard;
