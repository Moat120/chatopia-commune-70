import { useState, useRef, useEffect } from "react";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const EMOJI_CATEGORIES = [
  { name: "Smileys", emojis: ["😀", "😂", "🥹", "😍", "🤩", "😎", "🤔", "😏", "😢", "😭", "🥺", "😡", "🤯", "🫠", "😴", "🤗"] },
  { name: "Gestes", emojis: ["👍", "👎", "👋", "🤝", "🙏", "💪", "✌️", "🤙", "👏", "🫶", "❤️‍🔥", "🖤"] },
  { name: "Objets", emojis: ["🔥", "⭐", "✨", "💯", "❤️", "💀", "🎉", "🎊", "🏆", "💎", "🚀", "⚡"] },
  { name: "Flags", emojis: ["🏳️", "🇫🇷", "🇺🇸", "🇬🇧", "🇩🇪", "🇪🇸", "🇯🇵", "🇰🇷", "🇧🇷", "🇨🇦"] },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  className?: string;
}

const EmojiPicker = ({ onSelect, className }: EmojiPickerProps) => {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(0);

  const handleSelect = (emoji: string) => {
    onSelect(emoji);
    setOpen(false);
  };

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
        className="w-72 p-0 glass-solid border-white/10 rounded-2xl overflow-hidden"
        side="top"
        align="start"
      >
        {/* Category tabs */}
        <div className="flex gap-1 p-2 border-b border-white/[0.04]">
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              key={cat.name}
              onClick={() => setCategory(i)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-lg font-medium transition-all",
                i === category
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
        {/* Emoji grid */}
        <div className="p-2 grid grid-cols-8 gap-0.5 max-h-[180px] overflow-y-auto">
          {EMOJI_CATEGORIES[category].emojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleSelect(emoji)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.08] text-lg transition-all hover:scale-110 active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default EmojiPicker;
