import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFriends } from "@/hooks/useFriends";
import { useGroups } from "@/hooks/useGroups";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserPlus, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Ajouter des membres
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-80">
          {availableFriends.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Aucun ami disponible à ajouter
            </div>
          ) : (
            <div className="space-y-2">
              {availableFriends.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-secondary/50"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={friend.avatar_url || ""} />
                    <AvatarFallback>
                      {friend.username[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{friend.username}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAdd(friend.id, friend.username)}
                    disabled={loading === friend.id}
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
