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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Demandes d'ami
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-80">
          {pendingRequests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <UserPlus className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Aucune demande en attente</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={request.requester.avatar_url || ""} />
                    <AvatarFallback className="bg-muted">
                      {request.requester.username[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {request.requester.username}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Veut être ton ami
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-success hover:text-success hover:bg-success/10"
                      onClick={() => acceptRequest(request.id)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => declineRequest(request.id)}
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
