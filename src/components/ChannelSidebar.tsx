import { Hash, ChevronDown, Volume2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { getServer, getChannels, getCurrentUser } from "@/lib/localStorage";
import SettingsDialog from "./SettingsDialog";

interface ChannelSidebarProps {
  serverId: string | null;
  selectedChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
}

const ChannelSidebar = ({ serverId, selectedChannelId, onSelectChannel }: ChannelSidebarProps) => {
  const [server, setServer] = useState(serverId ? getServer(serverId) : null);
  const [channels, setChannels] = useState(serverId ? getChannels(serverId) : []);
  const [profile, setProfile] = useState(getCurrentUser());

  useEffect(() => {
    if (serverId) {
      setServer(getServer(serverId));
      setChannels(getChannels(serverId));
    }
  }, [serverId]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'channels' && serverId) {
        setChannels(getChannels(serverId));
      }
      if (e.key === 'currentUser') {
        setProfile(getCurrentUser());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [serverId]);

  if (!serverId) {
    return (
      <div className="w-60 bg-[hsl(var(--channel-sidebar))] flex items-center justify-center text-muted-foreground">
        Sélectionnez un serveur
      </div>
    );
  }

  return (
    <div className="w-60 bg-[hsl(var(--channel-sidebar))] flex flex-col">
      <div className="h-12 px-4 flex items-center justify-between border-b border-border shadow-sm">
        <h2 className="font-semibold text-foreground">{server?.name}</h2>
        <ChevronDown className="w-4 h-4 text-foreground" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-2 py-4">
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              Canaux textuels
            </span>
            <Button size="icon" variant="ghost" className="w-4 h-4">
              <Plus className="w-3 h-3" />
            </Button>
          </div>

          <div className="space-y-0.5">
            {channels.filter(c => c.type === 'text').map((channel) => (
              <button
                key={channel.id}
                onClick={() => onSelectChannel(channel.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                  selectedChannelId === channel.id
                    ? "bg-[hsl(var(--active-channel))] text-foreground"
                    : "text-muted-foreground hover:bg-[hsl(var(--hover-bg))] hover:text-foreground"
                }`}
              >
                <Hash className="w-4 h-4" />
                {channel.name}
              </button>
            ))}
          </div>
        </div>

        <div className="px-2 py-4">
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              Canaux vocaux
            </span>
          </div>

          <div className="space-y-0.5">
            {channels.filter(c => c.type === 'voice').map((channel) => (
              <button
                key={channel.id}
                onClick={() => onSelectChannel(channel.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                  selectedChannelId === channel.id
                    ? "bg-[hsl(var(--active-channel))] text-foreground"
                    : "text-muted-foreground hover:bg-[hsl(var(--hover-bg))] hover:text-foreground"
                }`}
              >
                <Volume2 className="w-4 h-4" />
                {channel.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-2 bg-[hsl(var(--server-sidebar))] flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-semibold">
            {profile?.username?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground truncate">
              {profile?.username}
            </div>
            <div className="text-xs text-muted-foreground truncate">{profile?.status || "En ligne"}</div>
          </div>
        </div>
        <SettingsDialog />
      </div>
    </div>
  );
};

export default ChannelSidebar;