import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Smile, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const EMOJI_CATEGORIES = [
  { name: "Récents", icon: "🕐", emojis: [] as string[] }, // filled dynamically
  { name: "Smileys", icon: "😀", emojis: ["😀", "😂", "🥹", "😍", "🤩", "😎", "🤔", "😏", "😢", "😭", "🥺", "😡", "🤯", "🫠", "😴", "🤗", "😤", "🥰", "😇", "🤪", "😵‍💫", "🤤", "🫡", "🤫"] },
  { name: "Gestes", icon: "👍", emojis: ["👍", "👎", "👋", "🤝", "🙏", "💪", "✌️", "🤙", "👏", "🫶", "❤️‍🔥", "🖤", "🤌", "🫰", "🤞", "🫵", "👀", "🧠"] },
  { name: "Objets", icon: "🔥", emojis: ["🔥", "⭐", "✨", "💯", "❤️", "💀", "🎉", "🎊", "🏆", "💎", "🚀", "⚡", "🎵", "🎮", "☕", "🍕", "🌙", "🌈"] },
  { name: "Drapeaux", icon: "🏳️", emojis: ["🏳️", "🇫🇷", "🇺🇸", "🇬🇧", "🇩🇪", "🇪🇸", "🇯🇵", "🇰🇷", "🇧🇷", "🇨🇦", "🇮🇹", "🇵🇹"] },
];

const RECENT_KEY = "emoji-recent";
const MAX_RECENT = 16;

function getRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function addRecent(emoji: string) {
  const recent = getRecent().filter(e => e !== emoji);
  recent.unshift(emoji);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  className?: string;
}

const EmojiPicker = ({ onSelect, className }: EmojiPickerProps) => {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(0);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Load recent emojis
  const categories = useMemo(() => {
    const cats = [...EMOJI_CATEGORIES];
    cats[0] = { ...cats[0], emojis: getRecent() };
    return cats;
  }, [open]); // refresh when opening

  // Auto-focus search on open
  useEffect(() => {
    if (open) {
      setSearch("");
      // Show recent if available, otherwise smileys
      const recent = getRecent();
      setCategory(recent.length > 0 ? 0 : 1);
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSelect = (emoji: string) => {
    addRecent(emoji);
    onSelect(emoji);
    setOpen(false);
  };

  // Filtered emojis when searching
  const allEmojis = useMemo(() => {
    if (!search.trim()) return null;
    const all: string[] = [];
    categories.forEach(c => c.emojis.forEach(e => { if (!all.includes(e)) all.push(e); }));
    return all; // Can't really search emoji by name without a mapping, so show all
  }, [search, categories]);

  const displayEmojis = allEmojis || categories[category]?.emojis || [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-9 w-9 rounded-xl hover:bg-white/[0.06] text-muted-foreground hover:text-foreground transition-all", className)}
          type="button"
        >
          <Smile className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 glass-solid border-white/10 rounded-2xl overflow-hidden"
        side="top"
        align="start"
      >
        {/* Search */}
        <div className="px-3 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un emoji…"
              className="w-full h-8 pl-8 pr-3 text-xs bg-secondary/40 border border-white/[0.04] rounded-lg outline-none focus:border-primary/30 text-foreground placeholder:text-muted-foreground/40 transition-colors"
            />
          </div>
        </div>

        {/* Category tabs */}
        {!search && (
          <div className="flex gap-0.5 px-2 pb-1">
            {categories.map((cat, i) => (
              <button
                key={cat.name}
                onClick={() => setCategory(i)}
                className={cn(
                  "flex-1 py-1.5 text-center text-sm rounded-lg transition-all",
                  i === category
                    ? "bg-primary/15 scale-110"
                    : "hover:bg-white/[0.04] opacity-60 hover:opacity-100"
                )}
                title={cat.name}
              >
                {cat.icon}
              </button>
            ))}
          </div>
        )}

        {/* Emoji grid */}
        <div className="p-2 pt-1">
          {!search && categories[category]?.name && (
            <p className="text-[10px] text-muted-foreground/40 font-semibold uppercase tracking-wider px-1 mb-1">
              {categories[category].name}
            </p>
          )}
          <div className="grid grid-cols-8 gap-0.5 max-h-[200px] overflow-y-auto">
            {displayEmojis.length > 0 ? displayEmojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleSelect(emoji)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.08] text-lg transition-all hover:scale-125 active:scale-95"
              >
                {emoji}
              </button>
            )) : (
              <p className="col-span-8 text-center text-xs text-muted-foreground/40 py-4">
                {category === 0 ? "Aucun emoji récent" : "Aucun résultat"}
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default EmojiPicker;
