import { Volume2, Mic, MicOff } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useVoicePresence, VoicePresenceUser } from "@/hooks/useVoicePresence";
import { cn } from "@/lib/utils";

interface GroupVoiceSidebarProps {
  groupId: string;
  onJoinCall: () => void;
}

const GroupVoiceSidebar = ({ groupId, onJoinCall }: GroupVoiceSidebarProps) => {
  const { participants } = useVoicePresence(groupId);

  if (participants.length === 0) return null;

  return (
    <div className="border-t border-white/[0.06] bg-card/20">
      <button
        onClick={onJoinCall}
        className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <Volume2 className="h-3.5 w-3.5 text-success animate-pulse" />
          <span className="text-xs font-semibold text-success">
            Vocal actif
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground/50 ml-auto">
          Rejoindre
        </span>
      </button>

      <div className="px-3 pb-2.5 space-y-1">
        {participants.map((p) => (
          <VoiceParticipantRow key={p.odId} participant={p} />
        ))}
      </div>
    </div>
  );
};

const VoiceParticipantRow = ({ participant }: { participant: VoicePresenceUser }) => {
  return (
    <div className="flex items-center gap-2 py-1 px-1 rounded-md">
      <div className="relative">
        <Avatar className={cn(
          "h-6 w-6 ring-1",
          participant.isSpeaking ? "ring-success/50" : "ring-transparent"
        )}>
          <AvatarImage src={participant.avatarUrl || ""} className="object-cover" />
          <AvatarFallback className="bg-secondary/50 text-[10px] font-bold">
            {participant.username[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {participant.isSpeaking && (
          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-success border border-background" />
        )}
      </div>
      <span className={cn(
        "text-xs truncate flex-1",
        participant.isSpeaking ? "text-foreground" : "text-muted-foreground/60"
      )}>
        {participant.username}
      </span>
      {participant.isMuted && (
        <MicOff className="h-3 w-3 text-destructive/50 shrink-0" />
      )}
    </div>
  );
};

export default GroupVoiceSidebar;
