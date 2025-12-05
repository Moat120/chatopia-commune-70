import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Maximize2, Minimize2, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

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
        "relative rounded-xl overflow-hidden bg-background/50 border border-border/50",
        "transition-all duration-300",
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
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity">
        <div className="absolute bottom-0 left-0 right-0 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-white text-sm font-medium truncate max-w-[150px]">
              {screen.username}
              {screen.isLocal && " (Vous)"}
            </span>
          </div>
          
          <div className="flex items-center gap-1">
            {!screen.isLocal && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={() => setIsMuted(!isMuted)}
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
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={onExpand}
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
                className="h-8 w-8 text-red-400 hover:bg-red-500/20"
                onClick={onStopLocal}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Live badge */}
      <div className="absolute top-3 left-3">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/90 text-white text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
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
    <div className="w-full h-full p-2">
      <div 
        className={cn(
          "grid gap-2 h-full",
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
