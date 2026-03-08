import { useEffect, useCallback } from "react";

interface ShortcutHandlers {
  onEscape?: () => void;
  onSearch?: () => void;
  onToggleMute?: () => void;
  onToggleDeafen?: () => void;
}

export const useKeyboardShortcuts = (handlers: ShortcutHandlers) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;

      // Ctrl/Cmd + K → Search
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        handlers.onSearch?.();
        return;
      }

      // Ctrl/Cmd + Shift + M → Toggle mute (works even in inputs)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        handlers.onToggleMute?.();
        return;
      }

      // Ctrl/Cmd + Shift + D → Toggle deafen (works even in inputs)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        handlers.onToggleDeafen?.();
        return;
      }

      // Escape
      if (e.key === "Escape") {
        // In inputs: blur the input instead of navigating
        if (isInput) {
          (e.target as HTMLElement)?.blur();
          return;
        }
        handlers.onEscape?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlers]);
};
