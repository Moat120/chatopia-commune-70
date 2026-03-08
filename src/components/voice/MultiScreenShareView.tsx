import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X, Maximize2, Minimize2, Volume2, VolumeX, ZoomIn, ZoomOut, PictureInPicture2, Maximize } from "lucide-react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMuted, setIsMuted] = useState(screen.isLocal);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const [hasAudio, setHasAudio] = useState(false);

  useEffect(() => {
    if (videoRef.current && screen.stream) {
      videoRef.current.srcObject = screen.stream;
      videoRef.current.muted = isMuted;
      
      // Check if stream has audio tracks
      const audioTracks = screen.stream.getAudioTracks();
      setHasAudio(audioTracks.length > 0);
    }
  }, [screen.stream, isMuted]);

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.5, 4));
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom - 0.5, 1);
    setZoom(newZoom);
    if (newZoom === 1) setPanOffset({ x: 0, y: 0 });
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.25 : 0.25;
    const newZoom = Math.max(1, Math.min(4, zoom + delta));
    setZoom(newZoom);
    if (newZoom === 1) setPanOffset({ x: 0, y: 0 });
  }, [zoom]);

  // Pan when zoomed
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
  }, [zoom, panOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || zoom <= 1) return;
    setPanOffset({
      x: e.clientX - panStartRef.current.x,
      y: e.clientY - panStartRef.current.y,
    });
  }, [isPanning, zoom]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Picture-in-Picture
  const handlePiP = async () => {
    try {
      if (videoRef.current && document.pictureInPictureEnabled) {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await videoRef.current.requestPictureInPicture();
        }
      }
    } catch (e) {
      console.warn('[ScreenShare] PiP failed:', e);
    }
  };

  // Fullscreen
  const handleFullscreen = async () => {
    try {
      if (containerRef.current) {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          await containerRef.current.requestFullscreen();
        }
      }
    } catch (e) {
      console.warn('[ScreenShare] Fullscreen failed:', e);
    }
  };

  // Double-click to fullscreen
  const handleDoubleClick = () => {
    handleFullscreen();
  };

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative rounded-2xl overflow-hidden bg-black/50 border border-white/[0.06]",
        "transition-all duration-400",
        isExpanded ? "col-span-full row-span-full" : "",
        zoom > 1 ? "cursor-grab" : "",
        isPanning ? "cursor-grabbing" : ""
      )}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        className="w-full h-full object-contain bg-black transition-transform duration-100"
        style={{
          transform: zoom > 1 ? `scale(${zoom}) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)` : undefined,
        }}
      />
      
      {/* Overlay controls */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300">
        <div className="absolute bottom-0 left-0 right-0 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-white text-sm font-semibold truncate max-w-[150px]">
              {screen.username}
              {screen.isLocal && " (Vous)"}
            </span>
            {hasAudio && (
              <span className="text-[10px] text-emerald-400 font-medium px-2 py-0.5 rounded-full bg-emerald-500/20">
                🔊 Audio système
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-1.5">
            {/* Zoom controls */}
            {zoom > 1 && (
              <span className="text-white/70 text-xs font-mono mr-1">{Math.round(zoom * 100)}%</span>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-lg text-white hover:bg-white/20 transition-all duration-200"
              onClick={handleZoomIn}
              title="Zoom +"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                "h-8 w-8 rounded-lg text-white hover:bg-white/20 transition-all duration-200",
                zoom <= 1 && "opacity-30 pointer-events-none"
              )}
              onClick={handleZoomOut}
              title="Zoom -"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>

            {/* Audio mute (only for remote with audio or local) */}
            {(hasAudio || !screen.isLocal) && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-lg text-white hover:bg-white/20 transition-all duration-200"
                onClick={() => setIsMuted(!isMuted)}
              >
                {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </Button>
            )}

            {/* PiP */}
            {document.pictureInPictureEnabled && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-lg text-white hover:bg-white/20 transition-all duration-200"
                onClick={handlePiP}
                title="Picture-in-Picture"
              >
                <PictureInPicture2 className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* Fullscreen */}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-lg text-white hover:bg-white/20 transition-all duration-200"
              onClick={handleFullscreen}
              title="Plein écran"
            >
              <Maximize className="h-3.5 w-3.5" />
            </Button>
            
            {/* Expand */}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-lg text-white hover:bg-white/20 transition-all duration-200"
              onClick={onExpand}
            >
              {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
            
            {/* Stop local share */}
            {screen.isLocal && onStopLocal && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/20 transition-all duration-200"
                onClick={() => onStopLocal()}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Top bar with zoom reset */}
        {zoom > 1 && (
          <div className="absolute top-4 right-20">
            <Button
              size="sm"
              variant="ghost"
              className="text-white/70 hover:text-white hover:bg-white/20 text-xs h-7 px-2 rounded-lg"
              onClick={handleResetZoom}
            >
              Réinitialiser le zoom
            </Button>
          </div>
        )}
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
