import { useState, useRef, useEffect } from "react";
import { Friend } from "@/hooks/useFriends";
import { usePrivateChat } from "@/hooks/usePrivateChat";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Phone, X, Send, Loader2 } from "lucide-react";
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
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [friend.id]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    setSending(true);
    await sendMessage(input);
    setInput("");
    setSending(false);
  };

  const isOnline = friend.status === "online";

  return (
    <div className="flex-1 flex flex-col h-full bg-background/50">
      {/* Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-border/50 glass">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="h-10 w-10">
              <AvatarImage src={friend.avatar_url || ""} />
              <AvatarFallback className="bg-muted">
                {friend.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card",
                isOnline ? "bg-success" : "bg-muted-foreground"
              )}
            />
          </div>
          <div>
            <h3 className="font-semibold">{friend.username}</h3>
            <p className="text-xs text-muted-foreground">
              {isOnline ? "En ligne" : "Hors ligne"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onStartCall}
            disabled={!isOnline}
            className="hover:bg-success/10 hover:text-success"
          >
            <Phone className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <Avatar className="h-20 w-20 mb-4">
              <AvatarImage src={friend.avatar_url || ""} />
              <AvatarFallback className="text-2xl bg-muted">
                {friend.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <h4 className="font-semibold text-foreground mb-1">
              {friend.username}
            </h4>
            <p className="text-sm">
              C'est le début de votre conversation privée.
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
                <div key={msg.id}>
                  {showTime && (
                    <p className="text-xs text-center text-muted-foreground mb-2">
                      {format(new Date(msg.created_at), "PPp", { locale: fr })}
                    </p>
                  )}
                  <div
                    className={cn(
                      "flex items-end gap-2",
                      isMe && "flex-row-reverse"
                    )}
                  >
                    {showAvatar ? (
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={isMe ? "" : friend.avatar_url || ""}
                        />
                        <AvatarFallback className="text-xs bg-muted">
                          {isMe
                            ? user?.email?.[0]?.toUpperCase()
                            : friend.username[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="w-8" />
                    )}
                    <div
                      className={cn(
                        "max-w-[70%] px-4 py-2 rounded-2xl",
                        isMe
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-secondary rounded-bl-md"
                      )}
                    >
                      <p className="text-sm break-words">{msg.content}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <form onSubmit={handleSend} className="p-4 border-t border-border/50">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Message @${friend.username}`}
            className="flex-1 bg-secondary/30 border-border/50"
            disabled={sending}
          />
          <Button type="submit" size="icon" disabled={!input.trim() || sending}>
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
