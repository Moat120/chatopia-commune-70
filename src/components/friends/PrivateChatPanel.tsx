import { useState, useRef, useEffect, useCallback } from "react";
import { Friend } from "@/hooks/useFriends";
import { usePrivateChat } from "@/hooks/usePrivateChat";
import { useAuth } from "@/contexts/AuthContext";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useSound } from "@/hooks/useSound";
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
import { Phone, ArrowLeft, Send, Loader2, CheckCheck, Check, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface PrivateChatPanelProps {
  friend: Friend;
  onClose: () => void;
  onStartCall: () => void;
}

const PrivateChatPanel = ({ friend, onClose, onStartCall }: PrivateChatPanelProps) => {
  const { user } = useAuth();
  const { messages, loading, sendMessage } = usePrivateChat(friend.id);
  const { playMessageSent } = useSound();
  const channelId = `private-${[user?.id, friend.id].sort().join("-")}`;
  const { isTyping, startTyping, stopTyping } = useTypingIndicator(channelId);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [friend.id]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInput(e.target.value);
      if (e.target.value.trim()) startTyping();
    },
    [startTyping]
  );

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
    <div className="flex-1 flex flex-col h-full bg-background">
      {/* ─── Header ─── */}
      <header className="h-16 px-4 flex items-center gap-3 border-b border-white/[0.06] bg-card/30 backdrop-blur-xl shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8 rounded-lg hover:bg-white/[0.06] md:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="relative shrink-0">
          <Avatar className="h-9 w-9">
            <AvatarImage src={friend.avatar_url || ""} className="object-cover" />
            <AvatarFallback className="bg-muted/50 font-semibold text-sm">
              {friend.username[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card",
              isOnline && "bg-success",
              isAway && "bg-warning",
              !isActive && "bg-muted-foreground/30"
            )}
          />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold truncate">{friend.username}</h3>
          <div className="h-4">
            {isTyping ? (
              <p className="text-[11px] text-primary flex items-center gap-1">
                <span className="flex gap-0.5">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </span>
                écrit…
              </p>
            ) : (
              <p className={cn(
                "text-[11px]",
                isOnline ? "text-success/70" : isAway ? "text-warning/70" : "text-muted-foreground/40"
              )}>
                {isOnline ? "En ligne" : isAway ? "Absent" : "Hors ligne"}
              </p>
            )}
          </div>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onStartCall}
              disabled={!isActive}
              className={cn(
                "h-8 w-8 rounded-lg",
                isActive ? "hover:bg-success/10 hover:text-success" : "opacity-30"
              )}
            >
              <Phone className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Appeler</TooltipContent>
        </Tooltip>
      </header>

      {/* ─── Messages ─── */}
      <ScrollArea className="flex-1 px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <Avatar className="h-16 w-16 mb-4">
              <AvatarImage src={friend.avatar_url || ""} className="object-cover" />
              <AvatarFallback className="text-xl bg-muted/30 font-bold">
                {friend.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <h4 className="font-semibold text-base mb-1">{friend.username}</h4>
            <p className="text-muted-foreground/40 text-sm">
              C'est le début de votre conversation 👋
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
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
                    <div className="flex items-center gap-4 my-5">
                      <div className="flex-1 h-px bg-white/[0.04]" />
                      <span className="text-[10px] text-muted-foreground/30 font-semibold uppercase tracking-wider">
                        {dateSeparator(msg.created_at)}
                      </span>
                      <div className="flex-1 h-px bg-white/[0.04]" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "flex items-end gap-2 group/msg",
                      isMe && "flex-row-reverse",
                      isGroupStart ? "mt-2.5" : "mt-0.5"
                    )}
                  >
                    {isGroupStart && !isMe ? (
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarImage src={friend.avatar_url || ""} className="object-cover" />
                        <AvatarFallback className="text-[10px] bg-muted/50 font-semibold">
                          {friend.username[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ) : !isMe ? (
                      <div className="w-7 shrink-0" />
                    ) : null}

                    <MessageContextMenu message={msg}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "max-w-[70%] px-3 py-2 transition-all cursor-default",
                              isMe
                                ? cn(
                                    "message-own",
                                    isGroupStart && isGroupEnd && "rounded-2xl",
                                    isGroupStart && !isGroupEnd && "rounded-2xl rounded-br-md",
                                    !isGroupStart && isGroupEnd && "rounded-2xl rounded-tr-md",
                                    !isGroupStart && !isGroupEnd && "rounded-lg rounded-r-md"
                                  )
                                : cn(
                                    "message-other",
                                    isGroupStart && isGroupEnd && "rounded-2xl",
                                    isGroupStart && !isGroupEnd && "rounded-2xl rounded-bl-md",
                                    !isGroupStart && isGroupEnd && "rounded-2xl rounded-tl-md",
                                    !isGroupStart && !isGroupEnd && "rounded-lg rounded-l-md"
                                  )
                            )}
                          >
                            <p className="text-[13.5px] leading-relaxed break-words">{msg.content}</p>
                            {isGroupEnd && (
                              <div className={cn(
                                "flex items-center gap-1 mt-0.5",
                                isMe ? "justify-end" : "justify-start"
                              )}>
                                {isEdited && <Pencil className="h-2.5 w-2.5 text-foreground/15" />}
                                <span className="text-[10px] text-foreground/25">
                                  {smartTimestamp(msg.created_at)}
                                </span>
                                {isMe && (
                                  isRead
                                    ? <CheckCheck className="h-3 w-3 text-accent-foreground/40" />
                                    : <Check className="h-3 w-3 text-foreground/15" />
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

      {/* ─── Typing indicator ─── */}
      {isTyping && (
        <div className="px-4 py-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground/40">
            <span className="flex gap-0.5">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </span>
            <span>{friend.username} écrit…</span>
          </div>
        </div>
      )}

      {/* ─── Input ─── */}
      <form onSubmit={handleSend} className="px-4 py-3 border-t border-white/[0.06] bg-card/20">
        <div className="flex gap-2 items-center">
          <EmojiPicker onSelect={handleEmojiSelect} />
          <Input
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onBlur={stopTyping}
            placeholder={`Message @${friend.username}`}
            className="flex-1 h-10 text-sm input-modern rounded-lg px-3"
            disabled={sending}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || sending}
            className="h-10 w-10 rounded-lg btn-premium shrink-0"
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
