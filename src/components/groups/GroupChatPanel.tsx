import { useState, useRef, useEffect } from "react";
import { Group, useGroups } from "@/hooks/useGroups";
import { useGroupChat } from "@/hooks/useGroupChat";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Send, Phone, Users, UserPlus, MoreHorizontal, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import AddMemberDialog from "./AddMemberDialog";
import { playClickSound, playMessageSentSound } from "@/hooks/useSound";

interface GroupChatPanelProps {
  group: Group;
  onClose: () => void;
  onStartCall: () => void;
}

const GroupChatPanel = ({ group, onClose, onStartCall }: GroupChatPanelProps) => {
  const { user, profile } = useAuth();
  const { messages, loading, sendMessage } = useGroupChat(group.id);
  const { getGroupMembers } = useGroups();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [members, setMembers] = useState<{ user_id: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const loadMembers = async () => {
      const membersList = await getGroupMembers(group.id);
      setMembers(membersList);
    };
    loadMembers();
  }, [group.id, getGroupMembers]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    playMessageSentSound();
    const success = await sendMessage(input);
    if (success) setInput("");
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isOwnerOrAdmin = group.owner_id === user?.id;

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="h-[76px] px-6 flex items-center justify-between glass-solid border-b border-white/[0.04]">
        <div className="flex items-center gap-4">
          <Avatar className="h-12 w-12 ring-2 ring-white/10">
            <AvatarImage src={group.avatar_url || ""} className="object-cover" />
            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary font-bold text-lg">
              {group.name[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-bold text-lg">{group.name}</h3>
            <p className="text-sm text-muted-foreground/70 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {members.length} membre{members.length > 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOwnerOrAdmin && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => { playClickSound(); setAddMemberOpen(true); }} 
              title="Inviter"
              className="h-10 w-10 rounded-xl hover:bg-white/[0.06]"
            >
              <UserPlus className="h-5 w-5" />
            </Button>
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => { playClickSound(); onStartCall(); }}
            className="h-10 w-10 rounded-xl hover:bg-success/15 hover:text-success transition-all duration-300"
          >
            <Phone className="h-5 w-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon"
            className="h-10 w-10 rounded-xl hover:bg-white/[0.06]"
            onClick={playClickSound}
          >
            <MoreHorizontal className="h-5 w-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => { playClickSound(); onClose(); }}
            className="h-10 w-10 rounded-xl hover:bg-white/[0.06]"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <AddMemberDialog
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        groupId={group.id}
        existingMemberIds={members.map(m => m.user_id)}
      />

      {/* Messages */}
      <ScrollArea className="flex-1 p-6" ref={scrollRef}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center animate-reveal">
            <div className="relative mb-8">
              <div className="absolute -inset-6 bg-primary/10 rounded-3xl blur-3xl" />
              <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-white/[0.06] flex items-center justify-center">
                <Users className="h-12 w-12 text-muted-foreground/30" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
            </div>
            <h4 className="font-bold text-2xl mb-2">{group.name}</h4>
            <p className="text-muted-foreground/70 max-w-xs text-lg font-light">
              C'est le début de votre groupe. Commencez la conversation !
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, idx) => {
              const isOwn = msg.sender_id === user?.id;
              const showTime =
                idx === 0 ||
                new Date(msg.created_at).getTime() -
                  new Date(messages[idx - 1].created_at).getTime() >
                  300000;

              return (
                <div key={msg.id} className="message-new">
                  {showTime && (
                    <p className="text-xs text-center text-muted-foreground/50 mb-5 mt-8 font-medium">
                      {format(new Date(msg.created_at), "PPp", { locale: fr })}
                    </p>
                  )}
                  <div
                    className={cn(
                      "flex gap-3",
                      isOwn && "flex-row-reverse"
                    )}
                  >
                    <Avatar className="h-9 w-9 shrink-0 ring-2 ring-white/5">
                      <AvatarImage src={msg.sender?.avatar_url || ""} className="object-cover" />
                      <AvatarFallback className="text-xs font-semibold bg-muted">
                        {msg.sender?.username?.[0]?.toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={cn(
                        "max-w-[70%] space-y-1",
                        isOwn && "items-end"
                      )}
                    >
                      <div className={cn("flex items-center gap-2", isOwn && "flex-row-reverse")}>
                        <span className="text-xs font-semibold">
                          {isOwn ? "Toi" : msg.sender?.username}
                        </span>
                        <span className="text-xs text-muted-foreground/50">
                          {format(new Date(msg.created_at), "HH:mm", { locale: fr })}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "px-4 py-3 rounded-2xl",
                          isOwn
                            ? "message-own rounded-br-lg"
                            : "message-other rounded-bl-lg"
                        )}
                      >
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-5 glass-solid border-t border-white/[0.04]">
        <div className="flex gap-3">
          <Input
            placeholder="Écrire un message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 h-13 input-modern text-base px-5"
            disabled={sending}
          />
          <Button 
            onClick={handleSend} 
            disabled={!input.trim() || sending}
            className="h-13 w-13 rounded-xl btn-premium"
          >
            {sending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GroupChatPanel;
