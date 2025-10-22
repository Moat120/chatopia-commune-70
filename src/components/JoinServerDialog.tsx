import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { joinServerByInvite } from "@/lib/invitations";

interface JoinServerDialogProps {
  onServerJoined: (serverId: string) => void;
}

const JoinServerDialog = ({ onServerJoined }: JoinServerDialogProps) => {
  const [open, setOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const { toast } = useToast();

  const handleJoin = () => {
    if (!inviteCode.trim()) return;

    const result = joinServerByInvite(inviteCode.trim());
    
    if (result.success) {
      toast({
        title: "Serveur rejoint !",
        description: "Vous avez rejoint le serveur avec succès",
      });
      
      // Trigger storage event for other components
      window.dispatchEvent(new StorageEvent('storage', { key: 'servers' }));
      
      onServerJoined(result.serverId!);
      setOpen(false);
      setInviteCode("");
    } else {
      toast({
        title: "Erreur",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="w-12 h-12 rounded-2xl hover:rounded-xl bg-primary hover:bg-primary/80 transition-all"
          title="Rejoindre un serveur"
        >
          <Plus className="w-6 h-6" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rejoindre un serveur</DialogTitle>
          <DialogDescription>
            Entrez le code d'invitation pour rejoindre un serveur
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-code">Code d'invitation</Label>
            <Input
              id="invite-code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="AbCdEfGh"
              maxLength={8}
            />
          </div>
          <DialogFooter>
            <Button onClick={handleJoin} className="w-full">
              Rejoindre
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default JoinServerDialog;
