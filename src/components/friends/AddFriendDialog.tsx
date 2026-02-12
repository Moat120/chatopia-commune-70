import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useFriends } from "@/hooks/useFriends";
import { UserPlus, Loader2, Sparkles } from "lucide-react";

interface AddFriendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AddFriendDialog = ({ open, onOpenChange }: AddFriendDialogProps) => {
  const { sendFriendRequest } = useFriends();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);
    setError("");

    const result = await sendFriendRequest(input.trim());

    if (result.error) {
      setError(result.error);
    } else {
      setInput("");
      onOpenChange(false);
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-premium border-white/[0.08] rounded-3xl sm:max-w-md">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/25 to-primary/10 border border-primary/20 flex items-center justify-center">
              <UserPlus className="h-5 w-5 text-primary" />
            </div>
            <span className="gradient-text-static">Ajouter un ami</span>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground/70">
            Entre le code ami ou le pseudo de la personne que tu veux ajouter.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-3">
            <Label htmlFor="friend-input" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Code ami ou pseudo
            </Label>
            <Input
              id="friend-input"
              placeholder="Ex: AB12CD34 ou JohnDoe"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="h-12 input-modern text-base"
            />
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-xl animate-fade-in">
                {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="rounded-xl hover:bg-white/[0.06]"
            >
              Annuler
            </Button>
            <Button 
              type="submit" 
              disabled={loading || !input.trim()}
              className="rounded-xl btn-premium"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Envoyer la demande
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddFriendDialog;
