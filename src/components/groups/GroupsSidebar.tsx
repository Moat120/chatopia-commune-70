import { useState } from "react";
import { useGroups, Group } from "@/hooks/useGroups";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, Plus, MessageCircle, Phone, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import CreateGroupDialog from "./CreateGroupDialog";

interface GroupsSidebarProps {
  selectedGroup: Group | null;
  onSelectGroup: (group: Group | null) => void;
  onStartGroupCall: (group: Group) => void;
  onBack: () => void;
}

const GroupsSidebar = ({
  selectedGroup,
  onSelectGroup,
  onStartGroupCall,
  onBack,
}: GroupsSidebarProps) => {
  const { groups, loading } = useGroups();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="w-72 h-full flex flex-col bg-card/50 border-r border-border/50">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onBack}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Groupes
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Groups List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Chargement...
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Users className="h-12 w-12 mx-auto mb-2 opacity-20" />
              Aucun groupe
              <Button
                variant="link"
                className="block mx-auto mt-2"
                onClick={() => setCreateOpen(true)}
              >
                Créer un groupe
              </Button>
            </div>
          ) : (
            groups.map((group) => (
              <GroupItem
                key={group.id}
                group={group}
                isSelected={selectedGroup?.id === group.id}
                onSelect={() => onSelectGroup(group)}
                onMessage={() => onSelectGroup(group)}
                onCall={() => onStartGroupCall(group)}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
};

interface GroupItemProps {
  group: Group;
  isSelected: boolean;
  onSelect: () => void;
  onMessage: () => void;
  onCall: () => void;
}

const GroupItem = ({
  group,
  isSelected,
  onSelect,
  onMessage,
  onCall,
}: GroupItemProps) => {
  return (
    <div
      className={cn(
        "group flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all",
        "hover:bg-secondary/50",
        isSelected && "bg-secondary/80"
      )}
      onClick={onSelect}
    >
      <Avatar className="h-10 w-10">
        <AvatarImage src={group.avatar_url || ""} />
        <AvatarFallback className="bg-primary/10 text-primary">
          {group.name[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{group.name}</p>
        <p className="text-xs text-muted-foreground">Groupe</p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            onMessage();
          }}
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            onCall();
          }}
        >
          <Phone className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default GroupsSidebar;
