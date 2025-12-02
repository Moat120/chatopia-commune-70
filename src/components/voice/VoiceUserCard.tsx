import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceUserCardProps {
  username: string;
  avatarUrl?: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isCurrentUser: boolean;
  audioLevel?: number;
}

const VoiceUserCard = ({ 
  username, 
  avatarUrl, 
  isSpeaking, 
  isMuted, 
  isCurrentUser,
  audioLevel = 0
}: VoiceUserCardProps) => {
  const ringScale = isSpeaking ? 1 + audioLevel * 0.15 : 1;

  return (
    <div 
      className={cn(
        "group relative flex flex-col items-center gap-3 p-4 rounded-2xl",
        "bg-secondary/30 backdrop-blur-sm border border-border/30",
        "transition-all duration-300 ease-out",
        "hover:bg-secondary/50 hover:border-border/50",
        isSpeaking && "bg-success/5 border-success/20"
      )}
    >
      {/* Speaking ring animation */}
      <div className="relative">
        {isSpeaking && !isMuted && (
          <>
            <div 
              className="absolute inset-0 rounded-full bg-success/20 animate-speaking-ring"
              style={{ transform: `scale(${ringScale})` }}
            />
            <div 
              className="absolute inset-0 rounded-full bg-success/10 animate-speaking-ring"
              style={{ animationDelay: '0.5s', transform: `scale(${ringScale})` }}
            />
          </>
        )}
        
        <Avatar 
          className={cn(
            "h-16 w-16 transition-all duration-300 ring-[3px] ring-offset-2 ring-offset-background",
            isSpeaking && !isMuted 
              ? "ring-success glow-success" 
              : isMuted 
                ? "ring-destructive/50" 
                : "ring-border/50",
          )}
          style={{
            transform: `scale(${ringScale})`,
            transition: 'transform 0.1s ease-out'
          }}
        >
          <AvatarImage src={avatarUrl} alt={username} className="object-cover" />
          <AvatarFallback className="bg-primary/20 text-primary text-lg font-medium">
            {username.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        
        {/* Status badge */}
        <div 
          className={cn(
            "absolute -bottom-1 -right-1 h-5 w-5 rounded-full",
            "flex items-center justify-center",
            "border-2 border-background transition-all duration-200",
            isMuted 
              ? "bg-destructive" 
              : isSpeaking 
                ? "bg-success animate-pulse-glow" 
                : "bg-success/70"
          )}
        >
          {isMuted && <MicOff className="h-3 w-3 text-destructive-foreground" />}
        </div>
      </div>
      
      {/* Username */}
      <div className="text-center space-y-0.5 max-w-[100px]">
        <p className={cn(
          "text-sm font-medium truncate transition-colors",
          isSpeaking && !isMuted && "text-success"
        )}>
          {username}
        </p>
        {isCurrentUser && (
          <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">
            Vous
          </p>
        )}
      </div>
    </div>
  );
};

export default VoiceUserCard;
