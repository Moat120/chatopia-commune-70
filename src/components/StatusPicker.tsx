import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { X, Smile } from "lucide-react";

const PRESET_STATUSES = [
  { emoji: "🎮", label: "En train de jouer" },
  { emoji: "📚", label: "Occupé" },
  { emoji: "🎵", label: "Écoute de la musique" },
  { emoji: "💻", label: "Au travail" },
  { emoji: "🍽️", label: "En train de manger" },
  { emoji: "😴", label: "Ne pas déranger" },
  { emoji: "🏃", label: "AFK" },
  { emoji: "🎬", label: "Regarde un film" },
  { emoji: "☕", label: "Pause café" },
  { emoji: "🎯", label: "En compétition" },
  { emoji: "📱", label: "Sur mobile" },
  { emoji: "✈️", label: "En voyage" },
];

interface StatusPickerProps {
  currentStatus?: string | null;
  children: React.ReactNode;
}

const StatusPicker = ({ currentStatus, children }: StatusPickerProps) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState("💬");

  const setStatus = async (status: string | null) => {
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ custom_status: status, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    setOpen(false);
    setCustomText("");
  };

  const handlePresetClick = (preset: { emoji: string; label: string }) => {
    setStatus(`${preset.emoji} ${preset.label}`);
  };

  const handleCustomSubmit = () => {
    if (customText.trim()) {
      setStatus(`${selectedEmoji} ${customText.trim()}`);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 rounded-xl border-white/[0.08] bg-card/95 backdrop-blur-xl"
        align="start"
        sideOffset={8}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60 mb-3">
            Définir un statut
          </p>

          {/* Custom input */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => {
                const emojis = ["💬", "🎮", "📚", "💻", "🎵", "⭐", "🔥", "❤️"];
                const idx = emojis.indexOf(selectedEmoji);
                setSelectedEmoji(emojis[(idx + 1) % emojis.length]);
              }}
              className="h-9 w-9 shrink-0 rounded-lg bg-secondary/50 border border-white/[0.06] flex items-center justify-center text-lg hover:bg-secondary/80 transition-colors"
            >
              {selectedEmoji}
            </button>
            <Input
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Statut personnalisé…"
              className="h-9 text-sm rounded-lg input-modern"
              onKeyDown={(e) => e.key === "Enter" && handleCustomSubmit()}
            />
          </div>
          {customText.trim() && (
            <Button
              size="sm"
              className="w-full h-8 rounded-lg text-xs mb-2"
              onClick={handleCustomSubmit}
            >
              Définir
            </Button>
          )}
        </div>

        {/* Presets */}
        <div className="px-2 pb-2 max-h-48 overflow-y-auto">
          {PRESET_STATUSES.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handlePresetClick(preset)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-150",
                "hover:bg-white/[0.06] text-sm",
                currentStatus === `${preset.emoji} ${preset.label}` &&
                  "bg-primary/10 text-primary"
              )}
            >
              <span className="text-base">{preset.emoji}</span>
              <span className="truncate">{preset.label}</span>
            </button>
          ))}
        </div>

        {/* Clear */}
        {currentStatus && (
          <div className="px-2 pb-2 border-t border-white/[0.04] pt-2">
            <button
              onClick={() => setStatus(null)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-150"
            >
              <X className="h-4 w-4" />
              <span>Effacer le statut</span>
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default StatusPicker;
