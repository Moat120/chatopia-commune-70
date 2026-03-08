import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const shortcuts = [
  { category: "Général", items: [
    { keys: ["Ctrl", "K"], desc: "Recherche rapide" },
    { keys: ["Ctrl", "/"], desc: "Raccourcis clavier" },
    { keys: ["Escape"], desc: "Fermer / Retour" },
  ]},
  { category: "Vocal", items: [
    { keys: ["Ctrl", "Shift", "M"], desc: "Couper / Réactiver le micro" },
    { keys: ["Ctrl", "Shift", "D"], desc: "Sourdine / Rétablir le son" },
    { keys: ["Ctrl", "Shift", "E"], desc: "Partager l'écran" },
  ]},
  { category: "Navigation", items: [
    { keys: ["Ctrl", "1"], desc: "Onglet Messages" },
    { keys: ["Ctrl", "2"], desc: "Onglet Groupes" },
  ]},
];

const Kbd = ({ children }: { children: string }) => (
  <kbd className={cn(
    "inline-flex items-center justify-center min-w-[24px] h-6 px-1.5",
    "text-[11px] font-semibold rounded-md",
    "bg-muted/80 text-muted-foreground border border-border",
    "shadow-[0_1px_0_1px_hsl(var(--background)/0.4)]"
  )}>
    {children}
  </kbd>
);

const KeyboardShortcutsDialog = ({ open, onOpenChange }: KeyboardShortcutsDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] gap-0 p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2.5 text-base">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Keyboard className="h-4 w-4 text-primary" />
            </div>
            Raccourcis clavier
          </DialogTitle>
        </DialogHeader>
        
        <div className="p-4 space-y-5 max-h-[60vh] overflow-y-auto">
          {shortcuts.map((group) => (
            <div key={group.category} className="space-y-2">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                {group.category}
              </h3>
              <div className="space-y-1">
                {group.items.map((shortcut) => (
                  <div
                    key={shortcut.desc}
                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <span className="text-sm text-foreground/90">{shortcut.desc}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <Kbd>{key}</Kbd>
                          {i < shortcut.keys.length - 1 && (
                            <span className="text-[10px] text-muted-foreground/50">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default KeyboardShortcutsDialog;
