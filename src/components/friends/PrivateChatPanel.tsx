import { useState, useRef, useEffect, useCallback } from "react";
import { Friend } from "@/hooks/useFriends";
import { usePrivateChat } from "@/hooks/usePrivateChat";
import { useAuth } from "@/contexts/AuthContext";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useSound } from "@/hooks/useSound";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { smartTimestamp, dateSeparator, shouldShowDateSeparator } from "@/lib/timeUtils";
import MessageContextMenu from "@/components/chat/MessageContextMenu";
import EmojiPicker from "@/components/chat/EmojiPicker";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Phone, X, Send, Loader2, Sparkles, CheckCheck, Check, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface PrivateChatPanelProps {
  friend: Friend;
  onClose: () => void;
  onStartCall: () => void;
}

const PrivateChatPanel = ({
  friend,
  onClose,
  onStartCall,
}: PrivateChatPanelProps) => {
  const { user } = useAuth();
  const { messages, loading, sendMessage } = usePrivateChat(friend.id);
  const { playMessageSent } = useSound();
  const channelId = `private-${[user?.id, friend.id].sort().join("-")}`;
  const { isTyping, startTyping, stopTyping } = useTypingIndicator(channelId);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [friend.id]);

  useKeyboardShortcuts({
    onEscape: onClose,
  });

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (e.target.value.trim()) startTyping();
  }, [startTyping]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    stopTyping();
    setSending(true);
    await sendMessage(input);
    playMessageSent();
    setInput("");
    setSending(false);
    inputRef.current?.focus();
  };

  const handleEmojiSelect = (emoji: string) => {
    setInput((prev) => prev + emoji);
    inputRef.current?.focus();
  };

  const isOnline = friend.status === "online";
  const isAway = friend.status === "away";
  const isActive = isOnline || isAway;

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="h-[72px] px-6 flex items-center justify-between glass-solid border-b border-white/[0.04]">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="h-11 w-11 ring-2 ring-white/10">
              <AvatarImage src={friend.avatar_url || ""} className="object-cover" />
              <AvatarFallback className="bg-gradient-to-br from-muted to-muted/50 font-semibold">
                {friend.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                "absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-card transition-all duration-300",
                isOnline && "bg-success status-online",
                isAway && "bg-warning",
                !isActive && "bg-muted-foreground/40"
              )}
            />
          </div>
          <div>
            <h3 className="font-bold text-base">{friend.username}</h3>
            <div className="h-4">
              {isTyping ? (
                <p className="text-xs text-primary flex items-center gap-1.5 animate-fade-in">
                  <span className="flex gap-0.5">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </span>
                  écrit...
                </p>
              ) : (
                <p className={cn(
                  "text-xs font-medium transition-colors duration-300",
                  isOnline ? "text-success" : isAway ? "text-warning" : "text-muted-foreground/50"
                )}>
                  {isOnline ? "En ligne" : isAway ? "Absent" : "Hors ligne"}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onStartCall}
                disabled={!isActive}
                className={cn(
                  "h-9 w-9 rounded-xl transition-all duration-300",
                  isActive && "hover:bg-success/15 hover:text-success"
                )}
                silent
              >
                <Phone className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Appeler</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-9 w-9 rounded-xl hover:bg-white/[0.06]" silent>
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fermer (Échap)</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-6" ref={scrollRef}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center animate-reveal">
            <div className="relative mb-8">
              <div className="absolute -inset-6 bg-primary/10 rounded-full blur-3xl" />
              <Avatar className="h-24 w-24 ring-4 ring-white/10 relative">
                <AvatarImage src={friend.avatar_url || ""} className="object-cover" />
                <AvatarFallback className="text-3xl bg-gradient-to-br from-muted to-muted/50 font-bold">
                  {friend.username[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
              </div>
            </div>
            <h4 className="font-bold text-xl mb-2">{friend.username}</h4>
            <p className="text-muted-foreground/60 max-w-xs text-sm">
              C'est le début de votre conversation. Dites bonjour ! 👋
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((msg, idx) => {
              const isMe = msg.sender_id === user?.id;
              const prevMsg = messages[idx - 1];
              const nextMsg = messages[idx + 1];
              const showDateSep = shouldShowDateSeparator(msg.created_at, prevMsg?.created_at);
              const isGroupStart = !prevMsg || prevMsg.sender_id !== msg.sender_id || showDateSep;
              const isGroupEnd = !nextMsg || nextMsg.sender_id !== msg.sender_id;
              const isRead = isMe && msg.read_at;
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
                      isMe && "flex-row-reverse",
                      isGroupStart ? "mt-3" : "mt-0.5"
                    )}
                  >
                    {isGroupStart && !isMe ? (
                      <Avatar className="h-8 w-8 ring-1 ring-white/5 shrink-0">
                        <AvatarImage src={friend.avatar_url || ""} className="object-cover" />
                        <AvatarFallback className="text-xs bg-muted font-semibold">
                          {friend.username[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ) : !isMe ? (
                      <div className="w-8 shrink-0" />
                    ) : null}

                    <MessageContextMenu message={msg}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "max-w-[65%] px-3.5 py-2 transition-all cursor-default",
                              "hover:brightness-110",
                              isMe
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
                                isMe ? "justify-end" : "justify-start"
                              )}>
                                {isEdited && (
                                  <Pencil className="h-2.5 w-2.5 text-foreground/20" />
                                )}
                                <span className="text-[10px] text-foreground/30">
                                  {smartTimestamp(msg.created_at)}
                                </span>
                                {isMe && (
                                  isRead ? (
                                    <CheckCheck className="h-3 w-3 text-accent-foreground/50" />
                                  ) : (
                                    <Check className="h-3 w-3 text-foreground/20" />
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side={isMe ? "left" : "right"} className="text-xs">
                          {format(new Date(msg.created_at), "EEEE d MMMM yyyy à HH:mm", { locale: fr })}
                          {isEdited && " (modifié)"}
                        </TooltipContent>
                      </Tooltip>
                    </MessageContextMenu>
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
            <span className="animate-fade-in">{friend.username} écrit...</span>
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="p-4 glass-solid border-t border-white/[0.04]">
        <div className="flex gap-2 items-center">
          <EmojiPicker onSelect={handleEmojiSelect} />
          <Input
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onBlur={stopTyping}
            placeholder={`Message @${friend.username}`}
            className="flex-1 h-12 input-modern text-sm px-4"
            disabled={sending}
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!input.trim() || sending}
            className="h-12 w-12 rounded-xl btn-premium shrink-0"
            silent
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
  );
};

export default PrivateChatPanel;
