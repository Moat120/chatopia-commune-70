import { useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getCurrentUser, updateCurrentUser } from "@/lib/localStorage";

const SettingsDialog = () => {
  const user = getCurrentUser();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState(user.username);
  const [status, setStatus] = useState(user.status || "");
  const { toast } = useToast();

  const handleSave = () => {
    updateCurrentUser({ 
      username: username.trim() || user.username,
      status: status.trim() 
    });

    // Trigger storage event for other components
    window.dispatchEvent(new StorageEvent('storage', { key: 'currentUser' }));

    toast({
      title: "Paramètres sauvegardés",
      description: "Vos modifications ont été enregistrées.",
    });
    
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="w-8 h-8"
          title="Paramètres"
        >
          <Settings className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Paramètres du profil</DialogTitle>
          <DialogDescription>
            Personnalisez votre profil
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="settings-username">Pseudo</Label>
            <Input
              id="settings-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Votre pseudo"
              maxLength={20}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-status">Statut</Label>
            <Input
              id="settings-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              placeholder="En ligne, Occupé, etc."
              maxLength={30}
            />
          </div>
          <Button onClick={handleSave} className="w-full">
            Sauvegarder
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
