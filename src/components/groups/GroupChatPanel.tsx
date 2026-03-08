import { useState, useRef, useEffect } from "react";
import { Group, useGroups } from "@/hooks/useGroups";
import { useGroupChat } from "@/hooks/useGroupChat";
import { useAuth } from "@/contexts/AuthContext";
import { useSound } from "@/hooks/useSound";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { smartTimestamp, dateSeparator, shouldShowDateSeparator } from "@/lib/timeUtils";
import GroupMessageContextMenu from "@/components/chat/GroupMessageContextMenu";
import EmojiPicker from "@/components/chat/EmojiPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { X, Send, Phone, Users, UserPlus, Loader2, Sparkles, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import AddMemberDialog from "./AddMemberDialog";
import GroupMembersPanel from "./GroupMembersPanel";

interface GroupChatPanelProps {
  group: Group;
  onClose: () => void;
  onStartCall: () => void;
}

const GroupChatPanel = ({ group, onClose, onStartCall }: GroupChatPanelProps) => {
  const { user } = useAuth();
  const { messages, loading, sendMessage } = useGroupChat(group.id);
  const { getGroupMembers } = useGroups();
  const { playMessageSent } = useSound();
  const channelId = `group-${group.id}`;
  const { isTyping, typingUsers, startTyping, stopTyping } = useTypingIndicator(channelId);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [members, setMembers] = useState<{ user_id: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [group.id]);

  useEffect(() => {
    const loadMembers = async () => {
      const membersList = await getGroupMembers(group.id);
      setMembers(membersList);
    };
    loadMembers();
  }, [group.id, getGroupMembers]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (e.target.value.trim()) startTyping();
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    stopTyping();
    setSending(true);
    const success = await sendMessage(input);
    if (success) {
      playMessageSent();
      setInput("");
    }
    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setInput((prev) => prev + emoji);
    inputRef.current?.focus();
  };

  const isOwnerOrAdmin = group.owner_id === user?.id;

  return (
    <div className="flex-1 flex h-full">
      <div className="flex-1 flex flex-col h-full">
        {/* Header */}
        <div className="h-[72px] px-6 flex items-center justify-between glass-solid border-b border-white/[0.04]">
          <div className="flex items-center gap-4">
            <Avatar className="h-11 w-11 ring-2 ring-white/10">
              <AvatarImage src={group.avatar_url || ""} className="object-cover" />
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary font-bold text-lg">
                {group.name[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-bold text-base">{group.name}</h3>
              <div className="h-4">
                {isTyping ? (
                  <p className="text-xs text-primary flex items-center gap-1.5 animate-fade-in">
                    <span className="flex gap-0.5">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </span>
                    {typingUsers.join(", ")} écri{typingUsers.length > 1 ? "vent" : "t"}...
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground/70 flex items-center gap-1.5">
                    <Users className="h-3 w-3" />
                    {members.length} membre{members.length > 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMembersOpen(prev => !prev)}
                  className={cn(
                    "h-9 w-9 rounded-xl transition-all duration-300",
                    membersOpen ? "bg-primary/15 text-primary" : "hover:bg-white/[0.06]"
                  )}
                >
                  <Users className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Membres</TooltipContent>
            </Tooltip>
            {isOwnerOrAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setAddMemberOpen(true)}
                    className="h-9 w-9 rounded-xl hover:bg-white/[0.06]"
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Inviter</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onStartCall}
                  className="h-9 w-9 rounded-xl hover:bg-success/15 hover:text-success transition-all duration-300"
                >
                  <Phone className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Appel vocal</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onClose} className="h-9 w-9 rounded-xl hover:bg-white/[0.06]">
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fermer</TooltipContent>
            </Tooltip>
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
            <div className="space-y-1">
              {messages.map((msg, idx) => {
                const isOwn = msg.sender_id === user?.id;
                const prevMsg = messages[idx - 1];
                const nextMsg = messages[idx + 1];
                const showDateSep = shouldShowDateSeparator(msg.created_at, prevMsg?.created_at);
                const isGroupStart = !prevMsg || prevMsg.sender_id !== msg.sender_id || showDateSep;
                const isGroupEnd = !nextMsg || nextMsg.sender_id !== msg.sender_id;
                const isEdited = !!msg.edited_at;

                return (
                  <div key={msg.id}>
                    {showDateSep && (
                      <div className="flex items-center gap-4 my-6">
                        <div className="flex-1 h-px bg-white/[0.04]" />
                        <span className="text-[11px] text-muted-foreground/40 font-semibold uppercase tracking-wider">
                          {dateSeparator(msg.created_at)}
                        </span>
                        <div className="flex-1 h-px bg-white/[0.04]" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "flex items-end gap-2.5 group/msg",
                        isOwn && "flex-row-reverse",
                        isGroupStart ? "mt-3" : "mt-0.5"
                      )}
                    >
                      {isGroupStart && !isOwn ? (
                        <Avatar className="h-8 w-8 ring-1 ring-white/5 shrink-0">
                          <AvatarImage src={msg.sender?.avatar_url || ""} className="object-cover" />
                          <AvatarFallback className="text-xs bg-muted font-semibold">
                            {msg.sender?.username?.[0]?.toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                      ) : !isOwn ? (
                        <div className="w-8 shrink-0" />
                      ) : null}

                      <GroupMessageContextMenu message={msg}>
                        <div className="max-w-[65%]">
                          {isGroupStart && (
                            <div className={cn("flex items-center gap-2 mb-0.5", isOwn && "flex-row-reverse")}>
                              <span className="text-xs font-semibold text-muted-foreground">
                                {isOwn ? "Toi" : msg.sender?.username}
                              </span>
                            </div>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "px-3.5 py-2 transition-all cursor-default hover:brightness-110",
                                  isOwn
                                    ? cn(
                                        "message-own",
                                        isGroupStart && isGroupEnd && "rounded-2xl",
                                        isGroupStart && !isGroupEnd && "rounded-2xl rounded-br-lg",
                                        !isGroupStart && isGroupEnd && "rounded-2xl rounded-tr-lg",
                                        !isGroupStart && !isGroupEnd && "rounded-xl rounded-r-lg",
                                      )
                                    : cn(
                                        "message-other",
                                        isGroupStart && isGroupEnd && "rounded-2xl",
                                        isGroupStart && !isGroupEnd && "rounded-2xl rounded-bl-lg",
                                        !isGroupStart && isGroupEnd && "rounded-2xl rounded-tl-lg",
                                        !isGroupStart && !isGroupEnd && "rounded-xl rounded-l-lg",
                                      )
                                )}
                              >
                                <p className="text-[14px] leading-relaxed break-words">{msg.content}</p>
                                {isGroupEnd && (
                                  <div className={cn(
                                    "flex items-center gap-1 mt-1",
                                    isOwn ? "justify-end" : "justify-start"
                                  )}>
                                    {isEdited && <Pencil className="h-2.5 w-2.5 text-foreground/20" />}
                                    <span className="text-[10px] text-foreground/30">
                                      {smartTimestamp(msg.created_at)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side={isOwn ? "left" : "right"} className="text-xs">
                              {format(new Date(msg.created_at), "EEEE d MMMM yyyy à HH:mm", { locale: fr })}
                              {isEdited && " (modifié)"}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </GroupMessageContextMenu>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

        {/* Typing indicator */}
        {isTyping && (
          <div className="px-6 py-2 border-t border-white/[0.02]">
            <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
              <div className="flex gap-0.5">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
              <span className="animate-fade-in">
                {typingUsers.join(", ")} écri{typingUsers.length > 1 ? "vent" : "t"}...
              </span>
            </div>
          </div>
        )}

        {/* Input */}
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="p-4 glass-solid border-t border-white/[0.04]">
          <div className="flex gap-2 items-center">
            <EmojiPicker onSelect={handleEmojiSelect} />
            <Input
              ref={inputRef}
              placeholder={`Message #${group.name}`}
              value={input}
              onChange={handleInputChange}
              onBlur={stopTyping}
              onKeyDown={handleKeyDown}
              className="flex-1 h-12 input-modern text-sm px-4"
              disabled={sending}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || sending}
              className="h-12 w-12 rounded-xl btn-premium shrink-0"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Members Panel */}
      {membersOpen && (
        <GroupMembersPanel
          groupId={group.id}
          isOwner={isOwnerOrAdmin}
          onAddMember={() => setAddMemberOpen(true)}
          onClose={() => setMembersOpen(false)}
        />
      )}
    </div>
  );
};

export default GroupChatPanel;
