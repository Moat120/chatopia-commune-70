import { useState } from "react";
import { useGroups, Group } from "@/hooks/useGroups";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Users, Plus, MessageCircle, Phone, ChevronLeft, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import CreateGroupDialog from "./CreateGroupDialog";
import { playClickSound } from "@/hooks/useSound";

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
    <div className="w-80 h-full flex flex-col glass-subtle border-r border-white/[0.04]">
      {/* Header */}
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl hover:bg-white/[0.06] transition-all duration-300"
              onClick={() => { playClickSound(); onBack(); }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-bold flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/25 to-primary/10 border border-primary/20 flex items-center justify-center">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <span className="gradient-text-static">Groupes</span>
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl hover:bg-white/[0.06] hover:text-primary transition-all duration-300"
            onClick={() => { playClickSound(); setCreateOpen(true); }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="pl-10 h-11 input-modern"
          />
        </div>
      </div>

      {/* Groups List */}
      <ScrollArea className="flex-1 px-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            <span className="animate-pulse">Chargement...</span>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground animate-fade-in-up">
            <div className="w-20 h-20 mb-5 rounded-3xl bg-gradient-to-br from-muted/30 to-transparent border border-white/[0.04] flex items-center justify-center">
              <Users className="h-10 w-10 opacity-30" />
            </div>
            <p className="text-sm mb-4 font-medium">Aucun groupe</p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-white/10 hover:border-primary/30 hover:bg-primary/10 transition-all duration-300"
              onClick={() => { playClickSound(); setCreateOpen(true); }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Créer un groupe
            </Button>
          </div>
        ) : (
          <div className="space-y-2 pb-4">
            {filteredGroups.map((group, index) => (
              <div
                key={group.id}
                className="animate-fade-in"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <GroupItem
                  group={group}
                  isSelected={selectedGroup?.id === group.id}
                  onSelect={() => { playClickSound(); onSelectGroup(group); }}
                  onMessage={() => onSelectGroup(group)}
                  onCall={() => { playClickSound(); onStartGroupCall(group); }}
                />
              </div>
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
        "group flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all duration-300",
        isSelected
          ? "bg-primary/15 border border-primary/25 shadow-lg shadow-primary/10"
          : "hover:bg-white/[0.04] border border-transparent"
      )}
      onClick={onSelect}
    >
      <Avatar className={cn(
        "h-12 w-12 transition-all duration-300",
        isSelected && "ring-2 ring-primary/30"
      )}>
        <AvatarImage src={group.avatar_url || ""} className="object-cover" />
        <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary font-bold text-lg">
          {group.name[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{group.name}</p>
        <p className="text-xs text-muted-foreground/70 flex items-center gap-1">
          <Users className="h-3 w-3" />
          {group.member_count || 1} membre{(group.member_count || 1) > 1 ? "s" : ""}
        </p>
      </div>
      
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg hover:bg-white/[0.08] transition-all duration-300"
          onClick={(e) => {
            e.stopPropagation();
            playClickSound();
            onMessage();
          }}
        >
          <MessageCircle className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg hover:bg-success/15 hover:text-success transition-all duration-300"
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
