import { useState, useEffect, useRef } from "react";
import { Hash, Send, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getChannel, getMessages, addMessage } from "@/lib/localStorage";
import VoiceChannel from "./VoiceChannel";

interface ChatAreaProps {
  channelId: string | null;
}

const ChatArea = ({ channelId }: ChatAreaProps) => {
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState(channelId ? getChannel(channelId) : null);
  const [messages, setMessages] = useState(channelId ? getMessages(channelId) : []);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (channelId) {
      setChannel(getChannel(channelId));
      setMessages(getMessages(channelId));
    }
  }, [channelId]);

  useEffect(() => {
    const handleStorage = () => {
      if (channelId) {
        setMessages(getMessages(channelId));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [channelId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !channelId) return;
    addMessage(channelId, message);
    setMessage("");
    setMessages(getMessages(channelId));
  };

  if (!channelId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[hsl(var(--chat-background))] text-muted-foreground">
        Sélectionnez un canal pour commencer
      </div>
    );
  }

  // Voice channel
  if (channel?.type === 'voice') {
    return (
      <div className="flex-1 flex flex-col bg-[hsl(var(--chat-background))]">
        <div className="h-12 px-4 flex items-center gap-2 border-b border-border shadow-sm">
          <Volume2 className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">{channel?.name}</h2>
        </div>
        <VoiceChannel channelId={channelId} channelName={channel?.name || ""} />
      </div>
    );
  }

  // Text channel
  return (
    <div className="flex-1 flex flex-col bg-[hsl(var(--chat-background))]">
      <div className="h-12 px-4 flex items-center gap-2 border-b border-border shadow-sm">
        <Hash className="w-5 h-5 text-muted-foreground" />
        <h2 className="font-semibold text-foreground">{channel?.name}</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className="flex gap-3 hover:bg-[hsl(var(--hover-bg))] px-3 py-1 rounded">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-sm font-semibold flex-shrink-0">
              {msg.profiles.username.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-foreground">
                  {msg.profiles.username}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(msg.created_at).toLocaleString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-foreground break-words">{msg.content}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={`Message #${channel?.name}`}
            className="flex-1 bg-[hsl(var(--hover-bg))] border-none"
          />
          <Button type="submit" size="icon" disabled={!message.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ChatArea;