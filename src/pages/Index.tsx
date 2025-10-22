import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ServerSidebar from "@/components/ServerSidebar";
import ChannelSidebar from "@/components/ChannelSidebar";
import ChatArea from "@/components/ChatArea";
import UsernameDialog from "@/components/UsernameDialog";
import { getServers } from "@/lib/localStorage";
import { joinServerByInvite } from "@/lib/invitations";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  useEffect(() => {
    // Check for invite code in URL
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('invite');
    
    if (inviteCode) {
      const result = joinServerByInvite(inviteCode);
      if (result.success) {
        toast({
          title: "Serveur rejoint !",
          description: "Vous avez rejoint le serveur avec succès",
        });
        setSelectedServerId(result.serverId!);
        // Clean URL
        window.history.replaceState({}, '', '/');
      } else {
        toast({
          title: "Erreur",
          description: result.error,
          variant: "destructive",
        });
      }
    }

    // Auto-select first server
    const servers = getServers();
    if (servers.length > 0 && !selectedServerId) {
      setSelectedServerId(servers[0].id);
    }
  }, [toast]);

  return (
    <>
      <UsernameDialog />
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
    </>
  );
};

export default Index;
