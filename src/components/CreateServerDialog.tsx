import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addServer, addChannel } from "@/lib/localStorage";

const CreateServerDialog = () => {
  const [open, setOpen] = useState(false);
  const [serverName, setServerName] = useState("");
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverName.trim()) return;

    const server = addServer(serverName.trim());
    
    // Create default channels
    addChannel(server.id, "général", "text");
    addChannel(server.id, "vocal", "voice");

    // Trigger storage event for other components
    window.dispatchEvent(new StorageEvent('storage', { key: 'servers' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'channels' }));

    toast({
      title: "Serveur créé !",
      description: "Votre nouveau serveur a été créé avec succès.",
    });
    setServerName("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="w-12 h-12 rounded-2xl hover:rounded-xl bg-muted hover:bg-primary transition-all"
        >
          <Plus className="w-6 h-6" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Créer un serveur</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="server-name">Nom du serveur</Label>
            <Input
              id="server-name"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="Mon Super Serveur"
              required
            />
          </div>
          <Button type="submit" className="w-full">
            Créer
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateServerDialog;