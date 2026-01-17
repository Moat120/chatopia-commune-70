import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Maximize2, Minimize2, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { playClickSound } from "@/hooks/useSound";

interface ScreenStream {
  odId: string;
  username: string;
  stream: MediaStream;
  isLocal?: boolean;
}

interface MultiScreenShareViewProps {
  screens: ScreenStream[];
  onStopLocal?: () => void;
}

const ScreenTile = ({ 
  screen, 
  isExpanded, 
  onExpand, 
  onStopLocal 
}: { 
  screen: ScreenStream;
  isExpanded: boolean;
  onExpand: () => void;
  onStopLocal?: () => void;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(!screen.isLocal);

  useEffect(() => {
    if (videoRef.current && screen.stream) {
      videoRef.current.srcObject = screen.stream;
      videoRef.current.muted = isMuted;
    }
  }, [screen.stream, isMuted]);

  return (
    <div 
      className={cn(
        "relative rounded-2xl overflow-hidden bg-black/50 border border-white/[0.06]",
        "transition-all duration-400",
        isExpanded ? "col-span-full row-span-full" : ""
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        className="w-full h-full object-contain bg-black"
      />
      
      {/* Overlay controls */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300">
        <div className="absolute bottom-0 left-0 right-0 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-white text-sm font-semibold truncate max-w-[150px]">
              {screen.username}
              {screen.isLocal && " (Vous)"}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            {!screen.isLocal && (
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 rounded-xl text-white hover:bg-white/20 transition-all duration-300"
                onClick={() => { playClickSound(); setIsMuted(!isMuted); }}
              >
                {isMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
            )}
            
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 rounded-xl text-white hover:bg-white/20 transition-all duration-300"
              onClick={() => { playClickSound(); onExpand(); }}
            >
              {isExpanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            
            {screen.isLocal && onStopLocal && (
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 rounded-xl text-destructive hover:bg-destructive/20 transition-all duration-300"
                onClick={() => { playClickSound(); onStopLocal(); }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Live badge */}
      <div className="absolute top-4 left-4">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-destructive/90 text-destructive-foreground text-xs font-bold shadow-lg shadow-destructive/30">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          LIVE
        </div>
      </div>
    </div>
  );
};

const MultiScreenShareView = ({ screens, onStopLocal }: MultiScreenShareViewProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (screens.length === 0) return null;

  const gridCols = screens.length === 1 ? 1 : screens.length <= 4 ? 2 : 3;

  return (
    <div className="w-full h-full p-4">
      <div 
        className={cn(
          "grid gap-4 h-full",
          expandedId ? "grid-cols-1 grid-rows-1" : "",
          !expandedId && gridCols === 1 && "grid-cols-1",
          !expandedId && gridCols === 2 && "grid-cols-2",
          !expandedId && gridCols === 3 && "grid-cols-3"
        )}
        style={{
          gridAutoRows: expandedId ? "1fr" : "minmax(0, 1fr)"
        }}
      >
        {screens.map((screen) => (
          <ScreenTile
            key={screen.odId}
            screen={screen}
            isExpanded={expandedId === screen.odId}
            onExpand={() => setExpandedId(expandedId === screen.odId ? null : screen.odId)}
            onStopLocal={screen.isLocal ? onStopLocal : undefined}
          />
        ))}
      </div>
    </div>
  );
};

export default MultiScreenShareView;
