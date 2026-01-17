import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useFriends } from "@/hooks/useFriends";
import { useGroups } from "@/hooks/useGroups";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserPlus, Loader2, Users } from "lucide-react";
import { playClickSound } from "@/hooks/useSound";

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  existingMemberIds: string[];
}

const AddMemberDialog = ({
  open,
  onOpenChange,
  groupId,
  existingMemberIds,
}: AddMemberDialogProps) => {
  const { friends } = useFriends();
  const { addMember } = useGroups();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<string[]>([]);

  const availableFriends = friends.filter(
    (f) => !existingMemberIds.includes(f.id) && !addedIds.includes(f.id)
  );

  const handleAdd = async (userId: string, username: string) => {
    playClickSound();
    setLoading(userId);
    const success = await addMember(groupId, userId);
    setLoading(null);

    if (success) {
      setAddedIds((prev) => [...prev, userId]);
      toast({
        title: "Membre ajouté",
        description: `${username} a été ajouté au groupe`,
      });
    } else {
      toast({
        title: "Erreur",
        description: "Impossible d'ajouter ce membre (limite de 10 atteinte ?)",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-premium border-white/[0.08] rounded-3xl sm:max-w-md">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/25 to-primary/10 border border-primary/20 flex items-center justify-center">
              <UserPlus className="h-5 w-5 text-primary" />
            </div>
            <span className="gradient-text-static">Ajouter des membres</span>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground/70">
            Sélectionne les amis à ajouter au groupe.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-80">
          {availableFriends.length === 0 ? (
            <div className="text-center py-12 animate-fade-in-up">
              <div className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-gradient-to-br from-muted/30 to-transparent border border-white/[0.04] flex items-center justify-center">
                <Users className="h-10 w-10 text-muted-foreground/30" />
              </div>
              <p className="text-sm text-muted-foreground font-medium">Aucun ami disponible à ajouter</p>
            </div>
          ) : (
            <div className="space-y-2">
              {availableFriends.map((friend, index) => (
                <div
                  key={friend.id}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-secondary/30 border border-white/[0.04] transition-all duration-300 hover:border-white/[0.08] animate-fade-in"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <Avatar className="h-12 w-12 ring-2 ring-white/10">
                    <AvatarImage src={friend.avatar_url || ""} className="object-cover" />
                    <AvatarFallback className="bg-gradient-to-br from-muted to-muted/50 font-semibold">
                      {friend.username[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{friend.username}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAdd(friend.id, friend.username)}
                    disabled={loading === friend.id}
                    className="rounded-xl btn-premium"
                  >
                    {loading === friend.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-1" />
                        Ajouter
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default AddMemberDialog;
