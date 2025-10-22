import { useState, useEffect } from "react";
import ServerSidebar from "@/components/ServerSidebar";
import ChannelSidebar from "@/components/ChannelSidebar";
import ChatArea from "@/components/ChatArea";
import { getServers } from "@/lib/localStorage";

const Index = () => {
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  useEffect(() => {
    // Auto-select first server
    const servers = getServers();
    if (servers.length > 0 && !selectedServerId) {
      setSelectedServerId(servers[0].id);
    }
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <ServerSidebar
        selectedServerId={selectedServerId}
        onSelectServer={setSelectedServerId}
      />
      <ChannelSidebar
        serverId={selectedServerId}
        selectedChannelId={selectedChannelId}
        onSelectChannel={setSelectedChannelId}
      />
      <ChatArea channelId={selectedChannelId} />
    </div>
  );
};

export default Index;
