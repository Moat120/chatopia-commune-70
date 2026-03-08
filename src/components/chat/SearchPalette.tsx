import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, MessageCircle, Users, User, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchResult {
  type: "friend" | "group" | "message";
  id: string;
  title: string;
  subtitle?: string;
  avatarUrl?: string;
  data?: any;
}

interface SearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectFriend?: (friend: any) => void;
  onSelectGroup?: (group: any) => void;
}

const SearchPalette = ({ open, onOpenChange, onSelectFriend, onSelectGroup }: SearchPaletteProps) => {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (!q.trim() || !user) {
      setResults([]);
      return;
    }

    setLoading(true);
    const searchResults: SearchResult[] = [];

    // Search friends
    const { data: friendships } = await supabase
      .from("friendships")
      .select(`
        requester:profiles!friendships_requester_id_fkey(id, username, avatar_url, status, friend_code),
        addressee:profiles!friendships_addressee_id_fkey(id, username, avatar_url, status, friend_code)
      `)
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    if (friendships) {
      friendships.forEach((f: any) => {
        const friend = f.requester?.id === user.id ? f.addressee : f.requester;
        if (friend && friend.username.toLowerCase().includes(q.toLowerCase())) {
          searchResults.push({
            type: "friend",
            id: friend.id,
            title: friend.username,
            subtitle: friend.status === "online" ? "En ligne" : "Hors ligne",
            avatarUrl: friend.avatar_url,
            data: friend,
          });
        }
      });
    }

    // Search groups
    const { data: groups } = await supabase
      .from("group_members")
      .select("group:groups(*)")
      .eq("user_id", user.id);

    if (groups) {
      groups.forEach((gm: any) => {
        if (gm.group && gm.group.name.toLowerCase().includes(q.toLowerCase())) {
          searchResults.push({
            type: "group",
            id: gm.group.id,
            title: gm.group.name,
            subtitle: "Groupe",
            avatarUrl: gm.group.avatar_url,
            data: gm.group,
          });
        }
      });
    }

    // Search messages
    const { data: msgs } = await supabase
      .from("private_messages")
      .select("*")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .ilike("content", `%${q}%`)
      .order("created_at", { ascending: false })
      .limit(5);

    if (msgs) {
      msgs.forEach((msg: any) => {
        searchResults.push({
          type: "message",
          id: msg.id,
          title: msg.content.substring(0, 60) + (msg.content.length > 60 ? "…" : ""),
          subtitle: new Date(msg.created_at).toLocaleDateString("fr-FR"),
          data: msg,
        });
      });
    }

    setResults(searchResults);
    setSelectedIndex(0);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 200);
    return () => clearTimeout(timer);
  }, [query, search]);

  const handleSelect = (result: SearchResult) => {
    if (result.type === "friend" && onSelectFriend) {
      onSelectFriend(result.data);
    } else if (result.type === "group" && onSelectGroup) {
      onSelectGroup(result.data);
    }
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "friend": return <User className="h-4 w-4 text-primary" />;
      case "group": return <Users className="h-4 w-4 text-accent-foreground" />;
      case "message": return <MessageCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "friend": return "Ami";
      case "group": return "Groupe";
      case "message": return "Message";
      default: return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-premium border-white/[0.08] rounded-2xl sm:max-w-lg p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Recherche</DialogTitle>
        <div className="flex items-center gap-3 px-4 border-b border-white/[0.06]">
          <Search className={cn("h-5 w-5 shrink-0 transition-colors", loading ? "text-primary animate-pulse" : "text-muted-foreground")} />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Rechercher amis, groupes, messages…"
            className="border-0 bg-transparent h-14 text-base focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
          />
          <kbd className="hidden sm:inline-flex h-6 px-2 items-center gap-1 rounded-md bg-muted/50 text-[11px] text-muted-foreground font-mono border border-white/[0.06]">
            ESC
          </kbd>
        </div>

        {results.length > 0 ? (
          <div className="max-h-[320px] overflow-y-auto p-2">
            {results.map((result, idx) => (
              <button
                key={`${result.type}-${result.id}`}
                onClick={() => handleSelect(result)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150",
                  idx === selectedIndex
                    ? "bg-primary/10 text-foreground"
                    : "hover:bg-white/[0.04] text-foreground/80"
                )}
              >
                {result.avatarUrl ? (
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={result.avatarUrl} className="object-cover" />
                    <AvatarFallback className="bg-muted text-xs font-semibold">{result.title[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="h-9 w-9 rounded-full bg-muted/50 flex items-center justify-center">
                    {getIcon(result.type)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{result.title}</p>
                  {result.subtitle && <p className="text-xs text-muted-foreground/50 truncate">{result.subtitle}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-muted-foreground/40 uppercase font-semibold tracking-wider">
                    {getTypeLabel(result.type)}
                  </span>
                  {idx === selectedIndex && (
                    <ArrowRight className="h-3 w-3 text-primary/50 animate-fade-in" />
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : query.trim() ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground/40 text-sm">
              {loading ? "Recherche en cours…" : `Aucun résultat pour "${query}"`}
            </p>
          </div>
        ) : (
          <div className="p-6 text-center space-y-3">
            <p className="text-muted-foreground/30 text-sm">Tapez pour rechercher…</p>
            <div className="flex justify-center gap-4 text-[10px] text-muted-foreground/25 font-mono">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-muted/30 border border-white/[0.04]">↑↓</kbd>
                naviguer
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-muted/30 border border-white/[0.04]">⏎</kbd>
                sélectionner
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-muted/30 border border-white/[0.04]">esc</kbd>
                fermer
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SearchPalette;
