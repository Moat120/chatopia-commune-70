import { useEffect } from "react";

interface ShortcutHandlers {
  onEscape?: () => void;
  onSearch?: () => void;
  onToggleMute?: () => void;
  onToggleDeafen?: () => void;
  onToggleScreenShare?: () => void;
  onShowShortcuts?: () => void;
  onSwitchTab?: (tab: number) => void;
}

export const useKeyboardShortcuts = (handlers: ShortcutHandlers) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;

      // Ctrl/Cmd + K → Search
      if (mod && e.key === "k") {
        e.preventDefault();
        handlers.onSearch?.();
        return;
      }

      // Ctrl/Cmd + / → Keyboard shortcuts
      if (mod && e.key === "/") {
        e.preventDefault();
        handlers.onShowShortcuts?.();
        return;
      }

      // Ctrl/Cmd + Shift + M → Toggle mute
      if (mod && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        handlers.onToggleMute?.();
        return;
      }

      // Ctrl/Cmd + Shift + D → Toggle deafen
      if (mod && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        handlers.onToggleDeafen?.();
        return;
      }

      // Ctrl/Cmd + Shift + E → Toggle screen share
      if (mod && e.shiftKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        handlers.onToggleScreenShare?.();
        return;
      }

      // Ctrl/Cmd + 1/2 → Switch tabs
      if (mod && !e.shiftKey && (e.key === "1" || e.key === "2")) {
        e.preventDefault();
        handlers.onSwitchTab?.(parseInt(e.key));
        return;
      }

      // Escape
      if (e.key === "Escape") {
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
