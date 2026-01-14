import { useState, useRef, useEffect, useCallback } from "react";
import { Friend } from "@/hooks/useFriends";
import { usePrivateChat } from "@/hooks/usePrivateChat";
import { useAuth } from "@/contexts/AuthContext";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Phone, X, Send, Loader2, MoreHorizontal } from "lucide-react";
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
  const { user, profile } = useAuth();
  const { messages, loading, sendMessage } = usePrivateChat(friend.id);
  const channelId = `private-${[user?.id, friend.id].sort().join("-")}`;
  const { typingUsers, isTyping, startTyping, stopTyping } = useTypingIndicator(channelId);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [friend.id]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (e.target.value.trim()) {
      startTyping();
    }
  }, [startTyping]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    stopTyping();
    setSending(true);
    await sendMessage(input);
    setInput("");
    setSending(false);
  };

  const isOnline = friend.status === "online";
  const isAway = friend.status === "away";
  const isActive = isOnline || isAway;

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="h-[72px] px-6 flex items-center justify-between glass-solid border-b border-white/[0.06]">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="h-11 w-11 ring-2 ring-white/10">
              <AvatarImage src={friend.avatar_url || ""} className="object-cover" />
              <AvatarFallback className="bg-muted font-medium">
                {friend.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                "absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-card transition-colors duration-300",
                isOnline ? "bg-success" : isAway ? "bg-warning" : "bg-muted-foreground/50"
              )}
            />
          </div>
          <div>
            <h3 className="font-semibold text-lg">{friend.username}</h3>
            <div className="h-5">
              {isTyping ? (
                <p className="text-sm text-primary animate-pulse flex items-center gap-1.5">
                  <span className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                  est en train d'écrire...
                </p>
              ) : (
                <p className={cn(
                  "text-sm transition-colors duration-300",
                  isOnline ? "text-success" : isAway ? "text-warning" : "text-muted-foreground"
                )}>
                  {isOnline ? "En ligne" : isAway ? "Absent" : "Hors ligne"}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onStartCall}
            disabled={!isActive}
            className={cn(
              "h-10 w-10 rounded-xl transition-all",
              isActive && "hover:bg-success/20 hover:text-success"
            )}
          >
            <Phone className="h-5 w-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-10 w-10 rounded-xl hover:bg-white/[0.08]"
          >
            <MoreHorizontal className="h-5 w-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="h-10 w-10 rounded-xl hover:bg-white/[0.08]"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-6" ref={scrollRef}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in-up">
            <div className="relative mb-6">
              <Avatar className="h-24 w-24 ring-4 ring-white/10">
                <AvatarImage src={friend.avatar_url || ""} className="object-cover" />
                <AvatarFallback className="text-3xl bg-muted font-medium">
                  {friend.username[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -inset-4 bg-primary/10 rounded-full blur-2xl -z-10" />
            </div>
            <h4 className="font-semibold text-xl mb-2">{friend.username}</h4>
            <p className="text-muted-foreground max-w-xs">
              C'est le début de votre conversation privée. Dites bonjour !
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, idx) => {
              const isMe = msg.sender_id === user?.id;
              const showAvatar =
                idx === 0 || messages[idx - 1].sender_id !== msg.sender_id;
              const showTime =
                idx === 0 ||
                new Date(msg.created_at).getTime() -
                  new Date(messages[idx - 1].created_at).getTime() >
                  300000;

              return (
                <div key={msg.id} className="animate-fade-in">
                  {showTime && (
                    <p className="text-xs text-center text-muted-foreground mb-4 mt-6">
                      {format(new Date(msg.created_at), "PPp", { locale: fr })}
                    </p>
                  )}
                  <div
                    className={cn(
                      "flex items-end gap-3",
                      isMe && "flex-row-reverse"
                    )}
                  >
                    {showAvatar ? (
                      <Avatar className="h-9 w-9 ring-2 ring-white/5">
                        <AvatarImage
                          src={isMe ? profile?.avatar_url || "" : friend.avatar_url || ""}
                          className="object-cover"
                        />
                        <AvatarFallback className="text-xs bg-muted font-medium">
                          {isMe
                            ? profile?.username?.[0]?.toUpperCase()
                            : friend.username[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="w-9" />
                    )}
                    <div
                      className={cn(
                        "max-w-[70%] px-4 py-3 rounded-2xl transition-all",
                        isMe
                          ? "bg-primary text-primary-foreground rounded-br-lg"
                          : "bg-secondary/80 rounded-bl-lg"
                      )}
                    >
                      <p className="text-sm leading-relaxed break-words">{msg.content}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Typing indicator */}
      {isTyping && (
        <div className="px-6 py-2 border-t border-white/[0.04] glass-subtle">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex gap-0.5">
              <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <span className="animate-fade-in">{friend.username} est en train d'écrire...</span>
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="p-5 glass-solid border-t border-white/[0.06]">
        <div className="flex gap-3">
          <Input
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onBlur={stopTyping}
            placeholder={`Message @${friend.username}`}
            className="flex-1 h-12 input-modern text-base"
            disabled={sending}
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!input.trim() || sending}
            className="h-12 w-12 rounded-xl bg-primary hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
          >
            {sending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default PrivateChatPanel;
