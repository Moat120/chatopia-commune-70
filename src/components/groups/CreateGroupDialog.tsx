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
import { useGroups } from "@/hooks/useGroups";
import { useToast } from "@/hooks/use-toast";
import { Users, Loader2 } from "lucide-react";

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CreateGroupDialog = ({ open, onOpenChange }: CreateGroupDialogProps) => {
  const { createGroup } = useGroups();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[CreateGroupDialog] Submit clicked, name:", name);
    
    if (!name.trim()) {
      console.log("[CreateGroupDialog] Name is empty, returning");
      return;
    }

    setLoading(true);
    console.log("[CreateGroupDialog] Calling createGroup...");
    
    try {
      const group = await createGroup(name.trim());
      console.log("[CreateGroupDialog] Result:", group);
      
      if (group) {
        toast({
          title: "Groupe créé !",
          description: `Le groupe "${name}" a été créé avec succès`,
        });
        setName("");
        onOpenChange(false);
      } else {
        toast({
          title: "Erreur",
          description: "Impossible de créer le groupe. Vérifie que tu es bien connecté.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("[CreateGroupDialog] Error:", error);
      toast({
        title: "Erreur",
        description: "Une erreur s'est produite lors de la création du groupe",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Créer un groupe
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nom du groupe</Label>
            <Input
              id="name"
              placeholder="Mon super groupe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Maximum 10 membres par groupe
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={!name.trim() || loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Création...
                </>
              ) : (
                "Créer"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateGroupDialog;
