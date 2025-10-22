import { useState, useEffect } from "react";
import { getServers } from "@/lib/localStorage";
import CreateServerDialog from "./CreateServerDialog";

interface ServerSidebarProps {
  selectedServerId: string | null;
  onSelectServer: (serverId: string) => void;
}

const ServerSidebar = ({ selectedServerId, onSelectServer }: ServerSidebarProps) => {
  const [servers, setServers] = useState(getServers());

  useEffect(() => {
    const handleStorage = () => {
      setServers(getServers());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

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
      
      <CreateServerDialog />
    </div>
  );
};

export default ServerSidebar;