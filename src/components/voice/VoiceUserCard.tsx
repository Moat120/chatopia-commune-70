import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MicOff, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceUserCardProps {
  username: string;
  avatarUrl?: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isCurrentUser?: boolean;
  audioLevel?: number;
  compact?: boolean;
}

const VoiceUserCard = ({ 
  username, 
  avatarUrl, 
  isSpeaking, 
  isMuted, 
  isCurrentUser,
  audioLevel = 0,
  compact = false
}: VoiceUserCardProps) => {
  // Scale avatar ring based on audio level
  const ringScale = isSpeaking ? 1 + audioLevel * 0.2 : 1;
  const glowIntensity = isSpeaking ? Math.max(0.3, audioLevel) : 0;

  if (compact) {
    return (
      <div className={cn(
        "relative flex items-center gap-3 p-3 rounded-xl",
        "bg-gradient-to-r from-secondary/40 to-secondary/20",
        "backdrop-blur-xl border border-white/[0.05]",
        "transition-all duration-300",
        isSpeaking && !isMuted && "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20"
      )}>
        <div className="relative">
          <Avatar className={cn(
            "h-10 w-10 ring-2 ring-offset-1 ring-offset-background transition-all duration-200",
            isSpeaking && !isMuted ? "ring-emerald-500/70" : isMuted ? "ring-rose-500/30" : "ring-white/10"
          )}>
            <AvatarImage src={avatarUrl} alt={username} className="object-cover" />
            <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-primary text-sm font-semibold">
              {username.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {isMuted && (
            <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-rose-500 flex items-center justify-center ring-2 ring-background">
              <MicOff className="h-2.5 w-2.5 text-white" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-sm font-medium truncate transition-colors",
            isSpeaking && !isMuted && "text-emerald-400"
          )}>
            {username}
            {isCurrentUser && <span className="text-muted-foreground/50 ml-1.5 text-xs">(Vous)</span>}
          </p>
        </div>
        {isSpeaking && !isMuted && (
          <Volume2 className="h-4 w-4 text-emerald-400 animate-pulse flex-shrink-0" />
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      "group relative flex flex-col items-center gap-4 p-5 rounded-3xl",
      "bg-gradient-to-b from-secondary/50 to-secondary/20",
      "backdrop-blur-xl border border-white/[0.05]",
      "transition-all duration-500 ease-out",
      "hover:border-white/[0.1] hover:from-secondary/60 hover:to-secondary/30",
      "hover:shadow-2xl hover:shadow-black/20 hover:-translate-y-1",
      isSpeaking && !isMuted && "from-emerald-500/10 to-transparent border-emerald-500/20 shadow-lg shadow-emerald-500/10"
    )}>
      {/* Speaking glow effect */}
      {isSpeaking && !isMuted && (
        <div 
          className="absolute inset-0 rounded-3xl opacity-50 pointer-events-none"
          style={{
            background: `radial-gradient(circle at center, hsl(var(--success) / ${glowIntensity}), transparent 70%)`,
          }}
        />
      )}

      {/* Avatar container with animated rings */}
      <div className="relative">
        {/* Outer animated rings */}
        {isSpeaking && !isMuted && (
          <>
            <div 
              className="absolute inset-0 rounded-full animate-[speaking-ring_1.5s_ease-out_infinite]"
              style={{
                background: 'radial-gradient(circle, hsl(var(--success) / 0.4), transparent 70%)',
                transform: `scale(${ringScale * 1.4})`,
              }}
            />
            <div 
              className="absolute inset-0 rounded-full animate-[speaking-ring_1.5s_ease-out_infinite_0.5s]"
              style={{
                background: 'radial-gradient(circle, hsl(var(--success) / 0.2), transparent 70%)',
                transform: `scale(${ringScale * 1.6})`,
              }}
            />
          </>
        )}
        
        {/* Avatar with dynamic glow */}
        <Avatar 
          className={cn(
            "h-20 w-20 transition-all duration-200",
            "ring-[3px] ring-offset-2 ring-offset-transparent",
            isSpeaking && !isMuted 
              ? "ring-emerald-500 shadow-lg shadow-emerald-500/30" 
              : isMuted 
                ? "ring-rose-500/40" 
                : "ring-white/10",
          )}
          style={{
            transform: `scale(${ringScale})`,
            transition: 'transform 0.15s ease-out'
          }}
        >
          <AvatarImage src={avatarUrl} alt={username} className="object-cover" />
          <AvatarFallback className="bg-gradient-to-br from-primary/40 to-primary/10 text-primary text-xl font-bold">
            {username.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        
        {/* Status indicator */}
        <div 
          className={cn(
            "absolute -bottom-1 -right-1 h-6 w-6 rounded-full",
            "flex items-center justify-center",
            "ring-[3px] ring-background transition-all duration-300",
            "shadow-lg",
            isMuted 
              ? "bg-gradient-to-br from-rose-500 to-rose-600" 
              : isSpeaking 
                ? "bg-gradient-to-br from-emerald-400 to-emerald-600 animate-pulse" 
                : "bg-gradient-to-br from-emerald-500/70 to-emerald-600/70"
          )}
        >
          {isMuted && <MicOff className="h-3 w-3 text-white" />}
          {!isMuted && isSpeaking && <Volume2 className="h-3 w-3 text-white" />}
        </div>
      </div>

      {/* Audio level visualizer */}
      {isSpeaking && !isMuted && (
        <div className="flex items-center justify-center gap-0.5 h-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-0.5 rounded-full bg-emerald-400 transition-all duration-100"
              style={{
                height: `${Math.max(4, Math.min(12, audioLevel * 15 + Math.random() * 4))}px`,
                animationDelay: `${i * 50}ms`,
              }}
            />
          ))}
        </div>
      )}
      
      {/* Username */}
      <div className="text-center space-y-0.5 max-w-[120px]">
        <p className={cn(
          "text-sm font-semibold truncate transition-colors duration-300",
          isSpeaking && !isMuted ? "text-emerald-400" : "text-foreground"
        )}>
          {username}
        </p>
        {isCurrentUser && (
          <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-medium">
            Vous
          </p>
        )}
      </div>
    </div>
  );
};

export default VoiceUserCard;
