import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceUserCardProps {
  username: string;
  avatarUrl?: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isCurrentUser: boolean;
}

const VoiceUserCard = ({ 
  username, 
  avatarUrl, 
  isSpeaking, 
  isMuted, 
  isCurrentUser 
}: VoiceUserCardProps) => {
  return (
    <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-card/50 backdrop-blur-sm border border-border/50 transition-all duration-200 hover:bg-card/80">
      <div className="relative">
        <Avatar 
          className={cn(
            "h-16 w-16 transition-all duration-200 border-[3px]",
            isSpeaking && !isMuted 
              ? "border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]" 
              : "border-transparent"
          )}
        >
          <AvatarImage src={avatarUrl} alt={username} />
          <AvatarFallback className="bg-primary/20 text-primary text-lg font-semibold">
            {username.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        
        {/* Status indicator */}
        <div 
          className={cn(
            "absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-background flex items-center justify-center",
            isMuted 
              ? "bg-destructive" 
              : isSpeaking 
                ? "bg-green-500 animate-pulse" 
                : "bg-green-500/70"
          )}
        >
          {isMuted && <MicOff className="h-3 w-3 text-white" />}
        </div>
      </div>
      
      <div className="text-center max-w-[100px]">
        <p className="text-sm font-medium truncate">
          {username}
        </p>
        {isCurrentUser && (
          <p className="text-[10px] text-muted-foreground">Vous</p>
        )}
      </div>
    </div>
  );
};

export default VoiceUserCard;
