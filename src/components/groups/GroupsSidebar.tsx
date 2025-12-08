import { useState } from "react";
import { useGroups, Group } from "@/hooks/useGroups";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Users, Plus, MessageCircle, Phone, ChevronLeft, Search } from "lucide-react";
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
  const [search, setSearch] = useState("");

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-80 h-full flex flex-col glass-subtle border-r border-white/[0.06]">
      {/* Header */}
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl hover:bg-white/[0.08]"
              onClick={onBack}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-semibold flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <Users className="h-4 w-4 text-primary" />
              </div>
              Groupes
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl hover:bg-white/[0.08]"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="pl-9 h-10 input-modern"
          />
        </div>
      </div>

      {/* Groups List */}
      <ScrollArea className="flex-1 px-3">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <div className="w-8 h-8 mx-auto mb-3 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            Chargement...
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted/30 flex items-center justify-center">
              <Users className="h-8 w-8 opacity-40" />
            </div>
            <p className="text-sm mb-3">Aucun groupe</p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Créer un groupe
            </Button>
          </div>
        ) : (
          <div className="space-y-1 pb-4">
            {filteredGroups.map((group) => (
              <GroupItem
                key={group.id}
                group={group}
                isSelected={selectedGroup?.id === group.id}
                onSelect={() => onSelectGroup(group)}
                onMessage={() => onSelectGroup(group)}
                onCall={() => onStartGroupCall(group)}
              />
            ))}
          </div>
        )}
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
        "group flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all duration-200",
        isSelected
          ? "bg-primary/15 border border-primary/20"
          : "hover:bg-white/[0.06] border border-transparent"
      )}
      onClick={onSelect}
    >
      <Avatar className="h-11 w-11 ring-2 ring-white/5">
        <AvatarImage src={group.avatar_url || ""} className="object-cover" />
        <AvatarFallback className="bg-primary/10 text-primary font-medium">
          {group.name[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{group.name}</p>
        <p className="text-xs text-muted-foreground">
          {group.member_count || 1} membre{(group.member_count || 1) > 1 ? "s" : ""}
        </p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg hover:bg-white/[0.1]"
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
          className="h-8 w-8 rounded-lg hover:bg-success/20 hover:text-success"
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
