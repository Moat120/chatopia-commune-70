import { useState, useRef, useEffect } from "react";
import { Group, useGroups } from "@/hooks/useGroups";
import { useGroupChat } from "@/hooks/useGroupChat";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Send, Phone, Users, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import AddMemberDialog from "./AddMemberDialog";

interface GroupChatPanelProps {
  group: Group;
  onClose: () => void;
  onStartCall: () => void;
}

const GroupChatPanel = ({ group, onClose, onStartCall }: GroupChatPanelProps) => {
  const { user } = useAuth();
  const { messages, loading, sendMessage } = useGroupChat(group.id);
  const { getGroupMembers } = useGroups();
  const [input, setInput] = useState("");
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
    if (!input.trim()) return;
    const success = await sendMessage(input);
    if (success) setInput("");
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
      <div className="p-4 border-b border-border/50 flex items-center justify-between glass">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={group.avatar_url || ""} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {group.name[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold">{group.name}</h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" />
              {members.length} membre{members.length > 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOwnerOrAdmin && (
            <Button variant="ghost" size="icon" onClick={() => setAddMemberOpen(true)} title="Inviter">
              <UserPlus className="h-5 w-5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onStartCall}>
            <Phone className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
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
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {loading ? (
          <div className="text-center text-muted-foreground py-8">
            Chargement...
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <p>Aucun message</p>
            <p className="text-sm">Commencez la conversation !</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => {
              const isOwn = msg.sender_id === user?.id;
              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3",
                    isOwn && "flex-row-reverse"
                  )}
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={msg.sender?.avatar_url || ""} />
                    <AvatarFallback className="text-xs">
                      {msg.sender?.username?.[0]?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={cn(
                      "max-w-[70%] space-y-1",
                      isOwn && "items-end"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">
                        {isOwn ? "Toi" : msg.sender?.username}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(msg.created_at), "HH:mm", {
                          locale: fr,
                        })}
                      </span>
                    </div>
                    <div
                      className={cn(
                        "px-4 py-2 rounded-2xl",
                        isOwn
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-secondary rounded-bl-md"
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-border/50 glass">
        <div className="flex gap-2">
          <Input
            placeholder="Écrire un message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={!input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GroupChatPanel;
