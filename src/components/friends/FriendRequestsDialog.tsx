import { useFriends } from "@/hooks/useFriends";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, Check, X, UserPlus } from "lucide-react";

interface FriendRequestsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FriendRequestsDialog = ({
  open,
  onOpenChange,
}: FriendRequestsDialogProps) => {
  const { pendingRequests, acceptRequest, declineRequest } = useFriends();

  const handleAccept = async (id: string) => {
    await acceptRequest(id);
  };

  const handleDecline = async (id: string) => {
    await declineRequest(id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-premium border-white/[0.08] rounded-3xl sm:max-w-md">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/25 to-primary/10 border border-primary/20 flex items-center justify-center">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <span className="gradient-text-static">Demandes d'ami</span>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-80">
          {pendingRequests.length === 0 ? (
            <div className="text-center py-12 animate-fade-in-up">
              <div className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-gradient-to-br from-muted/30 to-transparent border border-white/[0.04] flex items-center justify-center">
                <UserPlus className="h-10 w-10 text-muted-foreground/30" />
              </div>
              <p className="text-sm text-muted-foreground font-medium">Aucune demande en attente</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingRequests.map((request, index) => (
                <div
                  key={request.id}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-secondary/30 border border-white/[0.04] transition-all duration-300 hover:border-white/[0.08] animate-fade-in"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <Avatar className="h-12 w-12 ring-2 ring-white/10">
                    <AvatarImage src={request.requester.avatar_url || ""} className="object-cover" />
                    <AvatarFallback className="bg-gradient-to-br from-muted to-muted/50 font-semibold">
                      {request.requester.username[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">
                      {request.requester.username}
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      Veut être ton ami
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-10 w-10 rounded-xl bg-success/10 text-success hover:bg-success/20 transition-all duration-300"
                      onClick={() => handleAccept(request.id)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-10 w-10 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all duration-300"
                      onClick={() => handleDecline(request.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default FriendRequestsDialog;
