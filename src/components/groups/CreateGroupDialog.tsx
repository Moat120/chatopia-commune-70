import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGroups } from "@/hooks/useGroups";
import { useToast } from "@/hooks/use-toast";
import { Users, Loader2 } from "lucide-react";
import { playClickSound } from "@/hooks/useSound";

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
    
    if (!name.trim()) return;

    playClickSound();
    setLoading(true);
    
    try {
      const group = await createGroup(name.trim());
      
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
      <DialogContent className="glass-premium border-white/[0.08] rounded-3xl sm:max-w-md">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/25 to-primary/10 border border-primary/20 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <span className="gradient-text-static">Créer un groupe</span>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground/70">
            Crée un nouveau groupe pour discuter et appeler tes amis.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-3">
            <Label htmlFor="name" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Nom du groupe
            </Label>
            <Input
              id="name"
              placeholder="Mon super groupe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              autoFocus
              className="h-12 input-modern text-base"
            />
            <p className="text-xs text-muted-foreground/60">
              Maximum 10 membres par groupe
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => { playClickSound(); onOpenChange(false); }}
              disabled={loading}
              className="rounded-xl hover:bg-white/[0.06]"
            >
              Annuler
            </Button>
            <Button 
              type="submit" 
              disabled={!name.trim() || loading}
              className="rounded-xl btn-premium"
            >
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
