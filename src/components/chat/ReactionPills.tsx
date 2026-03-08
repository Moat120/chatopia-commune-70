import { cn } from "@/lib/utils";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

interface ReactionBarProps {
  reactions: { emoji: string; count: number; hasReacted: boolean }[];
  onToggle: (emoji: string) => void;
  isOwn: boolean;
}

/** Displays reaction pills under a message */
const ReactionPills = ({ reactions, onToggle, isOwn }: ReactionBarProps) => {
  if (reactions.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1 mt-1", isOwn ? "justify-end" : "justify-start")}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={(e) => { e.stopPropagation(); onToggle(r.emoji); }}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] transition-all duration-200 border",
            r.hasReacted
              ? "bg-primary/15 border-primary/30 text-foreground"
              : "bg-secondary/30 border-white/[0.04] text-muted-foreground hover:border-white/[0.1] hover:bg-secondary/50"
          )}
        >
          <span>{r.emoji}</span>
          <span className="font-semibold tabular-nums">{r.count}</span>
        </button>
      ))}
    </div>
  );
};

/** Quick emoji picker that appears on hover */
const QuickReactionPicker = ({
  onSelect,
  side = "right",
}: {
  onSelect: (emoji: string) => void;
  side?: "left" | "right";
}) => (
  <div
    className={cn(
      "absolute top-1/2 -translate-y-1/2 opacity-0 group-hover/msg:opacity-100 transition-all duration-200 z-10",
      "flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-card/90 backdrop-blur-xl border border-white/[0.08] shadow-lg",
      side === "right" ? "-right-2 translate-x-full" : "-left-2 -translate-x-full"
    )}
  >
    {QUICK_EMOJIS.map((emoji) => (
      <button
        key={emoji}
        onClick={(e) => { e.stopPropagation(); onSelect(emoji); }}
        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/[0.08] transition-all duration-150 text-sm hover:scale-110"
      >
        {emoji}
      </button>
    ))}
  </div>
);

export { ReactionPills, QuickReactionPicker, QUICK_EMOJIS };
