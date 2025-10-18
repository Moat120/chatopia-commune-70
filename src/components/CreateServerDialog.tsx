import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const CreateServerDialog = () => {
  const [open, setOpen] = useState(false);
  const [serverName, setServerName] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createServer = useMutation({
    mutationFn: async (name: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const { data: server, error: serverError } = await (supabase as any)
        .from("servers")
        .insert({ name, owner_id: user.id })
        .select()
        .single();

      if (serverError) throw serverError;

      // Add user as member
      const { error: memberError } = await (supabase as any)
        .from("server_members")
        .insert({ server_id: server.id, user_id: user.id });

      if (memberError) throw memberError;

      // Create default channels
      const { error: channelError } = await (supabase as any)
        .from("channels")
        .insert([
          { server_id: server.id, name: "général", type: "text" },
          { server_id: server.id, name: "vocal", type: "voice" },
        ]);

      if (channelError) throw channelError;

      return server;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      toast({
        title: "Serveur créé !",
        description: "Votre nouveau serveur a été créé avec succès.",
      });
      setServerName("");
      setOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverName.trim()) return;
    createServer.mutate(serverName);
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
          <Button type="submit" className="w-full" disabled={createServer.isPending}>
            {createServer.isPending ? "Création..." : "Créer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateServerDialog;