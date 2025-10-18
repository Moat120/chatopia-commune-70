import { Hash, Plus, ChevronDown, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface ChannelSidebarProps {
  serverId: string | null;
  selectedChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
}

const ChannelSidebar = ({ serverId, selectedChannelId, onSelectChannel }: ChannelSidebarProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: server } = useQuery({
    queryKey: ["server", serverId],
    queryFn: async () => {
      if (!serverId) return null;
      const { data, error } = await (supabase as any)
        .from("servers")
        .select("*")
        .eq("id", serverId)
        .single();

      if (error) throw error;
      return data as any;
    },
    enabled: !!serverId,
  });

  const { data: channels } = useQuery({
    queryKey: ["channels", serverId],
    queryFn: async () => {
      if (!serverId) return [];
      const { data, error } = await (supabase as any)
        .from("channels")
        .select("*")
        .eq("server_id", serverId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as any[];
    },
    enabled: !!serverId,
  });

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      return data as any;
    },
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Déconnecté",
      description: "À bientôt !",
    });
    navigate("/auth");
  };

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
            {channels?.map((channel) => (
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
      </div>

      <div className="p-2 bg-[hsl(var(--server-sidebar))] flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-sm font-semibold">
            {profile?.username?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-foreground truncate">
              {profile?.username}
            </div>
            <div className="text-xs text-muted-foreground">{profile?.status}</div>
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleLogout}
          className="w-8 h-8 flex-shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default ChannelSidebar;