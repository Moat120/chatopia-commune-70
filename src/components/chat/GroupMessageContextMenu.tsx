import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GroupMessage } from "@/hooks/useGroupChat";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Pencil, Trash2, Reply } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GroupMessageContextMenuProps {
  message: GroupMessage;
  children: React.ReactNode;
  onReply?: (message: GroupMessage) => void;
}

const GroupMessageContextMenu = ({ message, children, onReply }: GroupMessageContextMenuProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const isOwn = message.sender_id === user?.id;

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    toast({ title: "Message copié" });
  };

  const handleEdit = async () => {
    if (!editContent.trim() || editContent.trim() === message.content) {
      setEditOpen(false);
      return;
    }
    await supabase
      .from("group_messages")
      .update({ content: editContent.trim(), edited_at: new Date().toISOString() })
      .eq("id", message.id);
    setEditOpen(false);
    toast({ title: "Message modifié" });
  };

  const handleDelete = async () => {
    await supabase.from("group_messages").delete().eq("id", message.id);
    setDeleteOpen(false);
    toast({ title: "Message supprimé" });
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-48 glass-solid border-white/10 rounded-xl">
          <ContextMenuItem onClick={handleCopy} className="gap-2 rounded-lg">
            <Copy className="h-4 w-4" /> Copier
          </ContextMenuItem>
          {onReply && (
            <ContextMenuItem onClick={() => onReply(message)} className="gap-2 rounded-lg">
              <Reply className="h-4 w-4" /> Répondre
            </ContextMenuItem>
          )}
          {isOwn && (
            <>
              <ContextMenuSeparator className="bg-white/[0.06]" />
              <ContextMenuItem onClick={() => { setEditContent(message.content); setEditOpen(true); }} className="gap-2 rounded-lg">
                <Pencil className="h-4 w-4" /> Modifier
              </ContextMenuItem>
              <ContextMenuItem onClick={() => setDeleteOpen(true)} className="gap-2 rounded-lg text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4" /> Supprimer
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="glass-premium border-white/[0.08] rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier le message</DialogTitle>
          </DialogHeader>
          <Input
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="input-modern"
            onKeyDown={(e) => { if (e.key === "Enter") handleEdit(); }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} className="rounded-xl">Annuler</Button>
            <Button onClick={handleEdit} className="rounded-xl btn-premium">Sauvegarder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="glass-premium border-white/[0.08] rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Supprimer le message ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Cette action est irréversible.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} className="rounded-xl">Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} className="rounded-xl">Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default GroupMessageContextMenu;
