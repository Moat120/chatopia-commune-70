import { useState } from "react";
import { UserPlus, Copy, Check } from "lucide-react";
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
import { createInvitation, getInvitationLink } from "@/lib/invitations";

interface InviteDialogProps {
  serverId: string;
  serverName: string;
}

const InviteDialog = ({ serverId, serverName }: InviteDialogProps) => {
  const [open, setOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleGenerateInvite = () => {
    const invitation = createInvitation(serverId);
    const link = getInvitationLink(invitation.code);
    setInviteLink(link);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Lien copié !",
        description: "Le lien d'invitation a été copié dans le presse-papier",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de copier le lien",
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
          className="w-4 h-4"
          onClick={handleGenerateInvite}
        >
          <UserPlus className="w-3 h-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Inviter des amis</DialogTitle>
          <DialogDescription>
            Partagez ce lien pour inviter des personnes à rejoindre {serverName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-link">Lien d'invitation</Label>
            <div className="flex gap-2">
              <Input
                id="invite-link"
                value={inviteLink}
                readOnly
                className="flex-1"
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={handleCopy}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Ce lien expire dans 7 jours
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InviteDialog;
