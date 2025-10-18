import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ServerSidebarProps {
  selectedServerId: string | null;
  onSelectServer: (serverId: string) => void;
}

const ServerSidebar = ({ selectedServerId, onSelectServer }: ServerSidebarProps) => {
  const { data: servers } = useQuery({
    queryKey: ["servers"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("servers")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as any[];
    },
  });

  return (
    <div className="w-[72px] flex flex-col items-center gap-2 py-3 bg-[hsl(var(--server-sidebar))]">
      {servers?.map((server) => (
        <button
          key={server.id}
          onClick={() => onSelectServer(server.id)}
          className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-semibold transition-all hover:rounded-xl ${
            selectedServerId === server.id
              ? "bg-primary rounded-xl"
              : "bg-muted hover:bg-primary"
          }`}
        >
          {server.icon_url ? (
            <img src={server.icon_url} alt={server.name} className="w-full h-full rounded-2xl object-cover" />
          ) : (
            server.name.charAt(0).toUpperCase()
          )}
        </button>
      ))}
      
      <Button
        size="icon"
        variant="ghost"
        className="w-12 h-12 rounded-2xl hover:rounded-xl bg-muted hover:bg-primary transition-all"
      >
        <Plus className="w-6 h-6" />
      </Button>
    </div>
  );
};

export default ServerSidebar;