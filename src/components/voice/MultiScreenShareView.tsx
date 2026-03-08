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
  isMain,
  onSelect,
  onStopLocal 
}: { 
  screen: ScreenStream;
  isMain: boolean;
  onSelect: () => void;
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
      
      const audioTracks = screen.stream.getAudioTracks();
      setHasAudio(audioTracks.length > 0);

      // Re-attach if tracks change (prevents frozen frames)
      const handleTrackEnded = () => {
        if (videoRef.current) {
          videoRef.current.srcObject = screen.stream;
        }
      };
      screen.stream.getVideoTracks().forEach(t => {
        t.addEventListener('ended', handleTrackEnded);
        t.addEventListener('mute', handleTrackEnded);
      });

      return () => {
        screen.stream.getVideoTracks().forEach(t => {
          t.removeEventListener('ended', handleTrackEnded);
          t.removeEventListener('mute', handleTrackEnded);
        });
      };
    }
  }, [screen.stream, isMuted]);

  // Wheel zoom (main view only)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!isMain) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.25 : 0.25;
    const newZoom = Math.max(1, Math.min(4, zoom + delta));
    setZoom(newZoom);
    if (newZoom === 1) setPanOffset({ x: 0, y: 0 });
  }, [zoom, isMain]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1 || !isMain) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
  }, [zoom, panOffset, isMain]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || zoom <= 1) return;
    setPanOffset({
      x: e.clientX - panStartRef.current.x,
      y: e.clientY - panStartRef.current.y,
    });
  }, [isPanning, zoom]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

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

  const handleResetZoom = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative rounded-2xl overflow-hidden bg-black/80 border transition-all duration-300",
        isMain
          ? "border-primary/30 shadow-lg shadow-primary/10"
          : "border-white/[0.06] cursor-pointer hover:border-white/20 hover:shadow-md",
        zoom > 1 && isMain ? "cursor-grab" : "",
        isPanning ? "cursor-grabbing" : ""
      )}
      onClick={!isMain ? onSelect : undefined}
      onWheel={isMain ? handleWheel : undefined}
      onMouseDown={isMain ? handleMouseDown : undefined}
      onMouseMove={isMain ? handleMouseMove : undefined}
      onMouseUp={isMain ? handleMouseUp : undefined}
      onMouseLeave={isMain ? handleMouseUp : undefined}
      onDoubleClick={isMain ? handleFullscreen : undefined}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        className="w-full h-full object-contain bg-black transition-transform duration-100"
        style={{
          transform: zoom > 1 && isMain ? `scale(${zoom}) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)` : undefined,
          imageRendering: 'auto',
        }}
      />
      
      {/* Controls overlay - only on main or hover on thumbnails */}
      <div className={cn(
        "absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent transition-opacity duration-300",
        isMain ? "opacity-0 hover:opacity-100" : "opacity-0 hover:opacity-100"
      )}>
        <div className="absolute bottom-0 left-0 right-0 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-white text-xs font-semibold truncate max-w-[120px]">
              {screen.username}
              {screen.isLocal && " (Vous)"}
            </span>
            {hasAudio && (
              <span className="text-[9px] text-emerald-400 font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/20">
                🔊
              </span>
            )}
          </div>
          
          {isMain && (
            <div className="flex items-center gap-1">
              {zoom > 1 && (
                <span className="text-white/70 text-xs font-mono mr-1">{Math.round(zoom * 100)}%</span>
              )}
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-white hover:bg-white/20" onClick={handleWheel ? () => setZoom(z => Math.min(z + 0.5, 4)) : undefined} title="Zoom +">
                <ZoomIn className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className={cn("h-7 w-7 rounded-lg text-white hover:bg-white/20", zoom <= 1 && "opacity-30 pointer-events-none")} onClick={() => { const nz = Math.max(zoom - 0.5, 1); setZoom(nz); if (nz === 1) setPanOffset({ x: 0, y: 0 }); }} title="Zoom -">
                <ZoomOut className="h-3 w-3" />
              </Button>
              {(hasAudio || !screen.isLocal) && (
                <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-white hover:bg-white/20" onClick={() => setIsMuted(!isMuted)}>
                  {isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                </Button>
              )}
              {document.pictureInPictureEnabled && (
                <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-white hover:bg-white/20" onClick={handlePiP} title="PiP">
                  <PictureInPicture2 className="h-3 w-3" />
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-white hover:bg-white/20" onClick={handleFullscreen} title="Plein écran">
                <Maximize className="h-3 w-3" />
              </Button>
              {screen.isLocal && onStopLocal && (
                <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-destructive hover:bg-destructive/20" onClick={() => onStopLocal()}>
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
        </div>

        {isMain && zoom > 1 && (
          <div className="absolute top-3 right-3">
            <Button size="sm" variant="ghost" className="text-white/70 hover:text-white hover:bg-white/20 text-xs h-6 px-2 rounded-lg" onClick={handleResetZoom}>
              Reset zoom
            </Button>
          </div>
        )}
      </div>

      {/* LIVE badge */}
      <div className="absolute top-3 left-3">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-destructive/90 text-destructive-foreground text-[10px] font-bold shadow-lg shadow-destructive/30">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          LIVE
        </div>
      </div>

      {/* Thumbnail label when not main */}
      {!isMain && (
        <div className="absolute bottom-2 left-2 right-2">
          <span className="text-white text-[10px] font-medium bg-black/60 px-2 py-0.5 rounded">
            {screen.username}{screen.isLocal ? " (Vous)" : ""}
          </span>
        </div>
      )}
    </div>
  );
};

const MultiScreenShareView = ({ screens, onStopLocal }: MultiScreenShareViewProps) => {
  const [mainScreenId, setMainScreenId] = useState<string | null>(null);

  // Default to first screen or local screen as main
  useEffect(() => {
    if (screens.length === 0) {
      setMainScreenId(null);
      return;
    }
    if (!mainScreenId || !screens.find(s => s.odId === mainScreenId)) {
      // Prefer first remote screen, fallback to first
      const remote = screens.find(s => !s.isLocal);
      setMainScreenId(remote?.odId || screens[0].odId);
    }
  }, [screens, mainScreenId]);

  if (screens.length === 0) return null;

  const mainScreen = screens.find(s => s.odId === mainScreenId) || screens[0];
  const thumbnails = screens.filter(s => s.odId !== mainScreen.odId);

  // Single screen — full view
  if (screens.length === 1) {
    return (
      <div className="w-full h-full p-3">
        <ScreenTile
          screen={screens[0]}
          isMain={true}
          onSelect={() => {}}
          onStopLocal={screens[0].isLocal ? onStopLocal : undefined}
        />
      </div>
    );
  }

  // Multiple screens — main + sidebar thumbnails
  return (
    <div className="w-full h-full p-3 flex gap-3">
      {/* Main view */}
      <div className="flex-1 min-w-0">
        <ScreenTile
          screen={mainScreen}
          isMain={true}
          onSelect={() => {}}
          onStopLocal={mainScreen.isLocal ? onStopLocal : undefined}
        />
      </div>

      {/* Sidebar thumbnails */}
      <div className="w-48 flex flex-col gap-2 overflow-y-auto">
        {thumbnails.map((screen) => (
          <div key={screen.odId} className="aspect-video flex-shrink-0">
            <ScreenTile
              screen={screen}
              isMain={false}
              onSelect={() => setMainScreenId(screen.odId)}
              onStopLocal={screen.isLocal ? onStopLocal : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default MultiScreenShareView;
