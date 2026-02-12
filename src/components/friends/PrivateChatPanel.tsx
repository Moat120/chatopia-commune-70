import { useState, useRef, useEffect, useCallback } from "react";
import { Friend } from "@/hooks/useFriends";
import { usePrivateChat } from "@/hooks/usePrivateChat";
import { useAuth } from "@/contexts/AuthContext";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Phone, X, Send, Loader2, MoreHorizontal, Sparkles } from "lucide-react";
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
      <div className="h-[76px] px-6 flex items-center justify-between glass-solid border-b border-white/[0.04]">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="h-12 w-12 ring-2 ring-white/10">
              <AvatarImage src={friend.avatar_url || ""} className="object-cover" />
              <AvatarFallback className="bg-gradient-to-br from-muted to-muted/50 font-semibold">
                {friend.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                "absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-card transition-all duration-300",
                isOnline && "bg-success status-online",
                isAway && "bg-warning",
                !isActive && "bg-muted-foreground/40"
              )}
            />
          </div>
          <div>
            <h3 className="font-bold text-lg">{friend.username}</h3>
            <div className="h-5">
              {isTyping ? (
                <p className="text-sm text-primary flex items-center gap-2">
                  <span className="flex gap-1">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </span>
                  <span className="animate-fade-in">est en train d'écrire...</span>
                </p>
              ) : (
                <p className={cn(
                  "text-sm font-medium transition-colors duration-300",
                  isOnline ? "text-success" : isAway ? "text-warning" : "text-muted-foreground/60"
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
              "h-10 w-10 rounded-xl transition-all duration-300",
              isActive && "hover:bg-success/15 hover:text-success"
            )}
          >
            <Phone className="h-5 w-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-10 w-10 rounded-xl hover:bg-white/[0.06]"
            onClick={() => {}}
          >
            <MoreHorizontal className="h-5 w-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="h-10 w-10 rounded-xl hover:bg-white/[0.06]"
          >
            <X className="h-5 w-5" />
          </Button>
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
              <Avatar className="h-28 w-28 ring-4 ring-white/10 relative">
                <AvatarImage src={friend.avatar_url || ""} className="object-cover" />
                <AvatarFallback className="text-4xl bg-gradient-to-br from-muted to-muted/50 font-bold">
                  {friend.username[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
            </div>
            <h4 className="font-bold text-2xl mb-2">{friend.username}</h4>
            <p className="text-muted-foreground/70 max-w-xs text-lg font-light">
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
                <div key={msg.id} className="message-new">
                  {showTime && (
                    <p className="text-xs text-center text-muted-foreground/50 mb-5 mt-8 font-medium">
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
                        <AvatarFallback className="text-xs bg-muted font-semibold">
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
                          ? "message-own rounded-br-lg"
                          : "message-other rounded-bl-lg"
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
        <div className="px-6 py-3 border-t border-white/[0.02] glass-subtle">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="flex gap-1">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
            <span className="animate-fade-in font-medium">{friend.username} est en train d'écrire...</span>
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="p-5 glass-solid border-t border-white/[0.04]">
        <div className="flex gap-3">
          <Input
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onBlur={stopTyping}
            placeholder={`Message @${friend.username}`}
            className="flex-1 h-13 input-modern text-base px-5"
            disabled={sending}
          />
          <Button 
            type="submit" 
            size="icon" 
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
      </form>
    </div>
  );
};

export default PrivateChatPanel;
